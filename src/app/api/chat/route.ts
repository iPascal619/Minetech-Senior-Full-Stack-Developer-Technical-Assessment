import { randomUUID } from "node:crypto";

import { query, queryDocumentsBySimilarity } from "@/lib/db";
import { MAX_CHAT_QUESTION_LENGTH, createSanitizedTextSchema } from "@/lib/input";
import { applyRateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { generateEmbedding, generateResponseStream } from "@/lib/ollama";

export const runtime = "nodejs";

const MIN_RETRIEVAL_SCORE = 0.75;
const QUESTION_SCHEMA = createSanitizedTextSchema({ maxLength: MAX_CHAT_QUESTION_LENGTH });

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

    const documents = await queryDocumentsBySimilarity<SimilarDocumentRow>(
      questionEmbedding,
      MIN_RETRIEVAL_SCORE,
      5,
    );

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
      const aboveThreshold = documents.rows.filter((document) => Number(document.similarity) >= MIN_RETRIEVAL_SCORE);

      if (aboveThreshold.length === 0) {
        return {
          citations: [],
          retrievalMethod: "keyword",
        };
      }

      return {
        citations: citationsFromDocuments(aboveThreshold),
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

function createSseEvent(event: string, data: unknown) {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

function fallbackAnswer() {
  return "The answer is not in the knowledge base.";
}

export async function POST(request: Request) {
  const rateLimit = await applyRateLimit(request, {
    bucket: "/api/chat",
    limit: 12,
    windowMs: 5 * 60_000,
  });

  if (!rateLimit.allowed) {
    return rateLimitResponse(rateLimit);
  }

  const body = (await request.json().catch(() => null)) as ChatBody | null;
  const questionResult = QUESTION_SCHEMA.safeParse(body?.question);
  const question = questionResult.success ? questionResult.data : "";

  if (!question) {
    return Response.json(
      { error: `question is required and must be ${MAX_CHAT_QUESTION_LENGTH} characters or fewer.` },
      { status: 400 },
    );
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        controller.enqueue(encoder.encode(createSseEvent(event, data)));
      };

      try {
        send("status", { stage: "retrieving" });

        const { citations, retrievalMethod } = await relevantCitations(question);

        if (citations.length === 0) {
          const answer = fallbackAnswer();
          const stored = await storeConversation(question, answer, []);

          send("meta", {
            citations: [],
            grounded: false,
            notInKnowledgeBase: true,
            retrieval_method: retrievalMethod,
          });
          send("delta", { chunk: answer });
          send("done", {
            success: true,
            answer,
            citations: [],
            grounded: false,
            notInKnowledgeBase: true,
            stored,
            retrieval_method: retrievalMethod,
          });
          controller.close();
          return;
        }

        send("meta", {
          citations,
          grounded: true,
          notInKnowledgeBase: false,
          retrieval_method: retrievalMethod,
        });
        send("status", { stage: "generating" });

        const context = citations
          .map(
            (citation, index) =>
              `[${index + 1}] ${citation.filename} (similarity: ${citation.score.toFixed(3)})\n${citation.excerpt}`,
          )
          .join("\n\n");
        const prompt = `Context:\n${context}\n\nQuestion: ${question}\n\nAnswer using only the context.`;

        let answer = "";

        try {
          const result = await generateResponseStream(prompt, {
            systemPrompt:
              "You are a retrieval-augmented assistant for the MineTech mining operations knowledge base. Use only the provided context and answer directly.",
            temperature: 0.2,
            timeoutMs: 60_000,
            onToken: (chunk) => {
              answer += chunk;
              send("delta", { chunk });
            },
          });

          answer = result.text || answer;
        } catch (error) {
          if (!answer.trim()) {
            answer = fallbackAnswer();
            send("delta", { chunk: answer });
          }

          send("status", {
            stage: "generation_failed",
            error: error instanceof Error ? error.message : "Ollama generation failed.",
          });
        }

        if (!answer.trim()) {
          answer = fallbackAnswer();
          send("delta", { chunk: answer });
        }

        const stored = await storeConversation(question, answer, citations);

        send("done", {
          success: true,
          answer,
          citations,
          grounded: true,
          notInKnowledgeBase: false,
          stored,
          retrieval_method: retrievalMethod,
        });
        controller.close();
      } catch (error) {
        send("error", {
          error:
            error instanceof Error
              ? error.message
              : "Failed to answer the mining operations question.",
        });
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-store, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}