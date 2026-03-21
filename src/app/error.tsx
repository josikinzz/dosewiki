"use client";

import { Button } from "@/components/ui/button";

export default function Error({ reset }: { error: Error; reset: () => void }) {
  return (
    <main id="main-content" tabIndex={-1} className="mx-auto flex min-h-[60vh] w-full max-w-3xl items-center px-4 py-16 focus:outline-none">
      <section className="w-full rounded-[2rem] border border-[color:var(--theme-danger-border)] bg-[color:var(--theme-danger-bg)] p-8">
        <h1 className="text-2xl font-semibold text-white">Something went wrong</h1>
        <p className="mt-3 text-white/70">
          dose.wiki hit an unexpected error while loading this page. Try again, or return to the public index if the issue persists.
        </p>
        <Button type="button" onClick={reset} variant="destructive" className="mt-6">
          Retry
        </Button>
      </section>
    </main>
  );
}
