"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";

import {
  TICKET_STATUSES,
  ticketStatusClasses,
  ticketStatusLabel,
  type Ticket,
  type TicketStatus,
} from "@/lib/ticket-types";

type TicketListResponse = {
  tickets?: Ticket[];
  error?: string;
};

type TicketCreateResponse = {
  success?: boolean;
  ticket?: Ticket;
  warnings?: string[];
  error?: string;
};

type TicketUpdateResponse = {
  success?: boolean;
  ticket?: Ticket;
  error?: string;
};

type TicketDeleteResponse = {
  success?: boolean;
  error?: string;
};

const PRIORITY_ORDER = ["urgent", "high", "medium", "low"] as const;
const STATUS_ORDER: TicketStatus[] = ["open", "in_progress", "resolved", "closed"];
const PAGE_SIZE = 6;
const DEFAULT_CATEGORIES = [
  "billing",
  "technical_issue",
  "account_access",
  "bug_report",
  "feature_request",
  "security",
  "general",
  "other",
];

function formatLabel(value: string) {
  return value
    .split("_")
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" ");
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function priorityClasses(priority: string) {
  switch (priority) {
    case "urgent":
      return "bg-red-100 text-red-700 ring-1 ring-red-200";
    case "high":
      return "bg-orange-100 text-orange-700 ring-1 ring-orange-200";
    case "medium":
      return "bg-yellow-100 text-yellow-800 ring-1 ring-yellow-200";
    case "low":
      return "bg-emerald-100 text-emerald-700 ring-1 ring-emerald-200";
    default:
      return "bg-yellow-100 text-yellow-800 ring-1 ring-yellow-200";
  }
}

function ticketMatchesSearch(ticket: Ticket, searchQuery: string) {
  if (!searchQuery) {
    return true;
  }

  const searchableText = [
    ticket.raw_text,
    ticket.category,
    ticket.priority,
    ticket.status,
    ticket.assignee,
    ticket.extracted_fields.subject,
    ticket.extracted_fields.requester,
    ticket.extracted_fields.issue_summary,
  ]
    .join(" ")
    .toLowerCase();

  return searchableText.includes(searchQuery);
}

function copyTextToClipboard(text: string) {
  if (navigator.clipboard?.writeText) {
    return navigator.clipboard.writeText(text);
  }

  const textarea = document.createElement("textarea");

  textarea.value = text;
  textarea.setAttribute("readonly", "true");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();

  const copied = document.execCommand("copy");

  document.body.removeChild(textarea);

  if (!copied) {
    throw new Error("Clipboard unavailable.");
  }

  return Promise.resolve();
}

function emptyTicketSummary() {
  return {
    total: 0,
    open: 0,
    inProgress: 0,
    resolved: 0,
    urgent: 0,
  };
}

