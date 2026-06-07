"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";

type TicketFields = {
  subject: string;
  requester: string;
  issue_summary: string;
};

type Ticket = {
  id: string;
  raw_text: string;
  category: string;
  priority: string;
  extracted_fields: TicketFields;
  suggested_reply: string;
  created_at: string;
};

type TicketListResponse = {
  tickets?: Ticket[];
  error?: string;
};

type TicketCreateResponse = {
  success?: boolean;
  ticket?: Ticket;
  warnings?: string[];
  error?: string;
};

function formatLabel(value: string) {
  return value
    .split("_")
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" ");
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function priorityClasses(priority: string) {
  switch (priority) {
    case "urgent":
      return "bg-rose-100 text-rose-700 ring-1 ring-rose-200";
    case "high":
      return "bg-orange-100 text-orange-700 ring-1 ring-orange-200";
    case "low":
      return "bg-emerald-100 text-emerald-700 ring-1 ring-emerald-200";
    default:
      return "bg-amber-100 text-amber-800 ring-1 ring-amber-200";
  }
}

export default function TriagePage() {
  const [rawText, setRawText] = useState("");
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [loadingTickets, setLoadingTickets] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  useEffect(() => {
    void loadTickets();
  }, []);

  async function loadTickets() {
    setLoadingTickets(true);
    setError(null);

    try {
      const response = await fetch("/api/tickets", {
        cache: "no-store",
      });
      const data = (await response.json()) as TicketListResponse;

      if (!response.ok) {
        throw new Error(data.error ?? "Failed to load tickets.");
      }

      setTickets(data.tickets ?? []);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load tickets.");
    } finally {
      setLoadingTickets(false);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!rawText.trim()) {
      setError("Enter a support ticket before submitting.");
      return;
    }

    setSubmitting(true);
    setError(null);
    setStatusMessage(null);

    try {
      const response = await fetch("/api/tickets", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ rawText }),
      });

      const data = (await response.json()) as TicketCreateResponse;
      const savedTicket = data.ticket;

      if (!response.ok || !data.success || !savedTicket) {
        throw new Error(data.error ?? "Failed to triage ticket.");
      }

      setTickets((current) => [savedTicket, ...current.filter((ticket) => ticket.id !== savedTicket.id)]);
      setRawText("");
      setStatusMessage(
        data.warnings && data.warnings.length > 0
          ? `${formatLabel(savedTicket.category)} saved with a fallback warning.`
          : "Ticket triaged and saved successfully.",
      );
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Failed to triage ticket.");
    } finally {
      setSubmitting(false);
    }
  }

  const categoryOptions = Array.from(new Set(tickets.map((ticket) => ticket.category))).sort();
  const priorityOrder = ["urgent", "high", "medium", "low"];
  const priorityOptions = priorityOrder.filter((priority) =>
    tickets.some((ticket) => ticket.priority === priority),
  );
  const filteredTickets = tickets.filter((ticket) => {
    const categoryMatches = categoryFilter === "all" || ticket.category === categoryFilter;
    const priorityMatches = priorityFilter === "all" || ticket.priority === priorityFilter;

    return categoryMatches && priorityMatches;
  });

  const urgentCount = tickets.filter((ticket) => ticket.priority === "urgent").length;

  return (
    <main className="relative min-h-screen overflow-hidden px-4 py-6 sm:px-6 lg:px-8">
      <div className="absolute inset-x-0 top-0 -z-10 h-[24rem] bg-[radial-gradient(circle_at_top_left,rgba(14,165,233,0.16),transparent_36%),radial-gradient(circle_at_top_right,rgba(245,158,11,0.14),transparent_30%),linear-gradient(180deg,rgba(255,255,255,0.94),rgba(241,245,249,0.7))]" />

      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
        <header className="rounded-[1.75rem] border border-white/70 bg-white/80 p-6 shadow-[0_18px_60px_-38px_rgba(15,23,42,0.65)] backdrop-blur-xl">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-2xl">
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">
                Smart Intake Triage
              </p>
              <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">
                Classify tickets, extract fields, and keep the queue organized.
              </h1>
              <p className="mt-3 text-base leading-7 text-slate-600">
                Submit unstructured support messages, send them through the local Phi-3 Mini model,
                and store a structured triage result in PostgreSQL.
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
                href="/rag"
                className="rounded-full border border-slate-200 bg-slate-50 px-4 py-2 transition hover:border-emerald-200 hover:bg-emerald-50 hover:text-emerald-700"
              >
                RAG Chatbot
              </Link>
            </nav>
          </div>

          <div className="mt-6 grid gap-4 sm:grid-cols-3">
            <div className="rounded-2xl bg-slate-50 px-4 py-4 ring-1 ring-slate-200/80">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">
                Total tickets
              </p>
              <p className="mt-2 text-3xl font-semibold text-slate-950">{tickets.length}</p>
            </div>
            <div className="rounded-2xl bg-slate-50 px-4 py-4 ring-1 ring-slate-200/80">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">
                Urgent items
              </p>
              <p className="mt-2 text-3xl font-semibold text-slate-950">{urgentCount}</p>
            </div>
            <div className="rounded-2xl bg-slate-50 px-4 py-4 ring-1 ring-slate-200/80">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">
                Active categories
              </p>
              <p className="mt-2 text-3xl font-semibold text-slate-950">{categoryOptions.length}</p>
            </div>
          </div>
        </header>

        <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
          <section className="rounded-[1.75rem] border border-white/70 bg-white/85 p-6 shadow-[0_18px_60px_-38px_rgba(15,23,42,0.65)] backdrop-blur-xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-xl font-semibold text-slate-950">Submit a ticket</h2>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  Paste a raw support message. The API will call Ollama, normalize the response,
                  and persist the structured result.
                </p>
              </div>
              <span className="rounded-full bg-sky-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.22em] text-sky-700 ring-1 ring-sky-200">
                JSON only
              </span>
            </div>

            <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
              <label className="block">
                <span className="mb-2 block text-sm font-medium text-slate-700">Raw ticket text</span>
                <textarea
                  value={rawText}
                  onChange={(event) => setRawText(event.target.value)}
                  placeholder="Example: Customer cannot log in after resetting the password. Requester: Ava Chen. Need immediate help."
                  className="min-h-56 w-full rounded-3xl border border-slate-200 bg-white px-4 py-3 text-sm leading-7 text-slate-900 shadow-inner outline-none transition placeholder:text-slate-400 focus:border-sky-300 focus:ring-4 focus:ring-sky-100"
                />
              </label>

              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="submit"
                  disabled={submitting}
                  className="inline-flex items-center justify-center rounded-full bg-slate-950 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-slate-950/20 transition hover:-translate-y-0.5 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {submitting ? "Triaging ticket..." : "Run triage"}
                </button>
                <button
                  type="button"
                  onClick={() => setRawText("")}
                  className="inline-flex items-center justify-center rounded-full border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
                >
                  Clear
                </button>
              </div>
            </form>

            {error ? (
              <div className="mt-5 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                {error}
              </div>
            ) : null}

            {statusMessage ? (
              <div className="mt-5 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
                {statusMessage}
              </div>
            ) : null}
          </section>

          <section className="rounded-[1.75rem] border border-white/70 bg-white/85 p-6 shadow-[0_18px_60px_-38px_rgba(15,23,42,0.65)] backdrop-blur-xl">
            <div className="flex flex-col gap-4 border-b border-slate-200 pb-5 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <h2 className="text-xl font-semibold text-slate-950">Triage dashboard</h2>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  Filter tickets by category and priority. The table is populated from PostgreSQL.
                </p>
              </div>

              <div className="flex flex-wrap gap-3">
                <label className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">
                  <span className="mb-2 block">Category</span>
                  <select
                    value={categoryFilter}
                    onChange={(event) => setCategoryFilter(event.target.value)}
                    className="min-w-40 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 outline-none transition focus:border-sky-300 focus:ring-4 focus:ring-sky-100"
                  >
                    <option value="all">All categories</option>
                    {categoryOptions.map((category) => (
                      <option key={category} value={category}>
                        {formatLabel(category)}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">
                  <span className="mb-2 block">Priority</span>
                  <select
                    value={priorityFilter}
                    onChange={(event) => setPriorityFilter(event.target.value)}
                    className="min-w-36 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 outline-none transition focus:border-sky-300 focus:ring-4 focus:ring-sky-100"
                  >
                    <option value="all">All priorities</option>
                    {priorityOptions.map((priority) => (
                      <option key={priority} value={priority}>
                        {formatLabel(priority)}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </div>

            <div className="mt-5 overflow-hidden rounded-3xl border border-slate-200">
              {loadingTickets ? (
                <div className="px-6 py-16 text-center text-sm text-slate-500">
                  Loading tickets...
                </div>
              ) : filteredTickets.length === 0 ? (
                <div className="px-6 py-16 text-center text-sm text-slate-500">
                  No tickets match the selected filters.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-slate-200 text-left">
                    <thead className="bg-slate-50">
                      <tr className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                        <th className="px-5 py-4">Ticket</th>
                        <th className="px-5 py-4">Category</th>
                        <th className="px-5 py-4">Priority</th>
                        <th className="px-5 py-4">Suggested reply</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 bg-white">
                      {filteredTickets.map((ticket) => (
                        <tr key={ticket.id} className="align-top transition hover:bg-slate-50/80">
                          <td className="px-5 py-5">
                            <div className="max-w-xl space-y-2">
                              <div className="flex flex-wrap items-center gap-2">
                                <p className="font-semibold text-slate-950">
                                  {ticket.extracted_fields.subject}
                                </p>
                                <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">
                                  {formatDate(ticket.created_at)}
                                </span>
                              </div>
                              <p className="text-sm text-slate-600">
                                <span className="font-medium text-slate-700">Requester:</span>{" "}
                                {ticket.extracted_fields.requester}
                              </p>
                              <p className="text-sm leading-6 text-slate-600">
                                {ticket.extracted_fields.issue_summary}
                              </p>
                            </div>
                          </td>
                          <td className="px-5 py-5">
                            <span className="inline-flex rounded-full bg-sky-50 px-3 py-1 text-sm font-medium text-sky-700 ring-1 ring-sky-200">
                              {formatLabel(ticket.category)}
                            </span>
                          </td>
                          <td className="px-5 py-5">
                            <span
                              className={`inline-flex rounded-full px-3 py-1 text-sm font-semibold ${priorityClasses(ticket.priority)}`}
                            >
                              {formatLabel(ticket.priority)}
                            </span>
                          </td>
                          <td className="px-5 py-5">
                            <div className="max-w-xl rounded-2xl bg-slate-50 p-4 text-sm leading-7 text-slate-700 ring-1 ring-slate-200/80">
                              {ticket.suggested_reply}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}