import Image from "next/image";
import Link from "next/link";

const highlights = [
  {
    label: "Mining Operations",
    value: "Shift logs, equipment faults, and site incidents in one flow.",
  },
  {
    label: "Site Intelligence",
    value: "Local Ollama and PostgreSQL keep every answer grounded.",
  },
  {
    label: "Compliance Ready",
    value: "Traceable records for safety, audit, and production follow-up.",
  },
];

const capabilities = [
  {
    title: "Operational Incident Triage",
    description:
      "Classify site reports, extract the worker, equipment, and urgency, and save a structured incident record.",
    href: "/triage",
    accent: "from-sky-500 to-cyan-500",
  },
  {
    title: "Mining Operations Knowledge Base",
    description:
      "Ingest safety manuals, inspections, and shift notes, then ask cited questions against the documents.",
    href: "/rag",
    accent: "from-sky-500 to-blue-500",
  },
];

const howItWorks = [
  {
    title: "Triage flow",
    description:
      "Crews paste site reports. Ollama classifies the incident, PostgreSQL stores the record, and the dashboard keeps the shift team aligned.",
    steps: ["Input", "Ollama", "PostgreSQL", "Dashboard"],
  },
  {
    title: "RAG flow",
    description:
      "Documents move into PostgreSQL, retrieval surfaces the right passages, Ollama answers, and the user sees the cited result.",
    steps: ["Documents", "PostgreSQL", "Retrieval", "Ollama", "Cited Answer"],
  },
];