export default function TriagePage() {
  const [rawText, setRawText] = useState("");
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [loadingTickets, setLoadingTickets] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [copiedReplyId, setCopiedReplyId] = useState<string | null>(null);
  const [deletingTicketId, setDeletingTicketId] = useState<string | null>(null);
  const [bulkWorking, setBulkWorking] = useState(false);
  const [selectedTicketIds, setSelectedTicketIds] = useState<string[]>([]);
  const [bulkAssignee, setBulkAssignee] = useState("");
  const [page, setPage] = useState(1);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const modalFocusTimeoutRef = useRef<number | null>(null);
  const modalCloseTimeoutRef = useRef<number | null>(null);
  const copyResetTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    if (!modalOpen) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [modalOpen]);

  useEffect(() => {
    if (!modalOpen) {
      return;
    }

    if (modalFocusTimeoutRef.current !== null) {
      window.clearTimeout(modalFocusTimeoutRef.current);
    }

    modalFocusTimeoutRef.current = window.setTimeout(() => {
      textareaRef.current?.focus();
    }, 50);

    return () => {
      if (modalFocusTimeoutRef.current !== null) {
        window.clearTimeout(modalFocusTimeoutRef.current);
        modalFocusTimeoutRef.current = null;
      }
    };
  }, [modalOpen]);

  useEffect(() => {
    if (!statusMessage) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setStatusMessage(null);
    }, 3500);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [statusMessage]);

  async function loadTickets() {
    setLoadingTickets(true);
    setError(null);

    try {
      const response = await fetch("/api/tickets", {
        cache: "no-store",
      });
      const data = (await response.json()) as TicketListResponse;

      if (!response.ok) {
        throw new Error(data.error ?? "Failed to load operational incidents.");
      }

      const nextTickets = data.tickets ?? [];

      setTickets(nextTickets);
      setSelectedTicketIds((current) => current.filter((ticketId) => nextTickets.some((ticket) => ticket.id === ticketId)));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load operational incidents.");
    } finally {
      setLoadingTickets(false);
    }
  }

  useEffect(() => {
    const initialLoadTimeout = window.setTimeout(() => {
      void loadTickets();
    }, 0);

    return () => {
      window.clearTimeout(initialLoadTimeout);

      if (copyResetTimeoutRef.current !== null) {
        window.clearTimeout(copyResetTimeoutRef.current);
      }
      if (modalFocusTimeoutRef.current !== null) {
        window.clearTimeout(modalFocusTimeoutRef.current);
      }
      if (modalCloseTimeoutRef.current !== null) {
        window.clearTimeout(modalCloseTimeoutRef.current);
      }
    };
  }, []);

  function openModal() {
    if (modalCloseTimeoutRef.current !== null) {
      window.clearTimeout(modalCloseTimeoutRef.current);
      modalCloseTimeoutRef.current = null;
    }

    setFormError(null);
    setStatusMessage(null);
    setModalOpen(true);
  }

  function closeModal() {
    if (modalCloseTimeoutRef.current !== null) {
      window.clearTimeout(modalCloseTimeoutRef.current);
      modalCloseTimeoutRef.current = null;
    }

    if (modalFocusTimeoutRef.current !== null) {
      window.clearTimeout(modalFocusTimeoutRef.current);
      modalFocusTimeoutRef.current = null;
    }

    setModalOpen(false);
    setRawText("");
    setFormError(null);
    setStatusMessage(null);
  }

  async function handleCopyReply(ticketId: string, suggestedReply: string) {
    try {
      await copyTextToClipboard(suggestedReply);
      setCopiedReplyId(ticketId);

      if (copyResetTimeoutRef.current !== null) {
        window.clearTimeout(copyResetTimeoutRef.current);
      }

      copyResetTimeoutRef.current = window.setTimeout(() => {
        setCopiedReplyId((current) => (current === ticketId ? null : current));
      }, 2000);
    } catch {
      setError("Unable to copy the suggested reply to the clipboard.");
    }
  }

  async function deleteTicketFromServer(ticketId: string) {
    const response = await fetch(`/api/tickets/${ticketId}`, {
      method: "DELETE",
    });
    const data = (await response.json().catch(() => null)) as TicketDeleteResponse | null;

    if (!response.ok || !data?.success) {
      throw new Error(data?.error ?? "Failed to delete the incident.");
    }

    setTickets((current) => current.filter((ticket) => ticket.id !== ticketId));
    setSelectedTicketIds((current) => current.filter((selectedId) => selectedId !== ticketId));

    if (copiedReplyId === ticketId) {
      setCopiedReplyId(null);
    }
  }

  async function handleDeleteTicket(ticketId: string) {
    const confirmed = window.confirm("Delete this operational incident from the dashboard?");

    if (!confirmed) {
      return;
    }

    setDeletingTicketId(ticketId);
    setError(null);

    try {
      await deleteTicketFromServer(ticketId);
      setStatusMessage("Operational incident deleted.");
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Failed to delete the incident.");
    } finally {
      setDeletingTicketId(null);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!rawText.trim()) {
      setFormError("Enter an operational incident or site report before submitting.");
      return;
    }

    setSubmitting(true);
    setFormError(null);
    setStatusMessage(null);

    try {
      const response = await fetch("/api/tickets", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ rawText }),
      });

      const data = (await response.json()) as TicketCreateResponse;
      const savedTicket = data.ticket;

      if (!response.ok || !data.success || !savedTicket) {
        throw new Error(data.error ?? "Failed to classify the incident.");
      }

      setTickets((current) => [savedTicket, ...current.filter((ticket) => ticket.id !== savedTicket.id)]);
      setSelectedTicketIds([savedTicket.id]);
      setStatusMessage(
        data.warnings && data.warnings.length > 0
          ? "Site report saved with a fallback warning."
          : "Operational incident triaged and saved successfully.",
      );

      if (modalCloseTimeoutRef.current !== null) {
        window.clearTimeout(modalCloseTimeoutRef.current);
      }

      modalCloseTimeoutRef.current = window.setTimeout(() => {
        closeModal();
      }, 1400);
    } catch (submitError) {
      setFormError(submitError instanceof Error ? submitError.message : "Failed to classify the incident.");
    } finally {
      setSubmitting(false);
    }
  }

  async function updateTicket(ticket: Ticket, overrides: Partial<Pick<Ticket, "status" | "assignee">>) {
    const mergedTicket: Ticket = {
      ...ticket,
      ...overrides,
    };

    const response = await fetch(`/api/tickets/${ticket.id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(mergedTicket),
    });

    const data = (await response.json()) as TicketUpdateResponse;

    if (!response.ok || !data.success || !data.ticket) {
      throw new Error(data.error ?? "Failed to save the incident.");
    }

    return data.ticket;
  }

  async function handleBulkStatusChange(status: TicketStatus) {
    if (selectedTickets.length === 0) {
      return;
    }

    setBulkWorking(true);
    setError(null);

    try {
      const updatedTickets = await Promise.all(selectedTickets.map((ticket) => updateTicket(ticket, { status })));

      setTickets((current) =>
        current.map((ticket) => updatedTickets.find((updatedTicket) => updatedTicket.id === ticket.id) ?? ticket),
      );

      setStatusMessage(
        `${selectedTickets.length} incident${selectedTickets.length === 1 ? "" : "s"} moved to ${ticketStatusLabel(status).toLowerCase()}.`,
      );
      setSelectedTicketIds([]);
    } catch (bulkError) {
      setError(bulkError instanceof Error ? bulkError.message : "Failed to update selected incidents.");
    } finally {
      setBulkWorking(false);
    }
  }

  async function handleBulkAssign() {
    const assignee = bulkAssignee.trim();

    if (!assignee || selectedTickets.length === 0) {
      return;
    }

    setBulkWorking(true);
    setError(null);

    try {
      const updatedTickets = await Promise.all(selectedTickets.map((ticket) => updateTicket(ticket, { assignee })));

      setTickets((current) =>
        current.map((ticket) => updatedTickets.find((updatedTicket) => updatedTicket.id === ticket.id) ?? ticket),
      );
      setStatusMessage(
        `${selectedTickets.length} incident${selectedTickets.length === 1 ? "" : "s"} assigned to ${assignee}.`,
      );
      setBulkAssignee("");
      setSelectedTicketIds([]);
    } catch (bulkError) {
      setError(bulkError instanceof Error ? bulkError.message : "Failed to assign the selected incidents.");
    } finally {
      setBulkWorking(false);
    }
  }

  async function handleBulkCopyReplies() {
    if (selectedTickets.length === 0) {
      return;
    }

    try {
      const combinedReplies = selectedTickets.map((ticket) => ticket.suggested_reply).join("\n\n---\n\n");
      await copyTextToClipboard(combinedReplies);
      setStatusMessage(
        `Copied ${selectedTickets.length} suggested reply${selectedTickets.length === 1 ? "" : "ies"}.`,
      );
    } catch {
      setError("Unable to copy the selected suggested replies to the clipboard.");
    }
  }

  async function handleBulkDelete() {
    if (selectedTickets.length === 0) {
      return;
    }

    const confirmed = window.confirm(
      `Delete ${selectedTickets.length} selected incident${selectedTickets.length === 1 ? "" : "s"}?`,
    );

    if (!confirmed) {
      return;
    }

    setBulkWorking(true);
    setError(null);

    try {
      await Promise.all(selectedTickets.map((ticket) => deleteTicketFromServer(ticket.id)));
      setSelectedTicketIds([]);
      setStatusMessage(`Deleted ${selectedTickets.length} selected incident${selectedTickets.length === 1 ? "" : "s"}.`);
    } catch (bulkError) {
      setError(bulkError instanceof Error ? bulkError.message : "Failed to delete selected incidents.");
    } finally {
      setBulkWorking(false);
    }
  }

  function toggleTicketSelection(ticketId: string) {
    setSelectedTicketIds((current) =>
      current.includes(ticketId) ? current.filter((selectedId) => selectedId !== ticketId) : [...current, ticketId],
    );
  }

  function toggleVisibleTicketsSelection() {
    setSelectedTicketIds((current) => {
      if (allVisibleSelected) {
        return current.filter((ticketId) => !visibleSelectedIds.has(ticketId));
      }

      return Array.from(new Set([...current, ...pagedTickets.map((ticket) => ticket.id)]));
    });
  }

  const normalizedSearchQuery = searchQuery.trim().toLowerCase();
  const sortedTickets = useMemo(() => {
    const statusRank = new Map<TicketStatus, number>(STATUS_ORDER.map((status, index) => [status, index]));
    const priorityRank = new Map<string, number>(PRIORITY_ORDER.map((priority, index) => [priority, index]));

    return [...tickets].sort((left, right) => {
      const statusDifference = (statusRank.get(left.status) ?? 99) - (statusRank.get(right.status) ?? 99);

      if (statusDifference !== 0) {
        return statusDifference;
      }

      const priorityDifference = (priorityRank.get(left.priority) ?? 99) - (priorityRank.get(right.priority) ?? 99);

      if (priorityDifference !== 0) {
        return priorityDifference;
      }

      return new Date(right.updated_at).getTime() - new Date(left.updated_at).getTime();
    });
  }, [tickets]);

  const filteredTickets = sortedTickets.filter((ticket) => {
    const categoryMatches = categoryFilter === "all" || ticket.category === categoryFilter;
    const priorityMatches = priorityFilter === "all" || ticket.priority === priorityFilter;
    const statusMatches = statusFilter === "all" || ticket.status === statusFilter;
    const searchMatches = ticketMatchesSearch(ticket, normalizedSearchQuery);

    return categoryMatches && priorityMatches && statusMatches && searchMatches;
  });

  const pageCount = Math.max(1, Math.ceil(filteredTickets.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const pagedTickets = filteredTickets.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);
  const visibleSelectedIds = new Set(pagedTickets.map((ticket) => ticket.id));
  const allVisibleSelected = pagedTickets.length > 0 && pagedTickets.every((ticket) => selectedTicketIds.includes(ticket.id));
  const selectedTickets = tickets.filter((ticket) => selectedTicketIds.includes(ticket.id));
  const selectedCount = selectedTickets.length;
  const summary = tickets.reduce(
    (accumulator, ticket) => {
      accumulator.total += 1;

      if (ticket.status === "open") {
        accumulator.open += 1;
      }

      if (ticket.status === "in_progress") {
        accumulator.inProgress += 1;
      }

      if (ticket.status === "resolved") {
        accumulator.resolved += 1;
      }

      if (ticket.priority === "urgent") {
        accumulator.urgent += 1;
      }

      return accumulator;
    },
    emptyTicketSummary(),
  );

  const categoryOptions = Array.from(new Set([...DEFAULT_CATEGORIES, ...tickets.map((ticket) => ticket.category)])).sort();
  const priorityOptions = PRIORITY_ORDER.filter((priority) => tickets.some((ticket) => ticket.priority === priority));
  const pageStart = filteredTickets.length === 0 ? 0 : (safePage - 1) * PAGE_SIZE + 1;
  const pageEnd = Math.min(safePage * PAGE_SIZE, filteredTickets.length);

  return (
    <main className="relative min-h-screen overflow-hidden px-4 py-6 sm:px-6 lg:px-8">
      <div className="absolute inset-x-0 top-0 -z-10 h-[24rem] bg-[radial-gradient(circle_at_top_left,rgba(14,165,233,0.16),transparent_36%),radial-gradient(circle_at_top_right,rgba(245,158,11,0.14),transparent_30%),linear-gradient(180deg,rgba(255,255,255,0.94),rgba(241,245,249,0.7))]" />

      <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-6">
        <header className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
            <div className="max-w-2xl">
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">
                Operational Incident Triage
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-3">
                <h1 className="text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">
                  Classify site reports, extract fields, and keep the shift queue organized.
                </h1>
                <span className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-slate-600">
                  {tickets.length === 1 ? "1 incident" : `${tickets.length} incidents`}
                </span>
              </div>
              <p className="mt-3 text-base leading-7 text-slate-600">
                Submit unstructured site incident reports, send them through the local Phi-3 Mini
                model, and store a structured incident record in PostgreSQL.
              </p>
            </div>

            <nav className="flex flex-wrap gap-3 text-sm font-medium text-slate-600">
              <Link
                href="/"
                className="rounded-full border border-slate-200 bg-slate-50 px-4 py-2 transition hover:border-slate-300 hover:bg-white"
              >
                Home
              </Link>
              <Link
                href="/rag"
                className="rounded-full border border-slate-200 bg-slate-50 px-4 py-2 transition hover:border-emerald-200 hover:bg-emerald-50 hover:text-emerald-700"
              >
                Mining Knowledge Base
              </Link>
              <button
                type="button"
                onClick={openModal}
                className="inline-flex items-center gap-2 rounded-full bg-slate-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
              >
                <span aria-hidden="true" className="text-base leading-none">
                  +
                </span>
                Log incident
              </button>
            </nav>
          </div>

          <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-xl border border-slate-200 bg-white px-4 py-4">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">
                Total incidents
              </p>
              <p className="mt-2 text-3xl font-semibold text-slate-950">{summary.total}</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white px-4 py-4">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">
                Open queue
              </p>
              <p className="mt-2 text-3xl font-semibold text-slate-950">{summary.open}</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white px-4 py-4">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">
                In progress
              </p>
              <p className="mt-2 text-3xl font-semibold text-slate-950">{summary.inProgress}</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white px-4 py-4">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">
                Urgent items
              </p>
              <p className="mt-2 text-3xl font-semibold text-slate-950">{summary.urgent}</p>
            </div>
          </div>
        </header>

        <section className="min-w-0 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-5 border-b border-slate-200 pb-5">
            <div className="max-w-3xl">
              <h2 className="text-xl font-semibold text-slate-950">Operational incident dashboard</h2>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                Filter site reports by text search, status, category, and priority. Select rows for
                bulk updates, or open the detail panel to edit a single incident.
              </p>
            </div>

            <div className="grid gap-3 xl:grid-cols-[minmax(0,1.7fr)_repeat(4,minmax(10rem,auto))] xl:items-end">
              <label className="block">
                <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">
                  Search incidents
                </span>
                <input
                  type="search"
                  value={searchQuery}
                  onChange={(event) => {
                    setSearchQuery(event.target.value);
                    setPage(1);
                  }}
                  placeholder="Search raw reports, reporters, assignees, or issue summaries..."
                  className="w-full rounded-full border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 shadow-inner outline-none transition placeholder:text-slate-400 focus:border-sky-300 focus:ring-4 focus:ring-sky-100"
                />
              </label>

              <label className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">
                <span className="mb-2 block">Status</span>
                <select
                  value={statusFilter}
                  onChange={(event) => {
                    setStatusFilter(event.target.value);
                    setPage(1);
                  }}
                  className="min-w-36 rounded-full border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-700 outline-none transition focus:border-sky-300 focus:ring-4 focus:ring-sky-100"
                >
                  <option value="all">All statuses</option>
                  {TICKET_STATUSES.map((status) => (
                    <option key={status} value={status}>
                      {ticketStatusLabel(status)}
                    </option>
                  ))}
                </select>
              </label>

              <label className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">
                <span className="mb-2 block">Category</span>
                <select
                  value={categoryFilter}
                  onChange={(event) => {
                    setCategoryFilter(event.target.value);
                    setPage(1);
                  }}
                  className="min-w-40 rounded-full border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-700 outline-none transition focus:border-sky-300 focus:ring-4 focus:ring-sky-100"
                >
                  <option value="all">All categories</option>
                  {categoryOptions.map((category) => (
                    <option key={category} value={category}>
                      {formatLabel(category)}
                    </option>
                  ))}
                </select>
              </label>

              <label className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">
                <span className="mb-2 block">Priority</span>
                <select
                  value={priorityFilter}
                  onChange={(event) => {
                    setPriorityFilter(event.target.value);
                    setPage(1);
                  }}
                  className="min-w-36 rounded-full border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-700 outline-none transition focus:border-sky-300 focus:ring-4 focus:ring-sky-100"
                >
                  <option value="all">All priorities</option>
                  {priorityOptions.map((priority) => (
                    <option key={priority} value={priority}>
                      {formatLabel(priority)}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
              <span className="font-semibold text-slate-800">Bulk actions</span>
              <span>{selectedCount} selected</span>
              <button
                type="button"
                onClick={toggleVisibleTicketsSelection}
                className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:border-sky-200 hover:bg-sky-50 hover:text-sky-700"
              >
                {allVisibleSelected ? "Clear page" : "Select page"}
              </button>
              <button
                type="button"
                onClick={() => void handleBulkStatusChange("in_progress")}
                disabled={bulkWorking || selectedCount === 0}
                className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-700 transition hover:border-amber-300 hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Mark in progress
              </button>
              <button
                type="button"
                onClick={() => void handleBulkStatusChange("resolved")}
                disabled={bulkWorking || selectedCount === 0}
                className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 transition hover:border-emerald-300 hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Mark resolved
              </button>
              <button
                type="button"
                onClick={() => void handleBulkStatusChange("closed")}
                disabled={bulkWorking || selectedCount === 0}
                className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Close selected
              </button>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="text"
                  value={bulkAssignee}
                  onChange={(event) => setBulkAssignee(event.target.value)}
                  placeholder="Assign selected to..."
                  className="min-w-56 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm text-slate-900 shadow-inner outline-none transition placeholder:text-slate-400 focus:border-sky-300 focus:ring-4 focus:ring-sky-100"
                />
                <button
                  type="button"
                  onClick={() => void handleBulkAssign()}
                  disabled={bulkWorking || selectedCount === 0 || !bulkAssignee.trim()}
                  className="rounded-full border border-sky-200 bg-sky-50 px-3 py-1.5 text-xs font-semibold text-sky-700 transition hover:border-sky-300 hover:bg-sky-100 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Assign
                </button>
              </div>
              <button
                type="button"
                onClick={() => void handleBulkCopyReplies()}
                disabled={selectedCount === 0}
                className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Copy replies
              </button>
              <button
                type="button"
                onClick={() => void handleBulkDelete()}
                disabled={bulkWorking || selectedCount === 0}
                className="rounded-full border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-700 transition hover:border-rose-300 hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Delete selected
              </button>
            </div>
          </div>

          {error ? (
            <div className="mt-5 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              {error}
            </div>
          ) : null}

          <div className="mt-5 grid gap-6">
            <div className="min-w-0 rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-4 text-sm text-slate-600">
                <p>
                  Showing {filteredTickets.length === 0 ? 0 : pageStart} to {pageEnd} of {filteredTickets.length} incident
                  {filteredTickets.length === 1 ? "" : "s"}
                </p>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setPage((current) => Math.max(1, current - 1))}
                    disabled={safePage <= 1}
                    className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Previous
                  </button>
                  <span className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">
                    Page {safePage} / {pageCount}
                  </span>
                  <button
                    type="button"
                    onClick={() => setPage((current) => Math.min(pageCount, current + 1))}
                    disabled={safePage >= pageCount}
                    className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Next
                  </button>
                </div>
              </div>

              {loadingTickets ? (
                <div className="space-y-4 p-5">
                  <div className="grid gap-4 lg:hidden">
                    {Array.from({ length: 3 }).map((_, index) => (
                      <div key={index} className="animate-pulse rounded-3xl border border-slate-200 bg-slate-50 p-4">
                        <div className="h-4 w-3/4 rounded-full bg-slate-200" />
                        <div className="mt-3 h-3 w-1/2 rounded-full bg-slate-200" />
                        <div className="mt-4 h-20 rounded-2xl bg-slate-100" />
                      </div>
                    ))}
                  </div>
                  <div className="hidden overflow-hidden rounded-3xl border border-slate-200 lg:block">
                    <div className="animate-pulse space-y-4 p-5">
                      {Array.from({ length: 4 }).map((_, index) => (
                        <div key={index} className="space-y-3 rounded-3xl border border-slate-200 bg-slate-50 p-5">
                          <div className="h-4 w-3/4 rounded-full bg-slate-200" />
                          <div className="h-3 w-1/2 rounded-full bg-slate-200" />
                          <div className="h-24 rounded-2xl bg-slate-100" />
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ) : filteredTickets.length === 0 ? (
                <div className="px-6 py-16 text-center text-sm text-slate-500">
                  No operational incidents match the current search and filters.
                </div>
              ) : (
                <>
                  <div className="hidden overflow-x-auto lg:block">
                    <table className="min-w-[1200px] divide-y divide-slate-200 text-left">
                      <thead className="bg-slate-50">
                        <tr className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                          <th className="px-5 py-4">
                            <input
                              type="checkbox"
                              checked={allVisibleSelected}
                              onChange={toggleVisibleTicketsSelection}
                              className="h-4 w-4 rounded border-slate-300 text-sky-600 focus:ring-sky-500"
                              aria-label="Select visible incidents"
                            />
                          </th>
                          <th className="px-5 py-4">Incident</th>
                          <th className="px-5 py-4">Status</th>
                          <th className="px-5 py-4">Category</th>
                          <th className="px-5 py-4">Priority</th>
                          <th className="px-5 py-4">Suggested reply</th>
                          <th className="px-5 py-4">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200 bg-white">
                        {pagedTickets.map((ticket) => (
                          <tr key={ticket.id} className="align-top transition hover:bg-slate-50/80">
                            <td className="px-5 py-5 align-middle">
                              <input
                                type="checkbox"
                                checked={selectedTicketIds.includes(ticket.id)}
                                onChange={() => toggleTicketSelection(ticket.id)}
                                className="h-4 w-4 rounded border-slate-300 text-sky-600 focus:ring-sky-500"
                                aria-label={`Select incident ${ticket.extracted_fields.subject}`}
                              />
                            </td>
                            <td className="px-5 py-5">
                              <div className="max-w-xl space-y-2">
                                <div className="flex flex-wrap items-center gap-2">
                                  <p className="font-semibold text-slate-950">
                                    {ticket.extracted_fields.subject}
                                  </p>
                                  <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">
                                    {formatDate(ticket.created_at)}
                                  </span>
                                </div>
                                <p className="text-sm text-slate-600">
                                  <span className="font-medium text-slate-700">Reporter:</span>{" "}
                                  {ticket.extracted_fields.requester}
                                </p>
                                <p className="text-sm text-slate-600">
                                  <span className="font-medium text-slate-700">Assignee:</span>{" "}
                                  {ticket.assignee || "Unassigned"}
                                </p>
                                <p className="text-sm leading-6 text-slate-600">
                                  {ticket.extracted_fields.issue_summary}
                                </p>
                                <p className="rounded-2xl bg-slate-50 px-4 py-3 text-sm leading-6 text-slate-700 ring-1 ring-slate-200/80">
                                  {ticket.raw_text}
                                </p>
                              </div>
                            </td>
                            <td className="px-5 py-5">
                              <span
                                className={`inline-flex rounded-full px-3 py-1 text-sm font-semibold ${ticketStatusClasses(ticket.status)}`}
                              >
                                {ticketStatusLabel(ticket.status)}
                              </span>
                            </td>
                            <td className="px-5 py-5">
                              <span className="inline-flex rounded-full bg-sky-50 px-3 py-1 text-sm font-medium text-sky-700 ring-1 ring-sky-200">
                                {formatLabel(ticket.category)}
                              </span>
                            </td>
                            <td className="px-5 py-5">
                              <span
                                className={`inline-flex rounded-full px-3 py-1 text-sm font-semibold ${priorityClasses(ticket.priority)}`}
                              >
                                {formatLabel(ticket.priority)}
                              </span>
                            </td>
                            <td className="px-5 py-5">
                              <div className="max-w-xl space-y-3">
                                <div className="flex items-center justify-between gap-3">
                                  <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">
                                    Suggested reply
                                  </p>
                                  <button
                                    type="button"
                                    onClick={() => void handleCopyReply(ticket.id, ticket.suggested_reply)}
                                    className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:border-sky-200 hover:bg-sky-50 hover:text-sky-700"
                                  >
                                    {copiedReplyId === ticket.id ? "Copied!" : "Copy"}
                                  </button>
                                </div>
                                <div className="rounded-2xl bg-slate-50 p-4 text-sm leading-7 text-slate-700 ring-1 ring-slate-200/80">
                                  {ticket.suggested_reply}
                                </div>
                              </div>
                            </td>
                            <td className="px-5 py-5">
                              <div className="flex flex-wrap gap-2">
                                <button
                                  type="button"
                                  onClick={() => void handleDeleteTicket(ticket.id)}
                                  disabled={deletingTicketId === ticket.id}
                                  className="inline-flex items-center justify-center rounded-full border border-rose-200 bg-rose-50 px-4 py-2 text-sm font-semibold text-rose-700 transition hover:border-rose-300 hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-60"
                                >
                                  {deletingTicketId === ticket.id ? "Deleting..." : "Delete"}
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div className="grid gap-4 p-4 lg:hidden">
                    {pagedTickets.map((ticket) => (
                      <article key={ticket.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0 space-y-2">
                            <div className="flex flex-wrap items-center gap-2">
                              <input
                                type="checkbox"
                                checked={selectedTicketIds.includes(ticket.id)}
                                onChange={() => toggleTicketSelection(ticket.id)}
                                className="h-4 w-4 rounded border-slate-300 text-sky-600 focus:ring-sky-500"
                                aria-label={`Select incident ${ticket.extracted_fields.subject}`}
                              />
                              <span
                                className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${ticketStatusClasses(ticket.status)}`}
                              >
                                {ticketStatusLabel(ticket.status)}
                              </span>
                              <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">
                                {formatDate(ticket.updated_at)}
                              </span>
                            </div>
                            <p className="text-lg font-semibold text-slate-950">{ticket.extracted_fields.subject}</p>
                            <p className="text-sm text-slate-600">
                              <span className="font-medium text-slate-700">Reporter:</span>{" "}
                              {ticket.extracted_fields.requester}
                            </p>
                            <p className="text-sm text-slate-600">
                              <span className="font-medium text-slate-700">Assignee:</span>{" "}
                              {ticket.assignee || "Unassigned"}
                            </p>
                          </div>
                        </div>

                        <p className="mt-4 rounded-2xl bg-slate-50 px-4 py-3 text-sm leading-6 text-slate-700 ring-1 ring-slate-200/80">
                          {ticket.extracted_fields.issue_summary}
                        </p>

                        <div className="mt-3 flex flex-wrap gap-2">
                          <span className="inline-flex rounded-full bg-sky-50 px-3 py-1 text-xs font-medium text-sky-700 ring-1 ring-sky-200">
                            {formatLabel(ticket.category)}
                          </span>
                          <span
                            className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${priorityClasses(ticket.priority)}`}
                          >
                            {formatLabel(ticket.priority)}
                          </span>
                        </div>

                        <div className="mt-4 rounded-2xl bg-slate-50 p-4 text-sm leading-7 text-slate-700 ring-1 ring-slate-200/80">
                          {ticket.suggested_reply}
                        </div>

                        <div className="mt-4 flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => void handleCopyReply(ticket.id, ticket.suggested_reply)}
                            className="rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:border-sky-200 hover:bg-sky-50 hover:text-sky-700"
                          >
                            {copiedReplyId === ticket.id ? "Copied!" : "Copy reply"}
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleDeleteTicket(ticket.id)}
                            disabled={deletingTicketId === ticket.id}
                            className="rounded-full border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700 transition hover:border-rose-300 hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {deletingTicketId === ticket.id ? "Deleting..." : "Delete"}
                          </button>
                        </div>
                      </article>
                    ))}
                  </div>
                </>
              )}
            </div>

          </div>

          {statusMessage ? (
            <div className="mt-5 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
              {statusMessage}
            </div>
          ) : null}
        </section>
      </div>

      {modalOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center px-4 py-6 sm:px-6"
          onClick={closeModal}
        >
          <div className="absolute inset-0 bg-slate-950/40 backdrop-blur-sm" />
          <div
            className="relative z-10 w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-[1.75rem] border border-white/80 bg-white p-6 shadow-[0_30px_90px_-40px_rgba(15,23,42,0.75)]"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4">
              <div className="max-w-md">
                <div className="flex flex-wrap items-center gap-3">
                  <h2 className="text-xl font-semibold text-slate-950">
                    Log an operational incident
                  </h2>
                  <span className="rounded-full bg-sky-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.22em] text-sky-700 ring-1 ring-sky-200">
                    Structured output
                  </span>
                </div>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  Paste a raw site incident report. The API will call Ollama, normalize the
                  response, and persist the structured result.
                </p>
              </div>
              <button
                type="button"
                onClick={closeModal}
                className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-slate-50 text-lg font-semibold text-slate-600 transition hover:border-slate-300 hover:bg-white hover:text-slate-900"
                aria-label="Close modal"
              >
                ✕
              </button>
            </div>

            <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
              <label className="block">
                <span className="mb-2 block text-sm font-medium text-slate-700">
                  Operational incident text
                </span>
                <textarea
                  ref={textareaRef}
                  value={rawText}
                  onChange={(event) => setRawText(event.target.value)}
                  placeholder="Safety equipment malfunction reported at Site B. Worker: James Mutua. Drill press showing abnormal vibration since yesterday morning. This is affecting production output."
                  className="min-h-56 w-full rounded-3xl border border-slate-200 bg-white px-4 py-3 text-sm leading-7 text-slate-900 shadow-inner outline-none transition placeholder:text-slate-400 focus:border-sky-300 focus:ring-4 focus:ring-sky-100"
                />
              </label>

              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="submit"
                  disabled={submitting}
                  className="inline-flex items-center justify-center rounded-full bg-slate-950 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-slate-950/20 transition hover:-translate-y-0.5 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {submitting ? "Classifying incident..." : "Classify incident"}
                </button>
                <button
                  type="button"
                  onClick={() => setRawText("")}
                  className="inline-flex items-center justify-center rounded-full border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
                >
                  Clear
                </button>
              </div>
            </form>

            {formError ? (
              <div className="mt-5 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                {formError}
              </div>
            ) : null}

            {statusMessage ? (
              <div className="mt-5 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
                {statusMessage}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </main>
  );
}
