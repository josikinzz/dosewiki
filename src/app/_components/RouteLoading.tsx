export function RouteLoading({ label }: { label: string }) {
  return (
    <main id="main-content" tabIndex={-1} className="mx-auto flex min-h-[calc(100vh-12rem)] w-full max-w-5xl items-center px-4 py-16 focus:outline-none">
      <section className="w-full rounded-[2rem] border border-white/10 bg-white/[0.04] p-8 shadow-2xl shadow-black/20 backdrop-blur-xl">
        <div className="inline-flex rounded-full border border-fuchsia-400/30 bg-fuchsia-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.3em] text-fuchsia-200">
          Loading
        </div>
        <h1 className="mt-4 font-display text-3xl font-bold tracking-tight text-white">{label}</h1>
        <p className="mt-4 text-base leading-7 text-white/70">Fetching the routed content from Convex.</p>
      </section>
    </main>
  );
}
