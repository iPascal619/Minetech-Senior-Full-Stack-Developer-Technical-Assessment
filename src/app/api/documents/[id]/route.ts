import { query } from "@/lib/db";
import { applyRateLimit, rateLimitResponse } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteParams = {
  params: Promise<{ id: string }>;
};

type DocumentRow = {
  id: string;
  filename: string;
  content: string;
  created_at: string | Date;
};

function serializeDocument(row: DocumentRow) {
  return {
    id: row.id,
    filename: row.filename,
    content: row.content,
    created_at: new Date(row.created_at).toISOString(),
    content_length: row.content.length,
  };
}

export async function GET(_request: Request, { params }: RouteParams) {
  const { id } = await params;

  if (!id) {
    return Response.json({ success: false, error: "Document id is required." }, { status: 400 });
  }

  try {
    const result = await query<DocumentRow>(
      `SELECT id, filename, content, created_at
       FROM documents
       WHERE id = $1
       LIMIT 1`,
      [id],
    );

    const document = result.rows[0];

    if (!document) {
      return Response.json({ success: false, error: "Document not found." }, { status: 404 });
    }

    return Response.json({ success: true, document: serializeDocument(document) });
  } catch (error) {
    return Response.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to load the document.",
      },
      { status: 500 },
    );
  }
}

export async function DELETE(_request: Request, { params }: RouteParams) {
  const { id } = await params;

  if (!id) {
    return Response.json({ success: false, error: "Document id is required." }, { status: 400 });
  }

  const rateLimit = await applyRateLimit(_request, {
    bucket: "/api/documents/:id",
    limit: 20,
    windowMs: 60_000,
  });

  if (!rateLimit.allowed) {
    return rateLimitResponse(rateLimit);
  }

  try {
    const result = await query<{ id: string }>(
      `DELETE FROM documents
       WHERE id = $1
       RETURNING id`,
      [id],
    );

    if (result.rowCount === 0) {
      return Response.json({ success: false, error: "Document not found." }, { status: 404 });
    }

    return Response.json({ success: true, id }, { status: 200 });
  } catch (error) {
    return Response.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to delete the document.",
      },
      { status: 500 },
    );
  }
}