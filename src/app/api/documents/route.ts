import { randomUUID } from "node:crypto";

import { query } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type DocumentBody = {
  filename?: unknown;
  content?: unknown;
};

type DocumentRow = {
  id: string;
  filename: string;
  content: string;
  created_at: string | Date;
};

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

function serializeDocument(row: DocumentRow) {
  return {
    id: row.id,
    filename: row.filename,
    created_at: new Date(row.created_at).toISOString(),
    content_length: row.content.length,
  };
}

async function readPayload(request: Request) {
  const contentType = request.headers.get("content-type") ?? "";

  if (contentType.includes("multipart/form-data")) {
    const formData = await request.formData();
    const fileEntry = formData.get("document") ?? formData.get("file");
    const filename = cleanText(formData.get("filename"), "document.txt");

    if (fileEntry instanceof File) {
      return {
        filename: filename || fileEntry.name || "document.txt",
        content: cleanText(await fileEntry.text(), ""),
      };
    }

    return {
      filename: filename || "document.txt",
      content: cleanText(formData.get("content"), ""),
    };
  }

  if (contentType.includes("application/json")) {
    const body = (await request.json().catch(() => null)) as DocumentBody | null;

    return {
      filename: cleanText(body?.filename, "document.txt") || "document.txt",
      content: cleanText(body?.content, ""),
    };
  }

  return {
    filename: "document.txt",
    content: cleanText(await request.text(), ""),
  };
}

export async function GET() {
  try {
    const result = await query<DocumentRow>(
      `SELECT id, filename, content, created_at
       FROM documents
       ORDER BY created_at DESC`,
    );

    return Response.json({ documents: result.rows.map(serializeDocument) });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Failed to load documents." },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  const payload = await readPayload(request);

  if (!payload.content) {
    return Response.json({ error: "Document content is required." }, { status: 400 });
  }

  try {
    const saved = await query<DocumentRow>(
      `INSERT INTO documents (id, filename, content, created_at)
       VALUES ($1, $2, $3, NOW())
       RETURNING id, filename, content, created_at`,
      [randomUUID(), payload.filename || "document.txt", payload.content],
    );

    return Response.json({ success: true, document: serializeDocument(saved.rows[0]) }, { status: 201 });
  } catch (error) {
    return Response.json(
      { success: false, error: error instanceof Error ? error.message : "Failed to save document." },
      { status: 500 },
    );
  }
}