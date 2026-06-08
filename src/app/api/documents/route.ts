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

function detectTextEncoding(bytes: Uint8Array) {
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return "utf-8";
  }

  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
    return "utf-16le";
  }

  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    return "utf-16be";
  }

  let evenZeroBytes = 0;
  let oddZeroBytes = 0;
  const sampleLength = Math.min(bytes.length, 400);

  for (let index = 0; index < sampleLength; index += 1) {
    if (bytes[index] === 0) {
      if (index % 2 === 0) {
        evenZeroBytes += 1;
      } else {
        oddZeroBytes += 1;
      }
    }
  }

  if (oddZeroBytes >= 2 && oddZeroBytes > evenZeroBytes * 2) {
    return "utf-16le";
  }

  if (evenZeroBytes >= 2 && evenZeroBytes > oddZeroBytes * 2) {
    return "utf-16be";
  }

  return null;
}

function decodeUploadedText(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer);
  const preferredEncoding = detectTextEncoding(bytes);
  const encodings = preferredEncoding
    ? [preferredEncoding, "utf-8", "windows-1252", "iso-8859-1"]
    : ["utf-8", "windows-1252", "iso-8859-1"];

  for (const encoding of encodings) {
    try {
      const decoder = new TextDecoder(encoding, { fatal: encoding === "utf-8" });

      return decoder.decode(bytes);
    } catch {
      continue;
    }
  }

  return new TextDecoder("utf-8").decode(bytes);
}

async function readPayload(request: Request) {
  const contentType = request.headers.get("content-type") ?? "";

  if (contentType.includes("multipart/form-data")) {
    const formData = await request.formData();
    const fileEntry = formData.get("document") ?? formData.get("file");
    const filename = cleanText(formData.get("filename"), "site-document.txt");

    if (fileEntry instanceof File) {
      return {
        filename: filename || fileEntry.name || "site-document.txt",
        content: cleanText(decodeUploadedText(await fileEntry.arrayBuffer()), ""),
      };
    }

    return {
      filename: filename || "site-document.txt",
      content: cleanText(formData.get("content"), ""),
    };
  }

  if (contentType.includes("application/json")) {
    const body = (await request.json().catch(() => null)) as DocumentBody | null;

    return {
      filename: cleanText(body?.filename, "site-document.txt") || "site-document.txt",
      content: cleanText(body?.content, ""),
    };
  }

  return {
    filename: "site-document.txt",
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
      { error: error instanceof Error ? error.message : "Failed to load mining documents." },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  const payload = await readPayload(request);

  if (!payload.content) {
    return Response.json({ error: "Mining document content is required." }, { status: 400 });
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
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to save mining document.",
      },
      { status: 500 },
    );
  }
}