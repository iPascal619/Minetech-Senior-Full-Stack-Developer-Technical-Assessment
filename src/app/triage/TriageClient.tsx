"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";

type TicketFields = {
  subject: string;
  requester: string;
  issue_summary: string;
};

type Ticket = {
  id: string;
  raw_text: string;
  category: string;
  priority: string;
  extracted_fields: TicketFields;
  suggested_reply: string;
  created_at: string;
};

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
      return "bg-green-100 text-green-700 ring-1 ring-green-200";
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

export default function TriagePage() {
  const [rawText, setRawText] = useState("");
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [loadingTickets, setLoadingTickets] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [copiedReplyId, setCopiedReplyId] = useState<string | null>(null);
  const [deletingTicketId, setDeletingTicketId] = useState<string | null>(null);
  const copyResetTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    void loadTickets();

    return () => {
      if (copyResetTimeoutRef.current !== null) {
        window.clearTimeout(copyResetTimeoutRef.current);
      }
    };
  }, []);

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

      setTickets(data.tickets ?? []);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load operational incidents.");
    } finally {
      setLoadingTickets(false);
    }
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

  async function handleDeleteTicket(ticketId: string) {
    const confirmed = window.confirm("Delete this operational incident from the dashboard?");

    if (!confirmed) {
      return;
    }

    setDeletingTicketId(ticketId);
    setError(null);

    try {
      const response = await fetch(`/api/tickets/${ticketId}`, {
        method: "DELETE",
      });
      const data = (await response.json().catch(() => null)) as
        | { success?: boolean; error?: string }
        | null;

      if (!response.ok || !data?.success) {
        throw new Error(data?.error ?? "Failed to delete the incident.");
      }

      setTickets((current) => current.filter((ticket) => ticket.id !== ticketId));

      if (copiedReplyId === ticketId) {
        setCopiedReplyId(null);
      }
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Failed to delete the incident.");
    } finally {
      setDeletingTicketId(null);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!rawText.trim()) {
      setError("Enter an operational incident or site report before submitting.");
      return;
    }

    setSubmitting(true);
    setError(null);
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
      setRawText("");
      setStatusMessage(
        data.warnings && data.warnings.length > 0
          ? "Site report saved with a fallback warning."
          : "Operational incident triaged and saved successfully.",
      );
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Failed to classify the incident.");
    } finally {
      setSubmitting(false);
    }
  }

  const categoryOptions = Array.from(new Set(tickets.map((ticket) => ticket.category))).sort();
  const priorityOrder = ["urgent", "high", "medium", "low"];
  const priorityOptions = priorityOrder.filter((priority) =>
    tickets.some((ticket) => ticket.priority === priority),
  );
  const normalizedSearchQuery = searchQuery.trim().toLowerCase();
  const filteredTickets = tickets.filter((ticket) => {
    const categoryMatches = categoryFilter === "all" || ticket.category === categoryFilter;
    const priorityMatches = priorityFilter === "all" || ticket.priority === priorityFilter;
    const searchMatches = ticketMatchesSearch(ticket, normalizedSearchQuery);

    return categoryMatches && priorityMatches && searchMatches;
  });

  const criticalCount = tickets.filter((ticket) => ticket.priority === "urgent").length;
  const incidentCountLabel = tickets.length === 1 ? "1 incident" : `${tickets.length} incidents`;

  return (
    <main className="relative min-h-screen overflow-hidden px-4 py-6 sm:px-6 lg:px-8">
      <div className="absolute inset-x-0 top-0 -z-10 h-[24rem] bg-[radial-gradient(circle_at_top_left,rgba(14,165,233,0.16),transparent_36%),radial-gradient(circle_at_top_right,rgba(245,158,11,0.14),transparent_30%),linear-gradient(180deg,rgba(255,255,255,0.94),rgba(241,245,249,0.7))]" />

      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
        <header className="rounded-[1.75rem] border border-white/70 bg-white/80 p-6 shadow-[0_18px_60px_-38px_rgba(15,23,42,0.65)] backdrop-blur-xl">
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
                  {incidentCountLabel}
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
            </nav>
          </div>

          <div className="mt-6 grid gap-4 sm:grid-cols-3">
            <div className="rounded-2xl bg-slate-50 px-4 py-4 ring-1 ring-slate-200/80">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">
                Total incidents
              </p>
              <p className="mt-2 text-3xl font-semibold text-slate-950">{tickets.length}</p>
            </div>
            <div className="rounded-2xl bg-slate-50 px-4 py-4 ring-1 ring-slate-200/80">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">
                Critical items
              </p>
              <p className="mt-2 text-3xl font-semibold text-slate-950">{criticalCount}</p>
            </div>
            <div className="rounded-2xl bg-slate-50 px-4 py-4 ring-1 ring-slate-200/80">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">
                Active categories
              </p>
              <p className="mt-2 text-3xl font-semibold text-slate-950">{categoryOptions.length}</p>
            </div>
          </div>
        </header>

        <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
          <section className="rounded-[1.75rem] border border-white/70 bg-white/85 p-6 shadow-[0_18px_60px_-38px_rgba(15,23,42,0.65)] backdrop-blur-xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-xl font-semibold text-slate-950">Log an operational incident</h2>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  Paste a raw site incident report. The API will call Ollama, normalize the
                  response, and persist the structured result.
                </p>
              </div>
              <span className="rounded-full bg-sky-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.22em] text-sky-700 ring-1 ring-sky-200">
                Structured output
              </span>
            </div>

            <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
              <label className="block">
                <span className="mb-2 block text-sm font-medium text-slate-700">
                  Operational incident text
                </span>
                <textarea
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

            {error ? (
              <div className="mt-5 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                {error}
              </div>
            ) : null}

            {statusMessage ? (
              <div className="mt-5 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
                {statusMessage}
              </div>
            ) : null}
          </section>

          <section className="rounded-[1.75rem] border border-white/70 bg-white/85 p-6 shadow-[0_18px_60px_-38px_rgba(15,23,42,0.65)] backdrop-blur-xl">
            <div className="flex flex-col gap-4 border-b border-slate-200 pb-5 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <h2 className="text-xl font-semibold text-slate-950">Operational incident dashboard</h2>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  Filter site reports by text search, category, and priority. The table is
                  populated from PostgreSQL.
                </p>
              </div>
              <div className="grid gap-3 lg:grid-cols-[minmax(0,1.3fr)_auto_auto] lg:items-end">
                <label className="block">
                  <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">
                    Search incidents
                  </span>
                  <input
                    type="search"
                    value={searchQuery}
                    onChange={(event) => setSearchQuery(event.target.value)}
                    placeholder="Search raw reports, reporters, or issue summaries..."
                    className="w-full rounded-full border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 shadow-inner outline-none transition placeholder:text-slate-400 focus:border-sky-300 focus:ring-4 focus:ring-sky-100"
                  />
                </label>

                <label className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">
                  <span className="mb-2 block">Category</span>
                  <select
                    value={categoryFilter}
                    onChange={(event) => setCategoryFilter(event.target.value)}
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
                    onChange={(event) => setPriorityFilter(event.target.value)}
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
            </div>

            <div className="mt-5 overflow-hidden rounded-3xl border border-slate-200">
              {loadingTickets ? (
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-slate-200 text-left">
                    <thead className="bg-slate-50">
                      <tr className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                        <th className="px-5 py-4">Incident</th>
                        <th className="px-5 py-4">Category</th>
                        <th className="px-5 py-4">Priority</th>
                        <th className="px-5 py-4">Suggested reply</th>
                        <th className="px-5 py-4">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 bg-white">
                      {Array.from({ length: 4 }).map((_, index) => (
                        <tr key={index} className="animate-pulse align-top">
                          <td className="px-5 py-5">
                            <div className="max-w-xl space-y-3">
                              <div className="h-4 w-3/4 rounded-full bg-slate-200" />
                              <div className="h-3 w-1/2 rounded-full bg-slate-200" />
                              <div className="h-3 w-11/12 rounded-full bg-slate-200" />
                              <div className="h-16 rounded-2xl bg-slate-100" />
                            </div>
                          </td>
                          <td className="px-5 py-5">
                            <div className="h-8 w-28 rounded-full bg-slate-200" />
                          </td>
                          <td className="px-5 py-5">
                            <div className="h-8 w-24 rounded-full bg-slate-200" />
                          </td>
                          <td className="px-5 py-5">
                            <div className="space-y-3">
                              <div className="flex items-center justify-between gap-3">
                                <div className="h-3 w-28 rounded-full bg-slate-200" />
                                <div className="h-8 w-20 rounded-full bg-slate-200" />
                              </div>
                              <div className="h-24 rounded-2xl bg-slate-100" />
                            </div>
                          </td>
                          <td className="px-5 py-5">
                            <div className="h-9 w-20 rounded-full bg-slate-200" />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : filteredTickets.length === 0 ? (
                <div className="px-6 py-16 text-center text-sm text-slate-500">
                  No operational incidents match the current search and filters.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-slate-200 text-left">
                    <thead className="bg-slate-50">
                      <tr className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                        <th className="px-5 py-4">Incident</th>
                        <th className="px-5 py-4">Category</th>
                        <th className="px-5 py-4">Priority</th>
                        <th className="px-5 py-4">Suggested reply</th>
                        <th className="px-5 py-4">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 bg-white">
                      {filteredTickets.map((ticket) => (
                        <tr key={ticket.id} className="align-top transition hover:bg-slate-50/80">
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
                              <p className="text-sm leading-6 text-slate-600">
                                {ticket.extracted_fields.issue_summary}
                              </p>
                              <p className="rounded-2xl bg-slate-50 px-4 py-3 text-sm leading-6 text-slate-700 ring-1 ring-slate-200/80">
                                {ticket.raw_text}
                              </p>
                            </div>
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
                            <button
                              type="button"
                              onClick={() => void handleDeleteTicket(ticket.id)}
                              disabled={deletingTicketId === ticket.id}
                              className="inline-flex items-center justify-center rounded-full border border-rose-200 bg-rose-50 px-4 py-2 text-sm font-semibold text-rose-700 transition hover:border-rose-300 hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              {deletingTicketId === ticket.id ? "Deleting..." : "Delete"}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