export default function Home() {
  return (
    <main className="relative overflow-hidden bg-slate-50">
      <div className="absolute inset-x-0 top-0 -z-10 h-[34rem] bg-[radial-gradient(circle_at_top_left,rgba(14,165,233,0.18),transparent_36%),radial-gradient(circle_at_top_right,rgba(16,185,129,0.16),transparent_32%),linear-gradient(180deg,rgba(248,251,255,0.96),rgba(238,243,249,0.82))]" />
      <div className="absolute left-[-8rem] top-28 -z-10 h-64 w-64 rounded-full bg-sky-300/25 blur-3xl" />
      <div className="absolute right-[-6rem] top-44 -z-10 h-72 w-72 rounded-full bg-emerald-300/20 blur-3xl" />

      <section className="relative isolate overflow-hidden bg-[radial-gradient(circle_at_top_left,rgba(14,165,233,0.2),transparent_34%),radial-gradient(circle_at_top_right,rgba(16,185,129,0.14),transparent_30%),linear-gradient(180deg,rgba(255,255,255,0.98),rgba(235,242,250,0.92))] text-slate-950 backdrop-blur-xl">
        <div className="absolute inset-0 -z-10">
          <Image
            src="/soda.svg"
            alt="Mining operations illustration"
            fill
            priority
            sizes="100vw"
            className="object-cover object-[92%_center] opacity-60 mix-blend-multiply"
            style={{ animation: "heroFloat 18s ease-in-out infinite" }}
          />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_left,rgba(14,165,233,0.24),transparent_45%),linear-gradient(90deg,rgba(255,255,255,0.64)_0%,rgba(255,255,255,0.38)_42%,rgba(255,255,255,0.08)_100%)]" />
        </div>

        <div className="relative mx-auto flex w-full max-w-7xl flex-col gap-12 px-6 py-8 lg:px-10 lg:py-10">
          <header className="rounded-2xl border border-sky-100/80 bg-white/80 px-5 py-4 shadow-[0_16px_50px_-36px_rgba(14,165,233,0.22)] backdrop-blur-xl sm:px-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <Image
                  src="/minetech-logo.svg"
                  alt="MINETECH"
                  width={72}
                  height={72}
                  className="h-11 w-11 sm:h-12 sm:w-12"
                  priority
                />
              </div>
              <nav className="flex flex-wrap gap-3 text-sm font-semibold text-slate-700">
                <Link
                  href="/triage"
                  className="rounded-full border border-sky-100 bg-sky-50 px-4 py-2 transition hover:border-sky-200 hover:bg-sky-100 hover:text-sky-900"
                >
                  Incident Triage
                </Link>
                <Link
                  href="/rag"
                  className="rounded-full border border-sky-100 bg-white px-4 py-2 transition hover:border-sky-200 hover:bg-sky-50 hover:text-sky-900"
                >
                  Knowledge Base
                </Link>
              </nav>
            </div>
          </header>

          <div className="max-w-3xl py-10 lg:py-20">
            <span className="inline-flex rounded-full border border-sky-200 bg-sky-50 px-4 py-2 text-sm font-semibold text-sky-700 shadow-sm">
              Built for site reports, safety work, and production follow-up
            </span>
            <h1 className="mt-6 max-w-4xl text-5xl font-semibold tracking-tight text-slate-950 sm:text-6xl lg:text-7xl">
              Mining operations intelligence on a local stack.
            </h1>
            <p className="mt-6 max-w-2xl text-lg font-medium leading-8 text-slate-700">
              Built for African mine sites that need fast incident triage, equipment fault
              tracking, and cited answers from safety documents. The platform keeps each
              decision close to the field, the database, and the model.
            </p>

            <div className="mt-8 flex flex-wrap gap-4">
              <Link
                href="/triage"
                className="inline-flex items-center justify-center rounded-full bg-slate-950 px-6 py-3 text-sm font-bold text-white shadow-lg shadow-slate-950/20 transition duration-300 hover:-translate-y-1 hover:bg-slate-800"
              >
                Open Incident Triage
              </Link>
              <Link
                href="/rag"
                className="inline-flex items-center justify-center rounded-full border border-slate-200 bg-white px-6 py-3 text-sm font-bold text-slate-900 shadow-sm transition duration-300 hover:-translate-y-1 hover:border-sky-200 hover:bg-sky-50 hover:text-sky-900"
              >
                Open Knowledge Base
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-7xl px-6 py-14 lg:px-10 lg:py-16">
          <div className="grid gap-4 md:grid-cols-3">
            {highlights.map((item) => (
              <article
                key={item.label}
                className="rounded-xl bg-slate-50/75 px-5 py-6 shadow-sm ring-1 ring-slate-200/60 transition duration-300 hover:-translate-y-1 hover:bg-white hover:shadow-[0_18px_50px_-34px_rgba(15,23,42,0.28)]"
              >
                <p className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-500">
                  {item.label}
                </p>
                <p className="mt-3 max-w-sm text-lg leading-8 text-slate-800">{item.value}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="border-b border-slate-200 bg-slate-50">
        <div className="mx-auto max-w-7xl px-6 py-14 lg:px-10 lg:py-16">
          <div className="max-w-3xl">
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-500">
              Workflow strip
            </p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">
              Two workflows, one operational rhythm.
            </h2>
            <p className="mt-4 text-base leading-7 text-slate-600">
              Incident triage and document retrieval both stay close to the field, the database,
              and the model. The strip below shows the path each workflow follows.
            </p>
          </div>

          <div className="mt-10 grid gap-4">
            {howItWorks.map((flow) => (
              <article
                key={flow.title}
                className="grid gap-6 rounded-2xl bg-white/85 px-6 py-8 ring-1 ring-slate-200/70 transition duration-300 hover:-translate-y-1 hover:bg-white hover:shadow-[0_22px_60px_-40px_rgba(15,23,42,0.28)] lg:grid-cols-[0.9fr_1.1fr] lg:items-center lg:px-8"
              >
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.3em] text-sky-700">
                    How it works
                  </p>
                  <h3 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">
                    {flow.title}
                  </h3>
                  <p className="mt-3 text-sm leading-7 text-slate-600">{flow.description}</p>
                </div>

                <div className="flex flex-wrap items-center gap-3 text-sm font-semibold text-slate-700">
                  {flow.steps.map((step, index) => (
                    <span key={step} className="flex items-center gap-3">
                      <span className="rounded-full bg-sky-50 px-4 py-2 text-slate-800 ring-1 ring-sky-100">
                        {step}
                      </span>
                      {index < flow.steps.length - 1 ? (
                        <span className="text-slate-300">→</span>
                      ) : null}
                    </span>
                  ))}
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-white">
        <div className="mx-auto max-w-7xl px-6 py-14 lg:px-10 lg:py-16">
          <div className="grid gap-4 md:grid-cols-2">
            {capabilities.map((card) => (
              <article
                key={card.title}
                className="rounded-2xl bg-slate-50/75 px-6 py-8 ring-1 ring-slate-200/60 transition duration-300 hover:-translate-y-1 hover:bg-white hover:shadow-[0_22px_60px_-40px_rgba(15,23,42,0.28)] md:px-8 lg:px-10"
              >
                <div className={`h-1.5 w-16 rounded-full bg-gradient-to-r ${card.accent}`} />
                <p className="mt-5 text-xs font-semibold uppercase tracking-[0.28em] text-sky-700">
                  Workflow
                </p>
                <h3 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">
                  {card.title}
                </h3>
                <p className="mt-4 max-w-xl text-base leading-8 text-slate-600">
                  {card.description}
                </p>
                <Link
                  href={card.href}
                  className="mt-6 inline-flex items-center text-sm font-semibold text-slate-950 underline-offset-4 transition hover:underline"
                >
                  Open workflow
                  <span className="ml-2">-&gt;</span>
                </Link>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="border-t border-slate-200 bg-slate-950 text-slate-100">
        <div className="mx-auto max-w-7xl px-6 py-14 lg:px-10 lg:py-16">
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-400">
            Operational notes
          </p>
          <ul className="mt-4 space-y-3 text-sm leading-7 text-slate-300">
            <li>Operational incidents keep the reporter, site, and equipment context together.</li>
            <li>Mining documents stay grounded with PostgreSQL retrieval and citations.</li>
            <li>Model and database failures surface clearly so crews can retry without losing context.</li>
          </ul>
        </div>
      </section>
    </main>
  );
}
