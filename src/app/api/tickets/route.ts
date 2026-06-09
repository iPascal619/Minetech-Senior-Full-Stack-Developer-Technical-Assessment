import { randomUUID } from "node:crypto";

import { query } from "@/lib/db";
import { MAX_TRIAGE_TEXT_LENGTH, createSanitizedTextSchema } from "@/lib/input";
import { applyRateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { cleanText, inferSubjectFromRawText, normalizeCategory, normalizePriority } from "@/lib/normalization";
import { generateResponse } from "@/lib/ollama";
import { ensureTicketSchema } from "@/lib/ticket-schema";
import { parseTriageOutput } from "@/lib/triage-schema";
import { MINING_TICKET_CATEGORIES } from "@/lib/triage-categories";
import { serializeTicket, type TicketFields, type TicketRow } from "@/lib/ticket-types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TRIAGE_INPUT_SCHEMA = createSanitizedTextSchema({
  allowNewlines: true,
  maxLength: MAX_TRIAGE_TEXT_LENGTH,
});

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
  const requesterMatch = rawText.match(/(?:requester|from|name)\s*[:\-]\s*([^\n,;]+)/i);
  const emailMatch = rawText.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);

  return {
    subject: truncate(inferSubjectFromRawText(rawText), 120),
    requester: truncate(requesterMatch?.[1] ?? emailMatch?.[0] ?? "Unknown reporter", 80),
    issue_summary: truncate(rawText, 240) || "No incident summary provided.",
  };
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
      "Thanks for reporting this. We are reviewing the issue, escalating it to the relevant team, and will follow up with the next operational steps shortly.",
    ),
  };
}

async function classifyTicket(rawText: string) {
  const prompt = [
    "You are a mining incident triage assistant. Return only valid JSON.",
    'Schema: {"category":"...","priority":"...","extracted_fields":{"subject":"...","requester":"...","issue_summary":"..."},"suggested_reply":"..."}',
    `Categories: ${MINING_TICKET_CATEGORIES.join(", ")}.`,
    "Pick the most specific category that fits the text.",
    "Use equipment_fault for truck, conveyor, pump, drill, brake, hydraulic, leak, smoke, gearbox, motor, or breakdown.",
    "Use safety_incident for injuries, near misses, hazards, fire, evacuation, or immediate site safety concerns.",
    "Use production_delay for lost production, shutdown, or downtime caused by a site event.",
    "Priorities: low, medium, high, urgent. Use urgent for active safety risk, stopped equipment, loss of braking, smoke, or immediate operational impact.",
    "Write a short subject, a compact summary, and a practical suggested reply.",
    "Do not add markdown or extra commentary.",
    "Example: {\"category\":\"equipment_fault\",\"priority\":\"urgent\",\"extracted_fields\":{\"subject\":\"Hydraulic leak and braking loss at Shaft B2\",\"requester\":\"James Mutua\",\"issue_summary\":\"A haul truck at Shaft B2 reported a hydraulic leak and reduced braking response and was taken out of service.\"},\"suggested_reply\":\"Thanks for reporting this. We are treating it as an urgent equipment fault and escalating it to maintenance for immediate inspection of the hydraulic system and brakes.\"}",
    "Incident text:",
    rawText,
  ].join("\n\n");

  const requestTriage = async (inputPrompt: string) => {
    const response = await generateResponse(inputPrompt, {
      systemPrompt:
        "You are an operational incident triage engine. You must output JSON only and never include extra prose.",
      format: "json",
      temperature: 0.05,
      numPredict: 192,
      timeoutMs: 180_000,
    });

    return {
      response,
      parsed: parseTriageOutput(response.text),
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

export async function GET(request: Request) {
  const rateLimit = await applyRateLimit(request, {
    bucket: "/api/tickets",
    limit: 30,
    windowMs: 60_000,
  });

  if (!rateLimit.allowed) {
    return rateLimitResponse(rateLimit);
  }

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
  const rateLimit = await applyRateLimit(request, {
    bucket: "/api/tickets",
    limit: 10,
    windowMs: 60_000,
  });

  if (!rateLimit.allowed) {
    return rateLimitResponse(rateLimit);
  }

  await ensureTicketSchema();

  const body = (await request.json().catch(() => null)) as TicketBody | null;
  const rawTextResult = TRIAGE_INPUT_SCHEMA.safeParse(body?.rawText ?? body?.raw_text);
  const rawText = rawTextResult.success ? rawTextResult.data : "";

  if (!rawText) {
    return Response.json(
      { error: `Incident report text is required and must be ${MAX_TRIAGE_TEXT_LENGTH} characters or fewer.` },
      { status: 400 },
    );
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