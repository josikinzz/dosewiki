export function RouteLoading({ label }: { label: string }) {
  return (
    <main
      id="main-content"
      tabIndex={-1}
      className="mx-auto min-h-[50vh] w-full max-w-5xl px-4 py-10 focus:outline-none"
      aria-busy="true"
      aria-live="polite"
    >
      <div className="mx-auto max-w-4xl space-y-6">
        <p className="theme-text-faint text-[11px] font-semibold uppercase tracking-[0.24em]">{label}</p>

        <div className="space-y-3">
          <div className="h-10 w-2/3 animate-pulse rounded-2xl bg-white/8" />
          <div className="h-4 w-full animate-pulse rounded-full bg-white/6" />
          <div className="h-4 w-5/6 animate-pulse rounded-full bg-white/6" />
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-3 rounded-2xl border border-white/10 bg-white/[0.03] p-5">
            <div className="h-5 w-1/3 animate-pulse rounded-full bg-white/8" />
            <div className="h-4 w-full animate-pulse rounded-full bg-white/6" />
            <div className="h-4 w-4/5 animate-pulse rounded-full bg-white/6" />
            <div className="h-4 w-3/5 animate-pulse rounded-full bg-white/6" />
          </div>

          <div className="space-y-3 rounded-2xl border border-white/10 bg-white/[0.03] p-5">
            <div className="h-5 w-2/5 animate-pulse rounded-full bg-white/8" />
            <div className="h-4 w-full animate-pulse rounded-full bg-white/6" />
            <div className="h-4 w-5/6 animate-pulse rounded-full bg-white/6" />
            <div className="h-4 w-2/3 animate-pulse rounded-full bg-white/6" />
          </div>
        </div>
      </div>
    </main>
  );
}
