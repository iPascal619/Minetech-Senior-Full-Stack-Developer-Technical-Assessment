import { query } from "@/lib/db";
import { applyRateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { ensureTicketSchema } from "@/lib/ticket-schema";
import { cleanText } from "@/lib/normalization";
import { normalizeTicketStatus, serializeTicket, type TicketRow } from "@/lib/ticket-types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteParams = {
  params: Promise<{ id: string }>;
};

type TicketUpdateBody = {
  rawText?: unknown;
  raw_text?: unknown;
  category?: unknown;
  priority?: unknown;
  status?: unknown;
  assignee?: unknown;
  extracted_fields?: unknown;
  suggested_reply?: unknown;
};

export async function DELETE(_request: Request, { params }: RouteParams) {
  const { id } = await params;

  if (!id) {
    return Response.json({ success: false, error: "Ticket id is required." }, { status: 400 });
  }

  const rateLimit = await applyRateLimit(_request, {
    bucket: "/api/tickets/:id",
    limit: 20,
    windowMs: 60_000,
  });

  if (!rateLimit.allowed) {
    return rateLimitResponse(rateLimit);
  }

  try {
    await ensureTicketSchema();

    const result = await query<{ id: string }>(
      `DELETE FROM tickets
       WHERE id = $1
       RETURNING id`,
      [id],
    );

    if (result.rowCount === 0) {
      return Response.json({ success: false, error: "Ticket not found." }, { status: 404 });
    }

    return Response.json({ success: true, id }, { status: 200 });
  } catch (error) {
    return Response.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to delete the ticket.",
      },
      { status: 500 },
    );
  }
}

export async function PATCH(request: Request, { params }: RouteParams) {
  const { id } = await params;

  if (!id) {
    return Response.json({ success: false, error: "Ticket id is required." }, { status: 400 });
  }

  const rateLimit = await applyRateLimit(request, {
    bucket: "/api/tickets/:id",
    limit: 20,
    windowMs: 60_000,
  });

  if (!rateLimit.allowed) {
    return rateLimitResponse(rateLimit);
  }

  const body = (await request.json().catch(() => null)) as TicketUpdateBody | null;

  if (!body) {
    return Response.json({ success: false, error: "Request body is required." }, { status: 400 });
  }

  const updates: string[] = [];
  const values: unknown[] = [];

  const addUpdate = (column: string, value: unknown, transform: (input: unknown) => unknown = (input) => input) => {
    if (value === undefined) {
      return;
    }

    values.push(transform(value));
    updates.push(`${column} = $${values.length}`);
  };

  addUpdate("raw_text", body.rawText ?? body.raw_text, (value) => cleanText(value));
  addUpdate("category", body.category, (value) => cleanText(value, "general"));
  addUpdate("priority", body.priority, (value) => cleanText(value, "medium"));
  addUpdate("status", body.status, (value) => normalizeTicketStatus(value));
  addUpdate("assignee", body.assignee, (value) => cleanText(value));
  addUpdate("extracted_fields", body.extracted_fields, (value) => JSON.stringify(value));
  addUpdate("suggested_reply", body.suggested_reply, (value) => cleanText(value));

  if (updates.length === 0) {
    return Response.json({ success: false, error: "No ticket fields were provided." }, { status: 400 });
  }

  try {
    await ensureTicketSchema();

    const result = await query<TicketRow>(
      `UPDATE tickets
       SET ${updates.join(", ")}, updated_at = NOW()
       WHERE id = $${values.length + 1}
       RETURNING id, raw_text, category, priority, status, assignee, extracted_fields, suggested_reply, created_at, updated_at`,
      [...values, id],
    );

    if (result.rowCount === 0) {
      return Response.json({ success: false, error: "Ticket not found." }, { status: 404 });
    }

    return Response.json({ success: true, ticket: serializeTicket(result.rows[0]) }, { status: 200 });
  } catch (error) {
    return Response.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to update the ticket.",
      },
      { status: 500 },
    );
  }
}