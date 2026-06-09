const CATEGORY_SET = new Set([
  "billing",
  "technical_issue",
  "account_access",
  "bug_report",
  "feature_request",
  "security",
  "general",
  "other",
]);

const PRIORITY_SET = new Set(["low", "medium", "high", "urgent"]);

export function cleanText(value: unknown, fallback = "") {
  if (typeof value === "string") {
    const compact = value.replace(/\s+/g, " ").trim();

    return compact || fallback;
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  if (value == null) {
    return fallback;
  }

  try {
    const serialized = JSON.stringify(value);

    return serialized ? serialized.replace(/\s+/g, " ").trim() : fallback;
  } catch {
    return fallback;
  }
}

function normalizeSlug(value: unknown, fallback: string) {
  const compact = cleanText(value, fallback).toLowerCase();
  const slug = compact.replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");

  return slug || fallback;
}

export function normalizeCategory(value: unknown) {
  const compact = cleanText(value, "general").toLowerCase();

  if (/billing|invoice|payment|charge|refund/.test(compact)) return "billing";
  if (/account|profile|settings/.test(compact)) return "account_access";
  if (/access|login|sign in|signin|password|auth/.test(compact)) return "account_access";
  if (/bug|error|crash|defect|broken|failure/.test(compact)) return "bug_report";
  if (/feature|enhancement|request/.test(compact)) return "feature_request";
  if (/security|vulnerab|breach/.test(compact)) return "security";
  if (/technical|performance|outage|service|incident/.test(compact)) return "technical_issue";

  const slug = normalizeSlug(compact, "general");

  return CATEGORY_SET.has(slug) ? slug : "general";
}

export function normalizePriority(value: unknown) {
  const compact = cleanText(value, "medium").toLowerCase();

  if (/urgent|critical|blocker|sev[_\s-]?1|p1/.test(compact)) return "urgent";
  if (/high|major|sev[_\s-]?2|p2/.test(compact)) return "high";
  if (/low|minor|sev[_\s-]?4|p4/.test(compact)) return "low";
  if (/medium|normal|moderate|sev[_\s-]?3|p3/.test(compact)) return "medium";

  const slug = normalizeSlug(compact, "medium");

  return PRIORITY_SET.has(slug) ? slug : "medium";
}

export const TICKET_STATUSES = ["open", "in_progress", "resolved", "closed"] as const;

export type TicketStatus = (typeof TICKET_STATUSES)[number];

export function normalizeTicketStatus(value: unknown, fallback: TicketStatus = "open"): TicketStatus {
  if (typeof value !== "string") {
    return fallback;
  }

  const compact = value.toLowerCase().replace(/\s+/g, "_").trim();

  if (compact === "open") return "open";
  if (compact === "in_progress" || compact === "in-progress" || compact === "in progress") {
    return "in_progress";
  }
  if (compact === "resolved") return "resolved";
  if (compact === "closed") return "closed";

  return fallback;
}