import { randomUUID } from "node:crypto";

import { query, queryDocumentsBySimilarity } from "@/lib/db";
import { generateEmbedding, generateResponse } from "@/lib/ollama";

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

type SimilarDocumentRow = DocumentRow & {
  similarity: number;
};

type Citation = {
  document_id: string;
  filename: string;
  excerpt: string;
  score: number;
};

type RetrievalMethod = "vector" | "keyword";

type RetrievedCitations = {
  citations: Citation[];
  retrievalMethod: RetrievalMethod;
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

function truncate(value: string, maxLength: number) {
  const compact = value.replace(/\s+/g, " ").trim();

  return compact.length <= maxLength ? compact : `${compact.slice(0, maxLength - 3).trimEnd()}...`;
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

function escapeLikePattern(value: string) {
  return value.replace(/[\\%_]/g, "\\$&");
}

function keywordTerms(question: string) {
  const uniqueTerms: string[] = [];
  const terms = question.toLowerCase().match(/[a-z0-9]+/g) ?? [];

  for (const term of terms) {
    if (term.length < 2 || uniqueTerms.includes(term)) {
      continue;
    }

    uniqueTerms.push(term);

    if (uniqueTerms.length >= 8) {
      break;
    }
  }

  return uniqueTerms;
}

function citationsFromDocuments(documents: SimilarDocumentRow[]) {
  return documents
    .flatMap((document) => {
      const similarity = Number(document.similarity);

      return chunkText(document.content).map((chunk) => ({
        document_id: document.id,
        filename: document.filename,
        excerpt: truncate(chunk, 280),
        score: similarity,
      }));
    })
    .sort((left, right) => right.score - left.score)
    .slice(0, 5);
}

async function queryDocumentsByKeywordMatch(question: string) {
  const terms = keywordTerms(question);

  if (terms.length === 0) {
    return { rows: [] as SimilarDocumentRow[] };
  }

  const patterns = terms.map((term) => `%${escapeLikePattern(term)}%`);
  const matchClauses = patterns
    .map(
      (_, index) =>
        `(content ILIKE $${index + 1} ESCAPE '\\' OR filename ILIKE $${index + 1} ESCAPE '\\')`,
    )
    .join(" OR ");
  const scoreClauses = patterns
    .map(
      (_, index) =>
        `CASE WHEN (content ILIKE $${index + 1} ESCAPE '\\' OR filename ILIKE $${index + 1} ESCAPE '\\') THEN 1 ELSE 0 END`,
    )
    .join(" + ");

  return query<SimilarDocumentRow>(
    `SELECT id, filename, content, created_at, (${scoreClauses})::float / ${patterns.length} AS similarity
     FROM documents
     WHERE ${matchClauses}
     ORDER BY similarity DESC, created_at DESC
     LIMIT 5`,
    patterns,
  );
}

async function relevantCitations(question: string): Promise<RetrievedCitations> {
  try {
    const { embedding: questionEmbedding } = await generateEmbedding(question, {
      model: "nomic-embed-text",
    });

    const documents = await queryDocumentsBySimilarity<SimilarDocumentRow>(questionEmbedding, 0.75, 5);

    if (documents.rows.length === 0) {
      return {
        citations: [],
        retrievalMethod: "vector",
      };
    }

    return {
      citations: citationsFromDocuments(documents.rows),
      retrievalMethod: "vector",
    };
  } catch (error) {
    console.warn("Vector retrieval failed, falling back to keyword retrieval.", error);

    try {
      const documents = await queryDocumentsByKeywordMatch(question);

      return {
        citations: citationsFromDocuments(documents.rows),
        retrievalMethod: "keyword",
      };
    } catch {
      return {
        citations: [],
        retrievalMethod: "keyword",
      };
    }
  }
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
    const { citations, retrievalMethod } = await relevantCitations(question);

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
          retrieval_method: retrievalMethod,
        },
        { status: 200 },
      );
    }

    const context = citations
      .map(
        (citation, index) =>
          `[${index + 1}] ${citation.filename} (similarity: ${citation.score.toFixed(3)})\n${citation.excerpt}`,
      )
      .join("\n\n");

    let answer = "The answer is not in the mining operations knowledge base.";

    try {
      const result = await generateResponse(
        `Context:\n${context}\n\nQuestion: ${question}\n\nAnswer using only the context.`,
        {
          systemPrompt:
            "You are a retrieval-augmented assistant for the MineTech mining operations knowledge base. Use only the provided context.",
          temperature: 0.2,
          timeoutMs: 60_000,
        },
      );

      answer = cleanText(result.text, answer);
    } catch {
      answer = "The answer is not in the mining operations knowledge base.";
    }

    const grounded = !/not in the (?:mining operations )?knowledge base/i.test(answer);
    const stored = await storeConversation(question, answer, grounded ? citations : []);

    return Response.json(
      {
        success: true,
        answer,
        citations: grounded ? citations : [],
        grounded,
        notInKnowledgeBase: !grounded,
        stored,
        retrieval_method: retrievalMethod,
      },
      { status: 200 },
    );
  } catch (error) {
    return Response.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Failed to answer the mining operations question.",
      },
      { status: 500 },
    );
  }
}