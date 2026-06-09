"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent } from "react";

import { TICKET_STATUSES, ticketStatusLabel, type Ticket, type TicketStatus } from "@/lib/ticket-types";
import { MINING_TICKET_CATEGORIES } from "@/lib/triage-categories";

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
const clampTwoLinesStyle: CSSProperties = {
  display: "-webkit-box",
  WebkitBoxOrient: "vertical",
  WebkitLineClamp: 2,
  overflow: "hidden",
};

function formatLabel(value: string) {
  const normalized = value.replace(/_/g, " ").trim().toLowerCase();

  if (!normalized) {
    return "";
  }

  return `${normalized.charAt(0).toUpperCase()}${normalized.slice(1)}`;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
  }).format(new Date(value));
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

function statusBadgeClasses(status: TicketStatus) {
  switch (status) {
    case "open":
      return "border-amber-200 bg-amber-50 text-amber-800";
    case "in_progress":
      return "border-sky-200 bg-sky-50 text-sky-800";
    case "resolved":
      return "border-emerald-200 bg-emerald-50 text-emerald-800";
    case "closed":
      return "border-slate-200 bg-slate-100 text-slate-600";
    default:
      return "border-amber-200 bg-amber-50 text-amber-800";
  }
}

function priorityBadgeClasses(priority: string) {
  switch (priority) {
    case "urgent":
    case "high":
      return "border-rose-200 bg-rose-50 text-rose-800";
    case "medium":
      return "border-amber-200 bg-amber-50 text-amber-800";
    case "low":
      return "border-emerald-200 bg-emerald-50 text-emerald-800";
    default:
      return "border-slate-200 bg-slate-50 text-slate-600";
  }
}

function categoryBadgeClasses() {
  return "border-slate-200 bg-slate-50 text-slate-600";
}

function statusToneClasses(status: TicketStatus, active: boolean) {
  switch (status) {
    case "open":
      return active ? "border-amber-300 bg-amber-100 text-amber-900" : "border-amber-200 bg-amber-50 text-amber-800";
    case "in_progress":
      return active ? "border-sky-300 bg-sky-100 text-sky-900" : "border-sky-200 bg-sky-50 text-sky-800";
    case "resolved":
      return active ? "border-emerald-300 bg-emerald-100 text-emerald-900" : "border-emerald-200 bg-emerald-50 text-emerald-800";
    case "closed":
      return active ? "border-slate-300 bg-slate-200 text-slate-800" : "border-slate-200 bg-slate-100 text-slate-600";
    default:
      return active ? "border-amber-300 bg-amber-100 text-amber-900" : "border-amber-200 bg-amber-50 text-amber-800";
  }
}

function selectFieldClasses() {
  return [
    "h-8 rounded-[10px] border-[0.5px] border-slate-200 bg-white px-3 text-[12px] font-normal text-slate-700",
    "outline-none transition",
    "focus-visible:border-sky-300 focus-visible:ring-2 focus-visible:ring-sky-100",
  ].join(" ");
}

function badgeBaseClasses() {
  return "inline-flex h-6 items-center rounded-full border-[0.5px] px-2.5 text-[11px] font-medium leading-none";
}

function buttonBaseClasses() {
  return [
    "inline-flex h-8 items-center justify-center rounded-[10px] border-[0.5px] px-3 text-[12px] font-medium transition",
    "disabled:cursor-not-allowed disabled:opacity-50",
  ].join(" ");
}

function inputBaseClasses() {
  return [
    "h-8 rounded-[10px] border-[0.5px] border-slate-200 bg-white px-3 text-[12px] font-normal text-slate-900 outline-none transition placeholder:text-slate-400",
    "focus-visible:border-sky-300 focus-visible:ring-2 focus-visible:ring-sky-100",
  ].join(" ");
}

function SearchIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" aria-hidden="true" className="h-4 w-4">
      <circle cx="7.25" cy="7.25" r="4.75" stroke="currentColor" strokeWidth="1.25" />
      <path d="M10.75 10.75L14 14" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
    </svg>
  );
}

function ChevronDownIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" aria-hidden="true" className="h-4 w-4">
      <path d="M4 6L8 10L12 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" aria-hidden="true" className="h-4 w-4">
      <path d="M8 3.5V12.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M3.5 8H12.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function HomeIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" aria-hidden="true" className="h-3.5 w-3.5">
      <path d="M2.5 7.25L8 2.75l5.5 4.5" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M4.25 6.75V13h7.5V6.75" stroke="currentColor" strokeWidth="1.25" strokeLinejoin="round" />
    </svg>
  );
}

function BookIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" aria-hidden="true" className="h-3.5 w-3.5">
      <path d="M3.5 3.5h6.75A2.25 2.25 0 0 1 12.5 5.75v7.75H5.25A1.75 1.75 0 0 1 3.5 11.75V3.5Z" stroke="currentColor" strokeWidth="1.25" strokeLinejoin="round" />
      <path d="M5.5 3.5v8.25" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
    </svg>
  );
}

function ArrowRightIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" aria-hidden="true" className="h-3.5 w-3.5">
      <path d="M3.5 8h9" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
      <path d="M8.5 4.5L12 8l-3.5 3.5" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ClipboardIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" aria-hidden="true" className="h-3.5 w-3.5">
      <rect x="5" y="3.5" width="7" height="9" rx="1.5" stroke="currentColor" strokeWidth="1.25" />
      <path d="M6.75 2.75h2.5A1.25 1.25 0 0 1 10.5 4v.25h-5V4A1.25 1.25 0 0 1 6.75 2.75Z" stroke="currentColor" strokeWidth="1.25" strokeLinejoin="round" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" aria-hidden="true" className="h-3.5 w-3.5">
      <path d="M3.5 4.5h9" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
      <path d="M6 4.5V3.75A.75.75 0 0 1 6.75 3h2.5a.75.75 0 0 1 .75.75v.75" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
      <path d="M5.25 4.5l.5 8.25h4.5l.5-8.25" stroke="currentColor" strokeWidth="1.25" strokeLinejoin="round" />
    </svg>
  );
}

function SaveIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" aria-hidden="true" className="h-3.5 w-3.5">
      <path d="M3.5 3.5h7l2 2V12.5h-9v-9Z" stroke="currentColor" strokeWidth="1.25" strokeLinejoin="round" />
      <path d="M5.25 3.5V6h4.5V3.5" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M5.5 12.5v-3h5v3" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function PersonAddIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" aria-hidden="true" className="h-3.5 w-3.5">
      <path d="M6.25 8.25A2.25 2.25 0 1 0 6.25 3.75a2.25 2.25 0 0 0 0 4.5Z" stroke="currentColor" strokeWidth="1.25" />
      <path d="M3.5 12.5c.55-1.9 1.9-3 3.5-3" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
      <path d="M11.5 5.75v3M10 7.25h3" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
    </svg>
  );
}

function SelectPageIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" aria-hidden="true" className="h-3.5 w-3.5">
      <rect x="3" y="3" width="10" height="10" rx="2" stroke="currentColor" strokeWidth="1.25" />
      <path d="M5 8h6" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
    </svg>
  );
}

function StatusIcon({ status }: { status: TicketStatus }) {
  switch (status) {
    case "in_progress":
      return <ClockIcon />;
    case "resolved":
      return <CheckCircleIcon />;
    case "closed":
      return <ClosedIcon />;
    default:
      return <OpenIcon />;
  }
}

function OpenIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" aria-hidden="true" className="h-3.5 w-3.5">
      <circle cx="8" cy="8" r="5" stroke="currentColor" strokeWidth="1.25" />
    </svg>
  );
}

function ClockIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" aria-hidden="true" className="h-3.5 w-3.5">
      <circle cx="8" cy="8" r="5" stroke="currentColor" strokeWidth="1.25" />
      <path d="M8 5.75V8l1.75 1" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function CheckCircleIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" aria-hidden="true" className="h-3.5 w-3.5">
      <circle cx="8" cy="8" r="5" stroke="currentColor" strokeWidth="1.25" />
      <path d="M5.75 8.25l1.5 1.5 3.25-3.5" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ClosedIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" aria-hidden="true" className="h-3.5 w-3.5">
      <circle cx="8" cy="8" r="5" stroke="currentColor" strokeWidth="1.25" />
      <path d="M5.6 5.6l4.8 4.8M10.4 5.6l-4.8 4.8" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" aria-hidden="true" className="h-4 w-4">
      <path d="M4 4L12 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M12 4L4 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function CopyIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" aria-hidden="true" className="h-4 w-4">
      <path
        d="M5 5.25A1.75 1.75 0 0 1 6.75 3.5h3.5A1.75 1.75 0 0 1 12 5.25v3.5A1.75 1.75 0 0 1 10.25 10.5h-3.5A1.75 1.75 0 0 1 5 8.75v-3.5Z"
        stroke="currentColor"
        strokeWidth="1.25"
      />
      <path
        d="M3.5 6.75A1.75 1.75 0 0 1 5.25 5h.5"
        stroke="currentColor"
        strokeWidth="1.25"
        strokeLinecap="round"
      />
      <path d="M6.5 11h2.25A1.75 1.75 0 0 0 10.5 9.25V7" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" aria-hidden="true" className="h-4 w-4">
      <path d="M3.5 8.25L6.5 11.25L12.5 4.75" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function CalendarIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" aria-hidden="true" className="h-3.5 w-3.5">
      <rect x="2.25" y="3.25" width="11.5" height="10.5" rx="2" stroke="currentColor" strokeWidth="1.25" />
      <path d="M2.25 6.25H13.75" stroke="currentColor" strokeWidth="1.25" />
      <path d="M5 2.25V4.75M11 2.25V4.75" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
    </svg>
  );
}

function UserIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" aria-hidden="true" className="h-3.5 w-3.5">
      <path
        d="M8 8.25A2.5 2.5 0 1 0 8 3.25a2.5 2.5 0 0 0 0 5Z"
        stroke="currentColor"
        strokeWidth="1.25"
      />
      <path d="M3.5 12.75c.75-2.25 2.5-3.5 4.5-3.5s3.75 1.25 4.5 3.5" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
    </svg>
  );
}

function UserCheckIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" aria-hidden="true" className="h-3.5 w-3.5">
      <path
        d="M7.5 8.25A2.5 2.5 0 1 0 7.5 3.25a2.5 2.5 0 0 0 0 5Z"
        stroke="currentColor"
        strokeWidth="1.25"
      />
      <path d="M3.5 12.75c.75-2.25 2.5-3.5 4.5-3.5" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
      <path d="M10.25 11.25L11.5 12.5L13.75 10.25" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function DotIcon({ className }: { className: string }) {
  return <span aria-hidden="true" className={`h-2 w-2 rounded-full ${className}`} />;
}

function MetaItem({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-[11px] font-normal text-slate-500">
      <span className="text-slate-400">{icon}</span>
      <span>{children}</span>
    </span>
  );
}

