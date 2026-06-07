import { randomUUID } from "node:crypto";

import { query } from "@/lib/db";
import { generateResponse } from "@/lib/ollama";

export const runtime = "nodejs";

type ChatBody = {
  question?: unknown;
};

type DocumentRow = {
  id: string;
  filename: string;
  content: string;
  created_at: string | Date;
};

type Citation = {
  document_id: string;
  filename: string;
  excerpt: string;
  score: number;
};

const STOP_WORDS = new Set([
  "the",
  "and",
  "for",
  "with",
  "that",
  "this",
  "from",
  "your",
  "what",
  "when",
  "where",
  "why",
  "how",
  "can",
  "could",
  "should",
  "would",
  "will",
  "about",
  "into",
  "need",
  "help",
  "question",
  "answer",
]);

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

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function keywordsFromQuestion(question: string) {
  const tokens = question.toLowerCase().match(/[a-z0-9]{3,}/g) ?? [];

  return Array.from(new Set(tokens.filter((token) => !STOP_WORDS.has(token)))).slice(0, 10);
}

function chunkText(content: string) {
  const normalized = content.replace(/\r/g, "").trim();

  if (!normalized) {
    return [];
  }

  const paragraphs = normalized.split(/\n{2,}/).map((part) => part.trim()).filter(Boolean);
  const segments =
    paragraphs.length > 1
      ? paragraphs
      : normalized.split(/(?<=[.!?])\s+/).map((part) => part.trim()).filter(Boolean);
  const chunks: string[] = [];

  let buffer = "";

  const flush = () => {
    const compact = buffer.trim();

    if (compact) {
      chunks.push(compact);
    }

    buffer = "";
  };

  for (const segment of segments) {
    const next = buffer ? `${buffer} ${segment}` : segment;

    if (next.length <= 420) {
      buffer = next;
      continue;
    }

    flush();

    if (segment.length <= 420) {
      buffer = segment;
      continue;
    }

    chunks.push(segment.slice(0, 420).trim());
  }

  flush();

  return chunks.filter(Boolean);
}

function scoreChunk(chunk: string, filename: string, keywords: string[]) {
  const lowerChunk = chunk.toLowerCase();
  const lowerFile = filename.toLowerCase();

  return keywords.reduce((score, keyword) => {
    const matches = lowerChunk.match(new RegExp(`\\b${escapeRegExp(keyword)}\\b`, "g"))?.length ?? 0;
    const fileBonus = lowerFile.includes(keyword) ? 2 : 0;

    return score + matches + fileBonus;
  }, 0);
}

async function loadDocuments(question: string) {
  const keywords = keywordsFromQuestion(question);

  if (keywords.length === 0) {
    const recent = await query<DocumentRow>(
      `SELECT id, filename, content, created_at
       FROM documents
       ORDER BY created_at DESC
       LIMIT 15`,
    );

    return { documents: recent.rows, keywords };
  }

  const conditions = keywords
    .map((_, index) => `(content ILIKE $${index + 1} OR filename ILIKE $${index + 1})`)
    .join(" OR ");
  const patterns = keywords.map((keyword) => `%${keyword}%`);

  const matched = await query<DocumentRow>(
    `SELECT id, filename, content, created_at
     FROM documents
     WHERE ${conditions}
     ORDER BY created_at DESC
     LIMIT 25`,
    patterns,
  );

  if (matched.rows.length > 0) {
    return { documents: matched.rows, keywords };
  }

  const recent = await query<DocumentRow>(
    `SELECT id, filename, content, created_at
     FROM documents
     ORDER BY created_at DESC
     LIMIT 15`,
  );

  return { documents: recent.rows, keywords };
}

async function relevantCitations(question: string) {
  const { documents, keywords } = await loadDocuments(question);

  return documents
    .flatMap((document) =>
      chunkText(document.content)
        .map((chunk) => ({
          document_id: document.id,
          filename: document.filename,
          excerpt: truncate(chunk, 280),
          score: scoreChunk(chunk, document.filename, keywords),
        }))
        .filter((item) => item.score > 0),
    )
    .sort((left, right) => right.score - left.score)
    .slice(0, 5);
}

async function storeConversation(question: string, answer: string, citations: Citation[]) {
  try {
    await query(
      `INSERT INTO conversations (id, question, answer, citations, created_at)
       VALUES ($1, $2, $3, $4::jsonb, NOW())`,
      [randomUUID(), question, answer, JSON.stringify(citations)],
    );

    return true;
  } catch {
    return false;
  }
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as ChatBody | null;
  const question = cleanText(body?.question, "");

  if (!question) {
    return Response.json({ error: "question is required." }, { status: 400 });
  }

  try {
    const citations = await relevantCitations(question);

    if (citations.length === 0) {
      const answer = "The answer is not in the knowledge base.";
      const stored = await storeConversation(question, answer, []);

      return Response.json(
        {
          success: true,
          answer,
          citations: [],
          grounded: false,
          notInKnowledgeBase: true,
          stored,
        },
        { status: 200 },
      );
    }

    const context = citations
      .map((citation, index) => `[${index + 1}] ${citation.filename}\n${citation.excerpt}`)
      .join("\n\n");

    let answer = "The answer is not in the knowledge base.";

    try {
      const result = await generateResponse(
        `Context:\n${context}\n\nQuestion: ${question}\n\nAnswer using only the context.`,
        {
          systemPrompt:
            "You are a retrieval-augmented assistant for the MineTech knowledge base. Use only the provided context.",
          temperature: 0.2,
          timeoutMs: 60_000,
        },
      );

      answer = cleanText(result.text, answer);
    } catch {
      answer = "The answer is not in the knowledge base.";
    }

    const grounded = !/not in the knowledge base/i.test(answer);
    const stored = await storeConversation(question, answer, grounded ? citations : []);

    return Response.json(
      {
        success: true,
        answer,
        citations: grounded ? citations : [],
        grounded,
        notInKnowledgeBase: !grounded,
        stored,
      },
      { status: 200 },
    );
  } catch (error) {
    return Response.json(
      { success: false, error: error instanceof Error ? error.message : "Failed to answer the question." },
      { status: 500 },
    );
  }
}