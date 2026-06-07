"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";

type DocumentSummary = {
  id: string;
  filename: string;
  created_at: string;
  content_length: number;
};

type Citation = {
  document_id: string;
  filename: string;
  excerpt: string;
  score: number;
};

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
  citations: Citation[];
  grounded: boolean;
  notInKnowledgeBase: boolean;
  createdAt: string;
};

type DocumentListResponse = {
  documents?: DocumentSummary[];
  error?: string;
};

type DocumentUploadResponse = {
  success?: boolean;
  document?: DocumentSummary;
  error?: string;
};

type ChatResponse = {
  success?: boolean;
  answer?: string;
  citations?: Citation[];
  grounded?: boolean;
  notInKnowledgeBase?: boolean;
  error?: string;
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function makeId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export default function RagPage() {
  const [documents, setDocuments] = useState<DocumentSummary[]>([]);
  const [documentName, setDocumentName] = useState("");
  const [documentText, setDocumentText] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadMessage, setUploadMessage] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [question, setQuestion] = useState("");
  const [asking, setAsking] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    void loadDocuments();
  }, []);

  async function loadDocuments() {
    try {
      const response = await fetch("/api/documents?limit=12", {
        cache: "no-store",
      });
      const data = (await response.json()) as DocumentListResponse;

      if (!response.ok) {
        throw new Error(data.error ?? "Failed to load documents.");
      }

      setDocuments(data.documents ?? []);
    } catch {
      setDocuments([]);
    }
  }

  async function handleUpload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!selectedFile && !documentText.trim()) {
      setUploadError("Choose a file or paste document text before uploading.");
      return;
    }

    setUploading(true);
    setUploadError(null);
    setUploadMessage(null);

    try {
      let response: Response;

      if (selectedFile) {
        const formData = new FormData();

        formData.append("document", selectedFile);

        if (documentName.trim()) {
          formData.append("filename", documentName.trim());
        }

        response = await fetch("/api/documents", {
          method: "POST",
          body: formData,
        });
      } else {
        response = await fetch("/api/documents", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            filename: documentName.trim() || "document.txt",
            content: documentText,
          }),
        });
      }

      const data = (await response.json()) as DocumentUploadResponse;
      const savedDocument = data.document;

      if (!response.ok || !data.success || !savedDocument) {
        throw new Error(data.error ?? "Failed to store the document.");
      }

      setDocuments((current) => [savedDocument, ...current.filter((item) => item.id !== savedDocument.id)]);
      setDocumentName("");
      setDocumentText("");
      setSelectedFile(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
      setUploadMessage(`Stored ${savedDocument.filename} in the knowledge base.`);
      void loadDocuments();
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : "Failed to store the document.");
    } finally {
      setUploading(false);
    }
  }

  async function handleQuestionSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!question.trim()) {
      setChatError("Ask a question before sending it to the RAG assistant.");
      return;
    }

    const userMessage: ChatMessage = {
      id: makeId(),
      role: "user",
      text: question.trim(),
      citations: [],
      grounded: true,
      notInKnowledgeBase: false,
      createdAt: new Date().toISOString(),
    };

    setMessages((current) => [...current, userMessage]);
    setQuestion("");
    setChatError(null);
    setAsking(true);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ question: userMessage.text }),
      });

      const data = (await response.json()) as ChatResponse;
      const answer = data.answer;

      if (!response.ok || !data.success || typeof answer !== "string") {
        throw new Error(data.error ?? "Failed to answer the question.");
      }

      const assistantMessage: ChatMessage = {
        id: makeId(),
        role: "assistant",
        text: answer,
        citations: data.citations ?? [],
        grounded: Boolean(data.grounded),
        notInKnowledgeBase: Boolean(data.notInKnowledgeBase),
        createdAt: new Date().toISOString(),
      };

      setMessages((current) => [...current, assistantMessage]);
    } catch (error) {
      setChatError(error instanceof Error ? error.message : "Failed to answer the question.");
    } finally {
      setAsking(false);
    }
  }

  return (
    <main className="relative min-h-screen overflow-hidden px-4 py-6 sm:px-6 lg:px-8">
      <div className="absolute inset-x-0 top-0 -z-10 h-[24rem] bg-[radial-gradient(circle_at_top_left,rgba(16,185,129,0.16),transparent_36%),radial-gradient(circle_at_top_right,rgba(14,165,233,0.16),transparent_32%),linear-gradient(180deg,rgba(255,255,255,0.94),rgba(241,245,249,0.7))]" />

      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
        <header className="rounded-[1.75rem] border border-white/70 bg-white/80 p-6 shadow-[0_18px_60px_-38px_rgba(15,23,42,0.65)] backdrop-blur-xl">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-2xl">
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">
                Retrieval-Augmented Chat
              </p>
              <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">
                Ask questions against uploaded documents and see grounded citations.
              </h1>
              <p className="mt-3 text-base leading-7 text-slate-600">
                Upload text-based documents to PostgreSQL, retrieve relevant chunks with simple text
                matching, and answer with the same local Ollama model.
              </p>
            </div>

            <nav className="flex flex-wrap gap-3 text-sm font-medium text-slate-600">
              <Link
                href="/"
                className="rounded-full border border-slate-200 bg-slate-50 px-4 py-2 transition hover:border-slate-300 hover:bg-white"
              >
                Home
              </Link>
              <Link
                href="/triage"
                className="rounded-full border border-slate-200 bg-slate-50 px-4 py-2 transition hover:border-sky-200 hover:bg-sky-50 hover:text-sky-700"
              >
                Triage Dashboard
              </Link>
            </nav>
          </div>

          <div className="mt-6 grid gap-4 sm:grid-cols-3">
            <div className="rounded-2xl bg-slate-50 px-4 py-4 ring-1 ring-slate-200/80">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">
                Documents indexed
              </p>
              <p className="mt-2 text-3xl font-semibold text-slate-950">{documents.length}</p>
            </div>
            <div className="rounded-2xl bg-slate-50 px-4 py-4 ring-1 ring-slate-200/80">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">
                Latest sync
              </p>
              <p className="mt-2 text-lg font-semibold text-slate-950">
                {documents[0] ? formatDate(documents[0].created_at) : "Waiting for upload"}
              </p>
            </div>
            <div className="rounded-2xl bg-slate-50 px-4 py-4 ring-1 ring-slate-200/80">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">
                Grounded answers
              </p>
              <p className="mt-2 text-lg font-semibold text-slate-950">Citations shown in chat</p>
            </div>
          </div>
        </header>

        <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
          <div className="space-y-6">
            <section className="rounded-[1.75rem] border border-white/70 bg-white/85 p-6 shadow-[0_18px_60px_-38px_rgba(15,23,42,0.65)] backdrop-blur-xl">
              <div>
                <h2 className="text-xl font-semibold text-slate-950">Upload to knowledge base</h2>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  Upload a text file or paste the extracted content. The document is stored in
                  PostgreSQL for simple retrieval.
                </p>
              </div>

              <form className="mt-6 space-y-4" onSubmit={handleUpload}>
                <label className="block">
                  <span className="mb-2 block text-sm font-medium text-slate-700">Optional filename</span>
                  <input
                    value={documentName}
                    onChange={(event) => setDocumentName(event.target.value)}
                    placeholder="handbook.txt"
                    className="w-full rounded-3xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 shadow-inner outline-none transition placeholder:text-slate-400 focus:border-emerald-300 focus:ring-4 focus:ring-emerald-100"
                  />
                </label>

                <label className="block">
                  <span className="mb-2 block text-sm font-medium text-slate-700">Upload file</span>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".txt,.md,.csv,.json,.log,.html,.htm"
                    onChange={(event) => setSelectedFile(event.target.files?.[0] ?? null)}
                    className="block w-full rounded-3xl border border-dashed border-slate-300 bg-slate-50 px-4 py-3 text-sm text-slate-600 file:mr-4 file:rounded-full file:border-0 file:bg-slate-950 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-white hover:border-slate-400"
                  />
                </label>

                <label className="block">
                  <span className="mb-2 block text-sm font-medium text-slate-700">
                    Or paste document content
                  </span>
                  <textarea
                    value={documentText}
                    onChange={(event) => setDocumentText(event.target.value)}
                    placeholder="Paste the extracted text here if you are not uploading a file."
                    className="min-h-44 w-full rounded-3xl border border-slate-200 bg-white px-4 py-3 text-sm leading-7 text-slate-900 shadow-inner outline-none transition placeholder:text-slate-400 focus:border-emerald-300 focus:ring-4 focus:ring-emerald-100"
                  />
                </label>

                <div className="flex flex-wrap items-center gap-3">
                  <button
                    type="submit"
                    disabled={uploading}
                    className="inline-flex items-center justify-center rounded-full bg-slate-950 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-slate-950/20 transition hover:-translate-y-0.5 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {uploading ? "Indexing document..." : "Store document"}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setDocumentName("");
                      setDocumentText("");
                      setSelectedFile(null);
                      if (fileInputRef.current) {
                        fileInputRef.current.value = "";
                      }
                    }}
                    className="inline-flex items-center justify-center rounded-full border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
                  >
                    Clear
                  </button>
                </div>
              </form>

              {uploadError ? (
                <div className="mt-5 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                  {uploadError}
                </div>
              ) : null}

              {uploadMessage ? (
                <div className="mt-5 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
                  {uploadMessage}
                </div>
              ) : null}
            </section>

            <section className="rounded-[1.75rem] border border-white/70 bg-white/85 p-6 shadow-[0_18px_60px_-38px_rgba(15,23,42,0.65)] backdrop-blur-xl">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <h2 className="text-xl font-semibold text-slate-950">Knowledge base</h2>
                  <p className="mt-2 text-sm leading-6 text-slate-600">
                    Recently uploaded documents available for retrieval.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => void loadDocuments()}
                  className="rounded-full border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:bg-white"
                >
                  Refresh
                </button>
              </div>

              <div className="mt-5 space-y-3">
                {documents.length === 0 ? (
                  <div className="rounded-3xl border border-dashed border-slate-300 bg-slate-50 px-5 py-8 text-sm text-slate-500">
                    No documents have been uploaded yet.
                  </div>
                ) : (
                  documents.map((document) => (
                    <article
                      key={document.id}
                      className="rounded-3xl border border-slate-200 bg-white px-5 py-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <h3 className="font-semibold text-slate-950">{document.filename}</h3>
                          <p className="mt-1 text-sm text-slate-500">
                            {document.content_length.toLocaleString()} characters
                          </p>
                        </div>
                        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
                          {formatDate(document.created_at)}
                        </span>
                      </div>
                    </article>
                  ))
                )}
              </div>
            </section>
          </div>

          <section className="rounded-[1.75rem] border border-white/70 bg-white/85 p-6 shadow-[0_18px_60px_-38px_rgba(15,23,42,0.65)] backdrop-blur-xl">
            <div className="flex flex-col gap-4 border-b border-slate-200 pb-5 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h2 className="text-xl font-semibold text-slate-950">Chat interface</h2>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  Ask a question and the assistant will retrieve context, answer from the documents,
                  and show the citations used.
                </p>
              </div>

              <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.22em] text-emerald-700 ring-1 ring-emerald-200">
                {messages.length} messages
              </span>
            </div>

            <form className="mt-5 flex flex-col gap-3 sm:flex-row" onSubmit={handleQuestionSubmit}>
              <input
                value={question}
                onChange={(event) => setQuestion(event.target.value)}
                placeholder="Ask about policies, processes, product details, or procedures..."
                className="flex-1 rounded-full border border-slate-200 bg-white px-5 py-3 text-sm text-slate-900 shadow-inner outline-none transition placeholder:text-slate-400 focus:border-emerald-300 focus:ring-4 focus:ring-emerald-100"
              />
              <button
                type="submit"
                disabled={asking}
                className="rounded-full bg-emerald-600 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-emerald-600/20 transition hover:-translate-y-0.5 hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {asking ? "Searching..." : "Ask assistant"}
              </button>
            </form>

            {chatError ? (
              <div className="mt-5 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                {chatError}
              </div>
            ) : null}

            <div className="mt-6 space-y-4">
              {messages.length === 0 ? (
                <div className="rounded-[1.5rem] border border-dashed border-slate-300 bg-slate-50 px-6 py-10 text-sm leading-7 text-slate-500">
                  No messages yet. Upload a document and ask a question to see grounded answers with
                  citations.
                </div>
              ) : (
                messages.map((message) => (
                  <article
                    key={message.id}
                    className={`rounded-[1.5rem] border px-5 py-4 shadow-sm ${
                      message.role === "user"
                        ? "border-slate-200 bg-slate-50"
                        : message.notInKnowledgeBase
                          ? "border-amber-200 bg-amber-50"
                          : "border-emerald-200 bg-emerald-50"
                    }`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">
                          {message.role === "user" ? "Question" : "Answer"}
                        </p>
                        <p className="mt-1 text-sm text-slate-500">{formatDate(message.createdAt)}</p>
                      </div>

                      {message.role === "assistant" ? (
                        <span
                          className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.22em] ${
                            message.notInKnowledgeBase
                              ? "bg-amber-100 text-amber-800 ring-1 ring-amber-200"
                              : "bg-emerald-100 text-emerald-800 ring-1 ring-emerald-200"
                          }`}
                        >
                          {message.notInKnowledgeBase ? "Not in knowledge base" : "Grounded answer"}
                        </span>
                      ) : null}
                    </div>

                    <p className="mt-4 whitespace-pre-wrap text-sm leading-7 text-slate-700">
                      {message.text}
                    </p>

                    {message.role === "assistant" && message.citations.length > 0 ? (
                      <div className="mt-5 rounded-3xl border border-white/60 bg-white/80 p-4 ring-1 ring-slate-200/80">
                        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">
                          Citations
                        </p>
                        <div className="mt-3 space-y-3">
                          {message.citations.map((citation) => (
                            <div
                              key={`${citation.document_id}-${citation.excerpt}`}
                              className="rounded-2xl bg-slate-50 px-4 py-3 ring-1 ring-slate-200/80"
                            >
                              <div className="flex flex-wrap items-center justify-between gap-3">
                                <p className="font-semibold text-slate-950">{citation.filename}</p>
                                <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">
                                  Score {citation.score}
                                </span>
                              </div>
                              <p className="mt-2 text-sm leading-6 text-slate-600">
                                {citation.excerpt}
                              </p>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </article>
                ))
              )}
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}