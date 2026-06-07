import { randomUUID } from "node:crypto";

import { query } from "@/lib/db";
import { generateResponse } from "@/lib/ollama";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type TicketBody = {
  rawText?: unknown;
  raw_text?: unknown;
};

type TicketFields = {
  subject: string;
  requester: string;
  issue_summary: string;
};

type TriageResult = {
  category: string;
  priority: string;
  extracted_fields: TicketFields;
  suggested_reply: string;
};

type TicketRow = {
  id: string;
  raw_text: string;
  category: string;
  priority: string;
  extracted_fields: unknown;
  suggested_reply: string;
  created_at: string | Date;
};

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

function cleanText(value: unknown, fallback = "") {
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

function truncate(value: string, maxLength: number) {
  const compact = value.replace(/\s+/g, " ").trim();

  return compact.length <= maxLength ? compact : `${compact.slice(0, maxLength - 3).trimEnd()}...`;
}

function normalizeSlug(value: unknown, fallback: string) {
  const compact = cleanText(value, fallback).toLowerCase();
  const slug = compact.replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");

  return slug || fallback;
}

function normalizeCategory(value: unknown) {
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

function normalizePriority(value: unknown) {
  const compact = cleanText(value, "medium").toLowerCase();

  if (/urgent|critical|blocker|sev[_\s-]?1|p1/.test(compact)) return "urgent";
  if (/high|major|sev[_\s-]?2|p2/.test(compact)) return "high";
  if (/low|minor|sev[_\s-]?4|p4/.test(compact)) return "low";
  if (/medium|normal|moderate|sev[_\s-]?3|p3/.test(compact)) return "medium";

  const slug = normalizeSlug(compact, "medium");

  return PRIORITY_SET.has(slug) ? slug : "medium";
}

function fallbackFields(rawText: string): TicketFields {
  const firstLine = rawText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean);
  const requesterMatch = rawText.match(/(?:requester|from|name)\s*[:\-]\s*([^\n,;]+)/i);
  const emailMatch = rawText.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);

  return {
    subject: truncate(firstLine ?? rawText.slice(0, 120) ?? "Support request", 120),
    requester: truncate(requesterMatch?.[1] ?? emailMatch?.[0] ?? "Unknown", 80),
    issue_summary: truncate(rawText, 240) || "No issue summary provided.",
  };
}

function parseLooseJson(text: string) {
  const trimmed = text.trim();

  if (!trimmed) {
    return null;
  }

  const fenced = Array.from(trimmed.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi), (match) => match[1].trim());
  const candidates = [trimmed, ...fenced, (() => {
    const startIndex = trimmed.indexOf("{");
    const endIndex = trimmed.lastIndexOf("}");

    return startIndex >= 0 && endIndex > startIndex ? trimmed.slice(startIndex, endIndex + 1) : "";
  })()].filter(Boolean);

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);

      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      continue;
    }
  }

  return null;
}

function normalizeTriage(rawText: string, parsed: Record<string, unknown> | null): TriageResult {
  const fallback = fallbackFields(rawText);
  const candidate = parsed ?? {};
  const extractedFields =
    candidate.extracted_fields && typeof candidate.extracted_fields === "object" && !Array.isArray(candidate.extracted_fields)
      ? (candidate.extracted_fields as Record<string, unknown>)
      : {};

  return {
    category: normalizeCategory(candidate.category),
    priority: normalizePriority(candidate.priority),
    extracted_fields: {
      subject: cleanText(extractedFields.subject, fallback.subject),
      requester: cleanText(extractedFields.requester, fallback.requester),
      issue_summary: cleanText(extractedFields.issue_summary, fallback.issue_summary),
    },
    suggested_reply: cleanText(
      candidate.suggested_reply,
      "Thanks for reaching out. We are reviewing your request and will follow up shortly.",
    ),
  };
}

function serializeTicket(row: TicketRow) {
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
    extracted_fields: {
      subject: cleanText(extractedFields.subject, fallback.subject),
      requester: cleanText(extractedFields.requester, fallback.requester),
      issue_summary: cleanText(extractedFields.issue_summary, fallback.issue_summary),
    },
    suggested_reply: row.suggested_reply,
    created_at: new Date(row.created_at).toISOString(),
  };
}

async function classifyTicket(rawText: string) {
  const prompt = [
    "Classify the support ticket and return JSON only.",
    'Schema: {"category":"...","priority":"...","extracted_fields":{"subject":"...","requester":"...","issue_summary":"..."},"suggested_reply":"..."}',
    "Allowed categories: billing, technical_issue, account_access, bug_report, feature_request, security, general, other.",
    "Allowed priorities: low, medium, high, urgent.",
    "Do not add markdown or extra commentary.",
    "Ticket text:",
    rawText,
  ].join("\n\n");

  try {
    const response = await generateResponse(prompt, {
      systemPrompt:
        "You are a support triage engine. You must output JSON only and never include extra prose.",
      format: "json",
      temperature: 0.1,
      timeoutMs: 60_000,
    });

    const parsed = parseLooseJson(response.text);

    return {
      triage: normalizeTriage(rawText, parsed),
      warning: parsed ? null : "The LLM returned malformed JSON, so fallback values were used for some fields.",
    };
  } catch (error) {
    return {
      triage: normalizeTriage(rawText, null),
      warning: error instanceof Error ? `Ollama unavailable or returned an error: ${error.message}` : "Ollama unavailable or returned an error.",
    };
  }
}

export async function GET() {
  try {
    const result = await query<TicketRow>(
      `SELECT id, raw_text, category, priority, extracted_fields, suggested_reply, created_at
       FROM tickets
       ORDER BY created_at DESC`,
    );

    return Response.json({ tickets: result.rows.map(serializeTicket) });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Failed to load tickets." },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as TicketBody | null;
  const rawText = cleanText(body?.rawText ?? body?.raw_text, "");

  if (!rawText) {
    return Response.json({ error: "rawText is required." }, { status: 400 });
  }

  const { triage, warning } = await classifyTicket(rawText);

  try {
    const saved = await query<TicketRow>(
      `INSERT INTO tickets (id, raw_text, category, priority, extracted_fields, suggested_reply, created_at)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6, NOW())
       RETURNING id, raw_text, category, priority, extracted_fields, suggested_reply, created_at`,
      [randomUUID(), rawText, triage.category, triage.priority, JSON.stringify(triage.extracted_fields), triage.suggested_reply],
    );

    return Response.json(
      {
        success: true,
        ticket: serializeTicket(saved.rows[0]),
        warnings: warning ? [warning] : [],
      },
      { status: 201 },
    );
  } catch (error) {
    return Response.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to save ticket.",
        triage,
        warnings: warning ? [warning] : [],
      },
      { status: 500 },
    );
  }
}