import Link from "next/link";

const highlights = [
  {
    label: "Local LLM",
    value: "Phi-3 Mini via Ollama",
  },
  {
    label: "Database",
    value: "PostgreSQL knowledge base",
  },
  {
    label: "Stack",
    value: "Next.js App Router + TypeScript + TailwindCSS",
  },
];

const capabilities = [
  {
    title: "Smart Intake Triage",
    description:
      "Classify support tickets, extract key fields, and generate a suggested reply with a JSON-first workflow.",
    href: "/triage",
    accent: "from-sky-500 to-cyan-500",
  },
  {
    title: "RAG Chatbot",
    description:
      "Upload documents, retrieve matching context from PostgreSQL, and ask grounded questions with citations.",
    href: "/rag",
    accent: "from-emerald-500 to-teal-500",
  },
];

export default function Home() {
  return (
    <main className="relative overflow-hidden">
      <div className="absolute inset-x-0 top-0 -z-10 h-[32rem] bg-[radial-gradient(circle_at_top_left,rgba(14,165,233,0.18),transparent_36%),radial-gradient(circle_at_top_right,rgba(16,185,129,0.16),transparent_32%),linear-gradient(180deg,rgba(255,255,255,0.92),rgba(241,245,249,0.72))]" />
      <div className="absolute left-[-8rem] top-32 -z-10 h-64 w-64 rounded-full bg-sky-200/35 blur-3xl" />
      <div className="absolute right-[-6rem] top-48 -z-10 h-72 w-72 rounded-full bg-emerald-200/35 blur-3xl" />

      <section className="mx-auto flex min-h-screen w-full max-w-7xl flex-col px-6 py-8 lg:px-10">
        <header className="flex flex-col gap-4 rounded-[1.75rem] border border-white/70 bg-white/75 px-6 py-5 shadow-[0_16px_60px_-38px_rgba(15,23,42,0.65)] backdrop-blur-xl sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">
              MineTech Assessment
            </p>
            <h1 className="mt-2 text-xl font-semibold text-slate-950">
              Smart support workflows on a local stack.
            </h1>
          </div>
          <nav className="flex flex-wrap gap-3 text-sm font-medium text-slate-600">
            <Link
              href="/triage"
              className="rounded-full border border-slate-200 bg-slate-50 px-4 py-2 transition hover:border-sky-200 hover:bg-sky-50 hover:text-sky-700"
            >
              Triage Dashboard
            </Link>
            <Link
              href="/rag"
              className="rounded-full border border-slate-200 bg-slate-50 px-4 py-2 transition hover:border-emerald-200 hover:bg-emerald-50 hover:text-emerald-700"
            >
              RAG Chatbot
            </Link>
          </nav>
        </header>

        <div className="grid flex-1 items-center gap-10 py-12 lg:grid-cols-[1.1fr_0.9fr] lg:py-16">
          <div className="max-w-2xl">
            <span className="inline-flex rounded-full border border-sky-200 bg-sky-50 px-4 py-2 text-sm font-medium text-sky-700 shadow-sm">
              Two production-style use cases, one clean interface
            </span>
            <h2 className="mt-6 text-5xl font-semibold tracking-tight text-slate-950 sm:text-6xl">
              MineTech Assessment
            </h2>
            <p className="mt-6 max-w-xl text-lg leading-8 text-slate-600">
              Build support triage and grounded document Q&A on top of a local Ollama Phi-3 Mini
              model and PostgreSQL. The app keeps the UX simple, but the back-end flow is
              structured, resilient, and easy to inspect.
            </p>

            <div className="mt-8 flex flex-wrap gap-4">
              <Link
                href="/triage"
                className="inline-flex items-center justify-center rounded-full bg-slate-950 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-slate-950/20 transition hover:-translate-y-0.5 hover:bg-slate-800"
              >
                Open Triage
              </Link>
              <Link
                href="/rag"
                className="inline-flex items-center justify-center rounded-full border border-slate-300 bg-white px-6 py-3 text-sm font-semibold text-slate-900 shadow-sm transition hover:-translate-y-0.5 hover:border-emerald-200 hover:bg-emerald-50 hover:text-emerald-800"
              >
                Open RAG Chat
              </Link>
            </div>

            <div className="mt-10 grid gap-3 sm:grid-cols-3">
              {highlights.map((item) => (
                <div
                  key={item.label}
                  className="rounded-2xl border border-white/80 bg-white/75 px-4 py-4 shadow-[0_14px_40px_-30px_rgba(15,23,42,0.65)] backdrop-blur"
                >
                  <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">
                    {item.label}
                  </p>
                  <p className="mt-2 text-sm font-medium text-slate-900">{item.value}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="grid gap-5">
            {capabilities.map((card) => (
              <article
                key={card.title}
                className="group rounded-[2rem] border border-white/60 bg-white/80 p-6 shadow-[0_20px_70px_-40px_rgba(15,23,42,0.65)] backdrop-blur-xl transition-transform duration-300 hover:-translate-y-1 hover:shadow-[0_30px_80px_-35px_rgba(15,23,42,0.65)]"
              >
                <div className={`h-1.5 w-20 rounded-full bg-gradient-to-r ${card.accent}`} />
                <h3 className="mt-5 text-2xl font-semibold tracking-tight text-slate-950">
                  {card.title}
                </h3>
                <p className="mt-3 text-sm leading-7 text-slate-600">{card.description}</p>
                <Link
                  href={card.href}
                  className="mt-6 inline-flex items-center text-sm font-semibold text-slate-900 transition group-hover:text-slate-700"
                >
                  Launch experience
                  <span className="ml-2 transition-transform group-hover:translate-x-1">-&gt;</span>
                </Link>
              </article>
            ))}

            <div className="rounded-[2rem] border border-slate-200 bg-slate-950 px-6 py-6 text-slate-100 shadow-[0_24px_70px_-38px_rgba(15,23,42,0.8)]">
              <p className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-400">
                Architecture notes
              </p>
              <ul className="mt-4 space-y-3 text-sm leading-6 text-slate-300">
                <li>Smart triage requests JSON-only output and falls back when parsing fails.</li>
                <li>RAG retrieval uses simple PostgreSQL text matching with citation tracking.</li>
                <li>Both flows handle model and database failures without crashing the UI.</li>
              </ul>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
