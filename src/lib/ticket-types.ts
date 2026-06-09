import { cleanText, normalizeTicketStatus, type TicketStatus, TICKET_STATUSES } from "@/lib/normalization";

export type TicketFields = {
  subject: string;
  requester: string;
  issue_summary: string;
};

export type Ticket = {
  id: string;
  raw_text: string;
  category: string;
  priority: string;
  status: TicketStatus;
  assignee: string;
  extracted_fields: TicketFields;
  suggested_reply: string;
  created_at: string;
  updated_at: string;
};

export type TicketRow = {
  id: string;
  raw_text: string;
  category: string;
  priority: string;
  status: string | null;
  assignee: string | null;
  extracted_fields: unknown;
  suggested_reply: string;
  created_at: string | Date;
  updated_at: string | Date | null;
};

export { TICKET_STATUSES, normalizeTicketStatus };
export type { TicketStatus };

export function ticketStatusLabel(status: TicketStatus) {
  switch (status) {
    case "open":
      return "Open";
    case "in_progress":
      return "In progress";
    case "resolved":
      return "Resolved";
    case "closed":
      return "Closed";
    default:
      return "Open";
  }
}

export function ticketStatusClasses(status: TicketStatus) {
  switch (status) {
    case "open":
      return "bg-sky-50 text-sky-700 ring-1 ring-sky-200";
    case "in_progress":
      return "bg-amber-50 text-amber-700 ring-1 ring-amber-200";
    case "resolved":
      return "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200";
    case "closed":
      return "bg-slate-100 text-slate-700 ring-1 ring-slate-200";
    default:
      return "bg-sky-50 text-sky-700 ring-1 ring-sky-200";
  }
}

function fallbackFields(rawText: string): TicketFields {
  const firstLine = rawText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean);
  const requesterMatch = rawText.match(/(?:requester|from|name)\s*[:\-]\s*([^\n,;]+)/i);
  const emailMatch = rawText.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);

  return {
    subject: (firstLine ?? rawText.slice(0, 120) ?? "Operational incident").slice(0, 120),
    requester: cleanText(requesterMatch?.[1] ?? emailMatch?.[0] ?? "Unknown reporter", "Unknown reporter").slice(0, 80),
    issue_summary: cleanText(rawText, "No incident summary provided.").slice(0, 240) || "No incident summary provided.",
  };
}

export function serializeTicket(row: TicketRow): Ticket {
  const fallback = fallbackFields(row.raw_text);
  const extractedFields =
    row.extracted_fields && typeof row.extracted_fields === "object" && !Array.isArray(row.extracted_fields)
      ? (row.extracted_fields as Record<string, unknown>)
      : {};

  return {
    id: row.id,
    raw_text: row.raw_text,
    category: row.category,
    priority: row.priority,
    status: normalizeTicketStatus(row.status),
    assignee: cleanText(row.assignee, ""),
    extracted_fields: {
      subject: cleanText(extractedFields.subject, fallback.subject),
      requester: cleanText(extractedFields.requester, fallback.requester),
      issue_summary: cleanText(extractedFields.issue_summary, fallback.issue_summary),
    },
    suggested_reply: row.suggested_reply,
    created_at: new Date(row.created_at).toISOString(),
    updated_at: new Date(row.updated_at ?? row.created_at).toISOString(),
  };
}