function SelectControl({
  value,
  onChange,
  ariaLabel,
  children,
  className = "",
}: {
  value: string;
  onChange: (event: React.ChangeEvent<HTMLSelectElement>) => void;
  ariaLabel: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={`relative min-w-0 ${className}`}>
      <select aria-label={ariaLabel} value={value} onChange={onChange} className={`${selectFieldClasses()} w-full appearance-none pr-8`}>
        {children}
      </select>
      <span className="pointer-events-none absolute inset-y-0 right-2 flex items-center text-slate-400">
        <ChevronDownIcon />
      </span>
    </label>
  );
}

export default function TriageDashboard() {
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
  const [deletingTicketId, setDeletingTicketId] = useState<string | null>(null);
  const [bulkWorking, setBulkWorking] = useState(false);
  const [selectedTicketIds, setSelectedTicketIds] = useState<string[]>([]);
  const [bulkAssignee, setBulkAssignee] = useState("");
  const [page, setPage] = useState(1);
  const [selectedIncidentId, setSelectedIncidentId] = useState<string | null>(null);
  const [panelAssigneeDraft, setPanelAssigneeDraft] = useState("");
  const [replyCopied, setReplyCopied] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const modalFocusTimeoutRef = useRef<number | null>(null);
  const modalCloseTimeoutRef = useRef<number | null>(null);
  const replyCopyResetTimeoutRef = useRef<number | null>(null);
  const ticketsRef = useRef<Ticket[]>([]);

  useEffect(() => {
    ticketsRef.current = tickets;
  }, [tickets]);

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

      if (replyCopyResetTimeoutRef.current !== null) {
        window.clearTimeout(replyCopyResetTimeoutRef.current);
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

    setSelectedIncidentId(null);
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

  async function handleCopyReply(suggestedReply: string) {
    try {
      await copyTextToClipboard(suggestedReply);
      setReplyCopied(true);

      if (replyCopyResetTimeoutRef.current !== null) {
        window.clearTimeout(replyCopyResetTimeoutRef.current);
      }

      replyCopyResetTimeoutRef.current = window.setTimeout(() => {
        setReplyCopied(false);
      }, 1500);
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

    if (selectedIncidentId === ticketId) {
      setSelectedIncidentId(null);
      setPanelAssigneeDraft("");
      setReplyCopied(false);
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
      setSelectedIncidentId(savedTicket.id);
      setPanelAssigneeDraft(savedTicket.assignee);
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

  async function applyOptimisticUpdate(ticketId: string, overrides: Partial<Pick<Ticket, "status" | "assignee">>) {
    const currentTicket = ticketsRef.current.find((ticket) => ticket.id === ticketId);

    if (!currentTicket) {
      throw new Error("Incident not found.");
    }

    const optimisticTicket: Ticket = {
      ...currentTicket,
      ...overrides,
    };

    setTickets((current) => current.map((ticket) => (ticket.id === ticketId ? optimisticTicket : ticket)));

    if (selectedIncidentId === ticketId && overrides.assignee !== undefined) {
      setPanelAssigneeDraft(overrides.assignee);
    }

    try {
      const savedTicket = await updateTicket(currentTicket, overrides);
      setTickets((current) => current.map((ticket) => (ticket.id === ticketId ? savedTicket : ticket)));

      if (selectedIncidentId === ticketId) {
        setPanelAssigneeDraft(savedTicket.assignee);
      }

      return savedTicket;
    } catch (updateError) {
      setTickets((current) => current.map((ticket) => (ticket.id === ticketId ? currentTicket : ticket)));

      if (selectedIncidentId === ticketId) {
        setPanelAssigneeDraft(currentTicket.assignee);
      }

      throw updateError;
    }
  }

  async function handlePanelStatusChange(status: TicketStatus) {
    if (!selectedIncident) {
      return;
    }

    setError(null);

    try {
      const updatedTicket = await applyOptimisticUpdate(selectedIncident.id, { status });
      setStatusMessage(`Status updated to ${ticketStatusLabel(updatedTicket.status).toLowerCase()}.`);
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : "Failed to update the incident.");
    }
  }

  async function handlePanelAssign() {
    if (!selectedIncident) {
      return;
    }

    const assignee = panelAssigneeDraft.trim();
    setError(null);

    try {
      const updatedTicket = await applyOptimisticUpdate(selectedIncident.id, { assignee });
      setPanelAssigneeDraft(updatedTicket.assignee);
      setStatusMessage(
        updatedTicket.assignee ? `Assigned to ${updatedTicket.assignee}.` : "Assignee cleared.",
      );
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : "Failed to assign the incident.");
    }
  }

  async function handlePanelSave() {
    if (!selectedIncident) {
      return;
    }

    const assignee = panelAssigneeDraft.trim();
    setError(null);

    if (assignee !== selectedIncident.assignee) {
      try {
        const updatedTicket = await applyOptimisticUpdate(selectedIncident.id, { assignee });
        setPanelAssigneeDraft(updatedTicket.assignee);
        setStatusMessage("Changes saved.");
      } catch (updateError) {
        setError(updateError instanceof Error ? updateError.message : "Failed to save the incident.");
      }
      return;
    }

    setStatusMessage("Changes saved.");
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

  function selectIncident(ticket: Ticket) {
    setSelectedIncidentId(ticket.id);
    setPanelAssigneeDraft(ticket.assignee);
    setReplyCopied(false);
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
  const selectedIncident = selectedIncidentId ? tickets.find((ticket) => ticket.id === selectedIncidentId) ?? null : null;

  useEffect(() => {
    if (!selectedIncident) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [selectedIncident]);

  const overview = tickets.reduce(
    (accumulator, ticket) => {
      accumulator.total += 1;

      if (ticket.status === "open") {
        accumulator.open += 1;
      }

      if (ticket.status === "in_progress") {
        accumulator.inProgress += 1;
      }

      if (ticket.priority === "urgent") {
        accumulator.urgent += 1;
      }

      return accumulator;
    },
    {
      total: 0,
      open: 0,
      inProgress: 0,
      urgent: 0,
    },
  );

  const categoryOptions = Array.from(new Set([...MINING_TICKET_CATEGORIES, ...tickets.map((ticket) => ticket.category)])).sort();
  const priorityOptions = PRIORITY_ORDER.filter((priority) => tickets.some((ticket) => ticket.priority === priority));
  const pageStart = filteredTickets.length === 0 ? 0 : (safePage - 1) * PAGE_SIZE + 1;
  const pageEnd = Math.min(safePage * PAGE_SIZE, filteredTickets.length);
  const incidentRowSelected = (ticketId: string) => selectedIncidentId === ticketId;

  return (
    <main className="min-h-screen bg-background px-4 py-6 text-slate-900 sm:px-6 lg:px-8">
      <div className="mx-auto flex w-full max-w-[1680px] flex-col gap-4">
        <header className="flex flex-col gap-2">
          <p className="text-[11px] font-medium tracking-[0.5px] text-slate-500">Operational incident dashboard</p>
          <div className="flex flex-col gap-2 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl">
              <h1 className="text-[24px] font-medium leading-tight text-slate-950">Triage site incidents in one surface.</h1>
              <p className="mt-2 text-[13px] font-normal leading-5 text-slate-600">
                Search, filter, bulk manage, and open a single incident in the side panel without leaving the queue.
              </p>
            </div>
            <div className="hidden rounded-full border-[0.5px] border-slate-200 bg-white px-3 py-1.5 text-[11px] font-medium text-slate-600 lg:inline-flex">
              {tickets.length === 1 ? "1 incident" : `${tickets.length} incidents`}
            </div>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-2 sm:gap-3 xl:grid-cols-4">
            <div className="rounded-[16px] border-[0.5px] border-slate-200 bg-white px-3 py-3 sm:px-4 sm:py-4">
              <p className="text-[11px] font-medium tracking-[0.5px] text-slate-500">Total incidents</p>
              <p className="mt-2 text-[24px] font-medium leading-none text-slate-950 sm:text-[30px]">{overview.total}</p>
            </div>
            <div className="rounded-[16px] border-[0.5px] border-slate-200 bg-white px-3 py-3 sm:px-4 sm:py-4">
              <p className="text-[11px] font-medium tracking-[0.5px] text-slate-500">Open queue</p>
              <p className="mt-2 text-[24px] font-medium leading-none text-slate-950 sm:text-[30px]">{overview.open}</p>
            </div>
            <div className="rounded-[16px] border-[0.5px] border-slate-200 bg-white px-3 py-3 sm:px-4 sm:py-4">
              <p className="text-[11px] font-medium tracking-[0.5px] text-slate-500">In progress</p>
              <p className="mt-2 text-[24px] font-medium leading-none text-slate-950 sm:text-[30px]">{overview.inProgress}</p>
            </div>
            <div className="rounded-[16px] border-[0.5px] border-slate-200 bg-white px-3 py-3 sm:px-4 sm:py-4">
              <p className="text-[11px] font-medium tracking-[0.5px] text-slate-500">Urgent items</p>
              <p className="mt-2 text-[24px] font-medium leading-none text-slate-950 sm:text-[30px]">{overview.urgent}</p>
            </div>
          </div>

          <div className="mt-3 flex flex-wrap gap-2 text-[12px] font-medium text-slate-700">
            <Link
              href="/"
              className="inline-flex h-8 items-center gap-2 rounded-full border-[0.5px] border-slate-200 bg-white px-3 transition hover:bg-slate-50"
            >
              <HomeIcon />
              <span>Home</span>
            </Link>
            <Link
              href="/rag"
              className="inline-flex h-8 items-center gap-2 rounded-full border-[0.5px] border-slate-200 bg-white px-3 transition hover:bg-slate-50"
            >
              <BookIcon />
              <span>Mining knowledge base</span>
              <ArrowRightIcon />
            </Link>
          </div>
        </header>

        <section className="rounded-[20px] border-[0.5px] border-slate-200 bg-white px-4 py-4">
          <div className="grid gap-2 sm:grid-cols-2 lg:flex lg:flex-wrap lg:items-center">
            <div className="relative min-w-0 sm:col-span-2 lg:flex-1">
              <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-slate-400">
                <SearchIcon />
              </span>
              <input
                type="search"
                value={searchQuery}
                onChange={(event) => {
                  setSearchQuery(event.target.value);
                  setPage(1);
                }}
                placeholder="Search incidents"
                className={`${inputBaseClasses()} w-full pl-9`}
                aria-label="Search incidents"
              />
            </div>

            <SelectControl
              value={statusFilter}
              onChange={(event) => {
                setStatusFilter(event.target.value);
                setPage(1);
              }}
              ariaLabel="Filter by status"
              className="w-full lg:w-40"
            >
              <option value="all">All statuses</option>
              {TICKET_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {ticketStatusLabel(status)}
                </option>
              ))}
            </SelectControl>

            <SelectControl
              value={categoryFilter}
              onChange={(event) => {
                setCategoryFilter(event.target.value);
                setPage(1);
              }}
              ariaLabel="Filter by category"
              className="w-full lg:w-48"
            >
              <option value="all">All categories</option>
              {categoryOptions.map((category) => (
                <option key={category} value={category}>
                  {formatLabel(category)}
                </option>
              ))}
            </SelectControl>

            <SelectControl
              value={priorityFilter}
              onChange={(event) => {
                setPriorityFilter(event.target.value);
                setPage(1);
              }}
              ariaLabel="Filter by priority"
              className="w-full lg:w-40"
            >
              <option value="all">All priorities</option>
              {priorityOptions.map((priority) => (
                <option key={priority} value={priority}>
                  {formatLabel(priority)}
                </option>
              ))}
            </SelectControl>

            <button
              type="button"
              onClick={openModal}
              className={`${buttonBaseClasses()} w-full shrink-0 border-slate-950 bg-slate-950 px-4 text-white hover:bg-slate-800 lg:w-auto`}
            >
              <span aria-hidden="true" className="mr-2 flex items-center">
                <PlusIcon />
              </span>
              Log incident
            </button>
          </div>
        </section>

        <section className="min-h-0 overflow-hidden rounded-[24px] border-[0.5px] border-slate-200 bg-white">
          <div className="border-b-[0.5px] border-slate-200 px-4 py-3">
            <div className="space-y-3 text-[13px] text-slate-600">
              <div className="flex items-center justify-between gap-3">
                <span className="font-medium text-slate-800">Bulk actions</span>
                <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-full border-[0.5px] border-slate-200 bg-slate-50 px-2 text-[11px] font-medium text-slate-600">
                  {selectedCount}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:flex xl:flex-wrap xl:items-center xl:gap-2">
                <button
                  type="button"
                  onClick={toggleVisibleTicketsSelection}
                  className={`${buttonBaseClasses()} w-full border-slate-200 bg-white px-3 text-[11px] text-slate-700 hover:border-slate-300 hover:bg-slate-50 xl:w-auto`}
                >
                  <span aria-hidden="true" className="mr-1 flex items-center">
                    <SelectPageIcon />
                  </span>
                  Select page
                </button>

                <button
                  type="button"
                  onClick={() => void handleBulkStatusChange("in_progress")}
                  disabled={bulkWorking || selectedCount === 0}
                  className={`${buttonBaseClasses()} w-full border-sky-200 bg-sky-50 px-3 text-[11px] text-sky-800 hover:border-sky-300 hover:bg-sky-100 xl:w-auto`}
                >
                  <span aria-hidden="true" className="mr-1 flex items-center">
                    <StatusIcon status="in_progress" />
                  </span>
                  Mark in progress
                </button>
                <button
                  type="button"
                  onClick={() => void handleBulkStatusChange("resolved")}
                  disabled={bulkWorking || selectedCount === 0}
                  className={`${buttonBaseClasses()} w-full border-emerald-200 bg-emerald-50 px-3 text-[11px] text-emerald-800 hover:border-emerald-300 hover:bg-emerald-100 xl:w-auto`}
                >
                  <span aria-hidden="true" className="mr-1 flex items-center">
                    <StatusIcon status="resolved" />
                  </span>
                  Mark resolved
                </button>
                <button
                  type="button"
                  onClick={() => void handleBulkStatusChange("closed")}
                  disabled={bulkWorking || selectedCount === 0}
                  className={`${buttonBaseClasses()} w-full border-slate-200 bg-slate-50 px-3 text-[11px] text-slate-700 hover:border-slate-300 hover:bg-slate-100 xl:w-auto`}
                >
                  <span aria-hidden="true" className="mr-1 flex items-center">
                    <StatusIcon status="closed" />
                  </span>
                  Close
                </button>

                <div className="col-span-2 flex flex-col gap-2 sm:col-span-3 sm:flex-row xl:col-span-1">
                  <input
                    type="text"
                    value={bulkAssignee}
                    onChange={(event) => setBulkAssignee(event.target.value)}
                    placeholder="Assign to"
                    className={`${inputBaseClasses()} w-full sm:w-40`}
                  />
                  <button
                    type="button"
                    onClick={() => void handleBulkAssign()}
                    disabled={bulkWorking || selectedCount === 0 || !bulkAssignee.trim()}
                    className={`${buttonBaseClasses()} w-full border-slate-200 bg-white px-3 text-[11px] text-slate-700 hover:border-slate-300 hover:bg-slate-50 sm:w-auto`}
                  >
                    <span aria-hidden="true" className="mr-1 flex items-center">
                      <PersonAddIcon />
                    </span>
                    Assign
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => void handleBulkCopyReplies()}
                  disabled={selectedCount === 0}
                  className={`${buttonBaseClasses()} w-full border-slate-200 bg-white px-3 text-[11px] text-slate-700 hover:border-slate-300 hover:bg-slate-50 xl:w-auto`}
                >
                  <span aria-hidden="true" className="mr-1 flex items-center">
                    <ClipboardIcon />
                  </span>
                  Copy replies
                </button>
                <button
                  type="button"
                  onClick={() => void handleBulkDelete()}
                  disabled={bulkWorking || selectedCount === 0}
                  className={`${buttonBaseClasses()} w-full border-rose-200 bg-rose-50 px-3 text-[11px] text-rose-800 hover:border-rose-300 hover:bg-rose-100 xl:w-auto`}
                >
                  <span aria-hidden="true" className="mr-1 flex items-center">
                    <TrashIcon />
                  </span>
                  Delete selected
                </button>
              </div>
            </div>
          </div>

          {error ? (
            <div className="border-b-[0.5px] border-slate-200 bg-rose-50 px-4 py-3 text-[13px] font-normal text-rose-700">
              {error}
            </div>
          ) : null}

          <div className="flex min-h-0 flex-col xl:h-[calc(100vh-18rem)]">
            <div className="min-w-0 border-slate-200 xl:basis-full">
              <div className="flex flex-col gap-2 border-b-[0.5px] border-slate-200 px-4 py-3 text-[13px] font-normal text-slate-600 sm:flex-row sm:items-center sm:justify-between">
                <p>
                  Showing {filteredTickets.length === 0 ? 0 : pageStart} to {pageEnd} of {filteredTickets.length} incident
                  {filteredTickets.length === 1 ? "" : "s"}
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setPage((current) => Math.max(1, current - 1))}
                    disabled={safePage <= 1}
                    className={`${buttonBaseClasses()} border-slate-200 bg-white px-3 text-[11px] text-slate-700 hover:border-slate-300 hover:bg-slate-50`}
                  >
                    Previous
                  </button>
                  <span className="inline-flex h-6 items-center rounded-full border-[0.5px] border-slate-200 bg-slate-50 px-3 text-[11px] font-medium text-slate-500">
                    Page {safePage} / {pageCount}
                  </span>
                  <button
                    type="button"
                    onClick={() => setPage((current) => Math.min(pageCount, current + 1))}
                    disabled={safePage >= pageCount}
                    className={`${buttonBaseClasses()} border-slate-200 bg-white px-3 text-[11px] text-slate-700 hover:border-slate-300 hover:bg-slate-50`}
                  >
                    Next
                  </button>
                </div>
              </div>

              {loadingTickets ? (
                <div className="space-y-3 p-4">
                  {Array.from({ length: 4 }).map((_, index) => (
                    <div key={index} className="space-y-3 border-b-[0.5px] border-slate-200 pb-4 last:border-b-0 last:pb-0">
                      <div className="h-3.5 w-2/3 rounded-full bg-slate-100" />
                      <div className="h-3 w-1/2 rounded-full bg-slate-100" />
                      <div className="h-10 rounded-[14px] bg-slate-100" />
                    </div>
                  ))}
                </div>
              ) : filteredTickets.length === 0 ? (
                <div className="flex min-h-[18rem] items-center justify-center px-6 py-16 text-center text-[13px] font-normal text-slate-500">
                  No operational incidents match the current search and filters.
                </div>
              ) : (
                <>
                  <div className="space-y-3 px-4 py-4 xl:hidden">
                    {pagedTickets.map((ticket) => {
                      const isSelected = incidentRowSelected(ticket.id);

                      return (
                        <article
                          key={ticket.id}
                          onClick={() => selectIncident(ticket)}
                          onKeyDown={(event) => {
                            if (event.key === "Enter" || event.key === " ") {
                              event.preventDefault();
                              selectIncident(ticket);
                            }
                          }}
                          tabIndex={0}
                          className={`cursor-pointer rounded-[16px] border-[0.5px] p-4 outline-none transition ${
                            isSelected
                              ? "border-sky-200 bg-sky-50"
                              : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"
                          }`}
                          aria-selected={isSelected}
                        >
                          <div className="flex flex-col gap-3">
                            <div className="flex items-start justify-between gap-3">
                              <div className="flex items-start gap-3">
                                <input
                                  type="checkbox"
                                  checked={selectedTicketIds.includes(ticket.id)}
                                  onChange={() => toggleTicketSelection(ticket.id)}
                                  onClick={(event) => event.stopPropagation()}
                                  className="mt-0.5 h-4 w-4 rounded border-slate-300 text-sky-600 focus-visible:ring-2 focus-visible:ring-sky-100"
                                  aria-label={`Select incident ${ticket.extracted_fields.subject}`}
                                />
                                <div className="space-y-1.5">
                                  <p className="text-[13px] font-medium leading-5 text-slate-950">{ticket.extracted_fields.subject}</p>
                                  <p className="text-[12px] font-normal leading-5 text-slate-500">{ticket.extracted_fields.issue_summary}</p>
                                </div>
                              </div>
                              <span className={`${badgeBaseClasses()} ${statusBadgeClasses(ticket.status)}`}>
                                {ticketStatusLabel(ticket.status)}
                              </span>
                            </div>

                            <div className="flex flex-wrap gap-2">
                              <span className={`${badgeBaseClasses()} ${categoryBadgeClasses()}`}>
                                {formatLabel(ticket.category)}
                              </span>
                              <span className={`${badgeBaseClasses()} ${priorityBadgeClasses(ticket.priority)}`}>
                                {formatLabel(ticket.priority)}
                              </span>
                            </div>

                            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                              <MetaItem icon={<CalendarIcon />}>{formatDate(ticket.created_at)}</MetaItem>
                              <MetaItem icon={<UserIcon />}>{ticket.extracted_fields.requester}</MetaItem>
                              <MetaItem icon={<UserCheckIcon />}>{ticket.assignee || "Unassigned"}</MetaItem>
                            </div>
                          </div>
                        </article>
                      );
                    })}
                  </div>

                  <div className="hidden h-full overflow-auto xl:block">
                    <table className="min-w-full table-fixed border-collapse text-left">
                      <colgroup>
                        <col style={{ width: "36px" }} />
                        <col style={{ width: "42%" }} />
                        <col style={{ width: "18%" }} />
                        <col style={{ width: "16%" }} />
                        <col style={{ width: "14%" }} />
                      </colgroup>
                      <thead>
                        <tr className="border-b-[0.5px] border-slate-200 bg-slate-50 text-[10px] font-medium tracking-[0.5px] text-slate-500">
                          <th className="px-3 py-3">
                            <input
                              type="checkbox"
                              checked={allVisibleSelected}
                              onChange={toggleVisibleTicketsSelection}
                              className="h-4 w-4 rounded border-slate-300 text-sky-600 focus-visible:ring-2 focus-visible:ring-sky-100"
                              aria-label="Select visible incidents"
                            />
                          </th>
                          <th className="px-3 py-3">Incident</th>
                          <th className="px-3 py-3">Status</th>
                          <th className="px-3 py-3">Category</th>
                          <th className="px-3 py-3">Priority</th>
                        </tr>
                      </thead>
                      <tbody className="bg-white">
                        {pagedTickets.map((ticket) => {
                          const isSelected = incidentRowSelected(ticket.id);

                          return (
                            <tr
                              key={ticket.id}
                              onClick={() => selectIncident(ticket)}
                              onKeyDown={(event) => {
                                if (event.key === "Enter" || event.key === " ") {
                                  event.preventDefault();
                                  selectIncident(ticket);
                                }
                              }}
                              tabIndex={0}
                              className={`cursor-pointer border-b-[0.5px] border-slate-200 outline-none transition last:border-b-0 ${
                                isSelected ? "bg-sky-50" : "hover:bg-slate-50"
                              }`}
                              aria-selected={isSelected}
                            >
                              <td className="px-3 py-4 align-top">
                                <input
                                  type="checkbox"
                                  checked={selectedTicketIds.includes(ticket.id)}
                                  onChange={() => toggleTicketSelection(ticket.id)}
                                  onClick={(event) => event.stopPropagation()}
                                  className="mt-0.5 h-4 w-4 rounded border-slate-300 text-sky-600 focus-visible:ring-2 focus-visible:ring-sky-100"
                                  aria-label={`Select incident ${ticket.extracted_fields.subject}`}
                                />
                              </td>
                              <td className="px-3 py-4 align-top">
                                <div className="space-y-2">
                                  <p className="text-[13px] font-medium leading-5 text-slate-950" style={clampTwoLinesStyle}>
                                    {ticket.extracted_fields.subject}
                                  </p>
                                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                                    <MetaItem icon={<CalendarIcon />}>{formatDate(ticket.created_at)}</MetaItem>
                                    <MetaItem icon={<UserIcon />}>{ticket.extracted_fields.requester}</MetaItem>
                                    <MetaItem icon={<UserCheckIcon />}>{ticket.assignee || "Unassigned"}</MetaItem>
                                  </div>
                                  <p className="text-[12px] font-normal leading-5 text-slate-500" style={clampTwoLinesStyle}>
                                    {ticket.extracted_fields.issue_summary}
                                  </p>
                                </div>
                              </td>
                              <td className="px-3 py-4 align-top">
                                <span className={`${badgeBaseClasses()} ${statusBadgeClasses(ticket.status)}`}>
                                  {ticketStatusLabel(ticket.status)}
                                </span>
                              </td>
                              <td className="px-3 py-4 align-top">
                                <span className={`${badgeBaseClasses()} ${categoryBadgeClasses()}`}>
                                  {formatLabel(ticket.category)}
                                </span>
                              </td>
                              <td className="px-3 py-4 align-top">
                                <span className={`${badgeBaseClasses()} ${priorityBadgeClasses(ticket.priority)}`}>
                                  {formatLabel(ticket.priority)}
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </div>

          </div>

          {statusMessage ? (
            <div className="border-t-[0.5px] border-slate-200 px-4 py-3 text-[13px] font-normal text-slate-600">
              {statusMessage}
            </div>
          ) : null}
        </section>
      </div>

      {selectedIncident ? (
        <div
          className="fixed inset-0 z-50 flex items-stretch justify-center bg-slate-950/35 px-0 py-0 backdrop-blur-[2px] sm:items-center sm:px-4 sm:py-6"
          onClick={() => setSelectedIncidentId(null)}
        >
          <aside
            className="flex h-full w-full max-w-none flex-col rounded-none border-0 bg-white shadow-none sm:max-h-[calc(100vh-3rem)] sm:max-w-4xl sm:rounded-[24px] sm:border-[0.5px] sm:border-slate-200 sm:shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4 border-b-[0.5px] border-slate-200 px-4 pt-4 sm:px-5 sm:pt-5">
              <div className="min-w-0 space-y-3">
                <div className="space-y-2">
                  <p className="text-[14px] font-medium leading-5 text-slate-950">{selectedIncident.extracted_fields.subject}</p>
                  <div className="flex flex-wrap gap-2">
                    <span className={`${badgeBaseClasses()} ${statusBadgeClasses(selectedIncident.status)}`}>
                      {ticketStatusLabel(selectedIncident.status)}
                    </span>
                    <span className={`${badgeBaseClasses()} ${priorityBadgeClasses(selectedIncident.priority)}`}>
                      {formatLabel(selectedIncident.priority)}
                    </span>
                    <span className={`${badgeBaseClasses()} ${categoryBadgeClasses()}`}>
                      {formatLabel(selectedIncident.category)}
                    </span>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <MetaItem icon={<CalendarIcon />}>{formatDate(selectedIncident.created_at)}</MetaItem>
                  <MetaItem icon={<UserIcon />}>{selectedIncident.extracted_fields.requester}</MetaItem>
                  <MetaItem icon={<UserCheckIcon />}>{selectedIncident.assignee || "Unassigned"}</MetaItem>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedIncidentId(null)}
                className={`${buttonBaseClasses()} h-8 w-8 shrink-0 border-slate-200 bg-white px-0 text-slate-600 hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900`}
                aria-label="Close incident details"
              >
                <CloseIcon />
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-5">
              <div className="space-y-4">
                <section className="space-y-2">
                  <p className="text-[10px] font-medium uppercase tracking-[0.5px] text-slate-500">Description</p>
                  <div className="rounded-[14px] border-[0.5px] border-slate-200 bg-slate-50 px-4 py-3 text-[12px] font-normal leading-[1.6] text-slate-600">
                    {selectedIncident.raw_text}
                  </div>
                </section>

                <section className="space-y-2">
                  <p className="text-[10px] font-medium text-slate-500">Suggested reply</p>
                  <div className="relative border-l-[0.5px] border-slate-300 bg-white pl-4 pr-9 text-[13px] font-normal leading-[1.6] text-slate-600">
                    <button
                      type="button"
                      onClick={() => void handleCopyReply(selectedIncident.suggested_reply)}
                      className="absolute right-2 top-2 inline-flex h-6 w-6 items-center justify-center rounded-full border-[0.5px] border-slate-200 bg-white text-slate-600 transition hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900"
                      aria-label="Copy suggested reply"
                    >
                      {replyCopied ? <CheckIcon /> : <CopyIcon />}
                    </button>
                    {selectedIncident.suggested_reply}
                  </div>
                </section>

                <div className="border-t-[0.5px] border-slate-200" />

                <section className="space-y-3">
                  <p className="text-[10px] font-medium uppercase tracking-[0.5px] text-slate-500">Update status</p>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {STATUS_ORDER.map((status) => {
                      const active = selectedIncident.status === status;

                      return (
                        <button
                          key={status}
                          type="button"
                          onClick={() => void handlePanelStatusChange(status)}
                          className={`${buttonBaseClasses()} h-10 justify-start gap-2 border-[0.5px] px-3 text-[12px] text-slate-700 ${statusToneClasses(status, active)}`}
                        >
                          <DotIcon
                            className={
                              status === "open"
                                ? active
                                  ? "bg-amber-600"
                                  : "bg-amber-500"
                                : status === "in_progress"
                                  ? active
                                    ? "bg-sky-600"
                                    : "bg-sky-500"
                                  : status === "resolved"
                                    ? active
                                      ? "bg-emerald-600"
                                      : "bg-emerald-500"
                                    : active
                                      ? "bg-slate-600"
                                      : "bg-slate-400"
                            }
                          />
                          <span>{ticketStatusLabel(status)}</span>
                        </button>
                      );
                    })}
                  </div>
                </section>

                <section className="space-y-2">
                  <p className="text-[10px] font-medium uppercase tracking-[0.5px] text-slate-500">Assign to</p>
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <input
                      type="text"
                      value={panelAssigneeDraft}
                      onChange={(event) => setPanelAssigneeDraft(event.target.value)}
                      placeholder="Enter assignee"
                      className={`${inputBaseClasses()} min-w-0 flex-1`}
                    />
                    <button
                      type="button"
                      onClick={() => void handlePanelAssign()}
                      disabled={panelAssigneeDraft.trim() === selectedIncident.assignee.trim()}
                      className={`${buttonBaseClasses()} border-slate-200 bg-white px-3 text-[12px] text-slate-700 hover:border-slate-300 hover:bg-slate-50`}
                    >
                      <span aria-hidden="true" className="mr-1 flex items-center">
                        <PersonAddIcon />
                      </span>
                      Assign
                    </button>
                  </div>
                </section>
              </div>
            </div>

            <footer className="flex flex-col-reverse gap-2 border-t-[0.5px] border-slate-200 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
              <button
                type="button"
                onClick={() => void handleDeleteTicket(selectedIncident.id)}
                disabled={deletingTicketId === selectedIncident.id}
                className={`${buttonBaseClasses()} border-rose-200 bg-transparent px-3 text-[12px] text-rose-700 hover:border-rose-300 hover:bg-rose-50 hover:text-rose-800`}
              >
                <span aria-hidden="true" className="mr-1 flex items-center">
                  <TrashIcon />
                </span>
                {deletingTicketId === selectedIncident.id ? "Deleting..." : "Delete"}
              </button>
              <button
                type="button"
                onClick={() => void handlePanelSave()}
                className={`${buttonBaseClasses()} border-slate-950 bg-slate-950 px-4 text-[12px] text-white hover:bg-slate-800`}
              >
                <span aria-hidden="true" className="mr-1 flex items-center">
                  <SaveIcon />
                </span>
                Save changes
              </button>
            </footer>
          </aside>
        </div>
      ) : null}

      {modalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4 py-6 sm:px-6" onClick={closeModal}>
          <div className="absolute inset-0 bg-slate-950/40 backdrop-blur-sm" />
          <div
            className="relative z-10 w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-[1.75rem] border border-white/80 bg-white p-6 shadow-[0_30px_90px_-40px_rgba(15,23,42,0.75)]"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4">
              <div className="max-w-md">
                <div className="flex flex-wrap items-center gap-3">
                  <h2 className="text-xl font-semibold text-slate-950">Log an operational incident</h2>
                  <span className="rounded-full bg-sky-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.22em] text-sky-700 ring-1 ring-sky-200">
                    Structured output
                  </span>
                </div>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  Paste a raw site incident report. The API will call Ollama, normalize the response, and persist the
                  structured result.
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
                <span className="mb-2 block text-sm font-medium text-slate-700">Operational incident text</span>
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
