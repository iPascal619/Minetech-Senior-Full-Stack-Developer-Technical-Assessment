'use client';

export default function GlobalError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  return (
    <html lang="en">
      <body className="flex min-h-screen items-center justify-center bg-slate-950 px-6 text-slate-100">
        <div className="max-w-xl rounded-3xl border border-white/10 bg-white/5 p-8 shadow-2xl backdrop-blur">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">
            MineTech Assessment
          </p>
          <h1 className="mt-4 text-3xl font-semibold tracking-tight text-white">
            Something went wrong
          </h1>
          <p className="mt-4 text-sm leading-7 text-slate-300">
            The application hit a fatal rendering error. You can retry the page after the
            environment reloads.
          </p>
          <p className="mt-4 rounded-2xl bg-black/30 px-4 py-3 text-xs leading-6 text-slate-300">
            {error.message}
          </p>
          <button
            type="button"
            onClick={() => unstable_retry()}
            className="mt-6 inline-flex items-center justify-center rounded-full bg-white px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-slate-200"
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}