"use client";

export default function Error({ reset }: { error: Error; reset: () => void }) {
  return (
    <main className="mx-auto flex min-h-[60vh] w-full max-w-3xl items-center px-4 py-16">
      <section className="w-full rounded-[2rem] border border-rose-400/20 bg-rose-500/10 p-8">
        <h1 className="text-2xl font-semibold text-white">Something went wrong</h1>
        <p className="mt-3 text-white/70">
          dose.wiki hit an unexpected error while loading this page. Try again, or return to the public index if the issue persists.
        </p>
        <button
          type="button"
          onClick={reset}
          className="mt-6 rounded-full border border-rose-300/40 bg-rose-500/15 px-5 py-2.5 text-sm font-medium text-rose-100 transition hover:bg-rose-500/25"
        >
          Retry
        </button>
      </section>
    </main>
  );
}
