import { randomUUID } from "node:crypto";

import { query } from "@/lib/db";
import { cleanText, normalizeCategory, normalizePriority } from "@/lib/normalization";
import { generateResponse } from "@/lib/ollama";
import { ensureTicketSchema } from "@/lib/ticket-schema";
import { serializeTicket, type TicketFields, type TicketRow } from "@/lib/ticket-types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type TicketBody = {
  rawText?: unknown;
  raw_text?: unknown;
};

type TriageResult = {
  category: string;
  priority: string;
  extracted_fields: TicketFields;
  suggested_reply: string;
};

function truncate(value: string, maxLength: number) {
  const compact = value.replace(/\s+/g, " ").trim();

  return compact.length <= maxLength ? compact : `${compact.slice(0, maxLength - 3).trimEnd()}...`;
}

function fallbackFields(rawText: string): TicketFields {
  const firstLine = rawText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean);
  const requesterMatch = rawText.match(/(?:requester|from|name)\s*[:\-]\s*([^\n,;]+)/i);
  const emailMatch = rawText.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);

  return {
    subject: truncate(firstLine ?? rawText.slice(0, 120) ?? "Operational incident", 120),
    requester: truncate(requesterMatch?.[1] ?? emailMatch?.[0] ?? "Unknown reporter", 80),
    issue_summary: truncate(rawText, 240) || "No incident summary provided.",
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

async function classifyTicket(rawText: string) {
  const prompt = [
    "Classify the operational incident and return JSON only.",
    'Schema: {"category":"...","priority":"...","extracted_fields":{"subject":"...","requester":"...","issue_summary":"..."},"suggested_reply":"..."}',
    "Allowed categories: billing, technical_issue, account_access, bug_report, feature_request, security, general, other.",
    "Allowed priorities: low, medium, high, urgent.",
    "Do not add markdown or extra commentary.",
    "Incident report text:",
    rawText,
  ].join("\n\n");

  const requestTriage = async (inputPrompt: string) => {
    const response = await generateResponse(inputPrompt, {
      systemPrompt:
        "You are an operational incident triage engine. You must output JSON only and never include extra prose.",
      format: "json",
      temperature: 0.05,
      timeoutMs: 45_000,
    });

    return {
      response,
      parsed: parseLooseJson(response.text),
    };
  };

  try {
    const firstAttempt = await requestTriage(prompt);

    if (firstAttempt.parsed) {
      return {
        triage: normalizeTriage(rawText, firstAttempt.parsed),
        warning: null,
      };
    }

    const correctionPrompt =
      `You returned invalid JSON. Here is what you returned: ${firstAttempt.response.text}. ` +
      'Please return only valid JSON matching this exact schema: {"category":"...","priority":"...","extracted_fields":{"subject":"...","requester":"...","issue_summary":"..."},"suggested_reply":"..."}. Return JSON only, no explanation.';

    const retryAttempt = await requestTriage(correctionPrompt);

    return {
      triage: retryAttempt.parsed ? normalizeTriage(rawText, retryAttempt.parsed) : normalizeTriage(rawText, null),
      warning: retryAttempt.parsed ? "LLM output corrected on retry" : "Fallback values used",
    };
  } catch (error) {
    return {
      triage: normalizeTriage(rawText, null),
      warning:
        error instanceof Error
          ? `Ollama unavailable or returned an error: ${error.message}`
          : "Ollama unavailable or returned an error.",
    };
  }
}

export async function GET() {
  try {
    await ensureTicketSchema();

    const result = await query<TicketRow>(
      `SELECT id, raw_text, category, priority, status, assignee, extracted_fields, suggested_reply, created_at, updated_at
       FROM tickets
       ORDER BY created_at DESC`,
    );

    return Response.json({ tickets: result.rows.map(serializeTicket) });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Failed to load operational incidents." },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  await ensureTicketSchema();

  const body = (await request.json().catch(() => null)) as TicketBody | null;
  const rawText = cleanText(body?.rawText ?? body?.raw_text, "");

  if (!rawText) {
    return Response.json({ error: "Incident report text is required." }, { status: 400 });
  }

  const { triage, warning } = await classifyTicket(rawText);

  try {
    const saved = await query<TicketRow>(
      `INSERT INTO tickets (id, raw_text, category, priority, status, assignee, extracted_fields, suggested_reply, created_at, updated_at)
       VALUES ($1, $2, $3, $4, 'open', '', $5::jsonb, $6, NOW(), NOW())
       RETURNING id, raw_text, category, priority, status, assignee, extracted_fields, suggested_reply, created_at, updated_at`,
      [
        randomUUID(),
        rawText,
        triage.category,
        triage.priority,
        JSON.stringify(triage.extracted_fields),
        triage.suggested_reply,
      ],
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
        error:
          error instanceof Error ? error.message : "Failed to save operational incident.",
        triage,
        warnings: warning ? [warning] : [],
      },
      { status: 500 },
    );
  }
}