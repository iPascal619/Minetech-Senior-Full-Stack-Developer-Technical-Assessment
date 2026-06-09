import { randomUUID } from "node:crypto";

import { query, toPgVectorLiteral } from "@/lib/db";
import { MAX_DOCUMENT_CONTENT_LENGTH, MAX_DOCUMENT_FILENAME_LENGTH, createSanitizedTextSchema, sanitizeFilename } from "@/lib/input";
import { applyRateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { generateEmbedding } from "@/lib/ollama";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DOCUMENT_CONTENT_SCHEMA = createSanitizedTextSchema({
  allowNewlines: true,
  maxLength: MAX_DOCUMENT_CONTENT_LENGTH,
});

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
    const filenameEntry = formData.get("filename");
    const filename = typeof filenameEntry === "string" ? filenameEntry : "site-document.txt";

    if (fileEntry instanceof File) {
      return {
        filename: filename || fileEntry.name || "site-document.txt",
        content: decodeUploadedText(await fileEntry.arrayBuffer()),
      };
    }

    return {
      filename: filename || "site-document.txt",
      content: typeof formData.get("content") === "string" ? formData.get("content") : "",
    };
  }

  if (contentType.includes("application/json")) {
    const body = (await request.json().catch(() => null)) as DocumentBody | null;

    return {
      filename: typeof body?.filename === "string" ? body.filename : "site-document.txt",
      content: typeof body?.content === "string" ? body.content : "",
    };
  }

  return {
    filename: "site-document.txt",
    content: await request.text(),
  };
}

export async function GET(request: Request) {
  const rateLimit = await applyRateLimit(request, {
    bucket: "/api/documents",
    limit: 30,
    windowMs: 60_000,
  });

  if (!rateLimit.allowed) {
    return rateLimitResponse(rateLimit);
  }

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
  const rateLimit = await applyRateLimit(request, {
    bucket: "/api/documents",
    limit: 12,
    windowMs: 60_000,
  });

  if (!rateLimit.allowed) {
    return rateLimitResponse(rateLimit);
  }

  const payload = await readPayload(request);

  const filename = sanitizeFilename(
    typeof payload.filename === "string" ? payload.filename : "site-document.txt",
    "site-document.txt",
  );
  const contentResult = DOCUMENT_CONTENT_SCHEMA.safeParse(payload.content);

  if (filename.length > MAX_DOCUMENT_FILENAME_LENGTH) {
    return Response.json({ error: `Filename must be ${MAX_DOCUMENT_FILENAME_LENGTH} characters or fewer.` }, { status: 400 });
  }

  if (!contentResult.success) {
    return Response.json(
      { error: `Mining document content is required and must be ${MAX_DOCUMENT_CONTENT_LENGTH} characters or fewer.` },
      { status: 400 },
    );
  }

  try {
    const saved = await query<DocumentRow>(
      `INSERT INTO documents (id, filename, content, created_at)
       VALUES ($1, $2, $3, NOW())
       RETURNING id, filename, content, created_at`,
      [randomUUID(), filename, contentResult.data],
    );

    const savedDocument = saved.rows[0];
    let embeddingStored = false;

    try {
      const { embedding } = await generateEmbedding(savedDocument.content, {
        model: "nomic-embed-text",
      });

      if (embedding.length !== 768) {
        throw new Error(`Expected 768 embedding dimensions, received ${embedding.length}.`);
      }

      await query(
        `UPDATE documents
         SET embedding = $1::vector
         WHERE id = $2`,
        [toPgVectorLiteral(embedding), savedDocument.id],
      );

      embeddingStored = true;
    } catch (error) {
      console.error("Failed to store document embedding:", error);
    }

    return Response.json(
      {
        success: true,
        document: serializeDocument(savedDocument),
        embeddingStored,
      },
      { status: 201 },
    );
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