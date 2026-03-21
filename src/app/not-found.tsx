import Link from "next/link";

export default function NotFound() {
  return (
    <main id="main-content" tabIndex={-1} className="mx-auto flex min-h-[60vh] w-full max-w-3xl items-center px-4 py-16 focus:outline-none">
      <section className="w-full rounded-[2rem] border border-white/10 bg-white/[0.04] p-8 shadow-[0_24px_60px_-30px_rgba(0,0,0,0.7)]">
        <p className="text-sm font-semibold uppercase tracking-[0.3em] text-fuchsia-200">404</p>
        <h1 className="mt-3 text-3xl font-bold tracking-tight text-white">Page not found</h1>
        <p className="mt-4 text-white/70">
          The page you requested does not exist or may have moved. Try returning to the substance index or browsing one of the main library sections.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link href="/substances" className="rounded-full border border-fuchsia-400/40 bg-fuchsia-500/15 px-5 py-2.5 text-sm font-medium text-fuchsia-200 transition hover:border-fuchsia-300/70 hover:bg-fuchsia-500/25">
            Browse substances
          </Link>
          <Link href="/effects" className="rounded-full border border-white/15 bg-white/5 px-5 py-2.5 text-sm font-medium text-white/75 transition hover:bg-white/10 hover:text-white">
            Browse effects
          </Link>
        </div>
      </section>
    </main>
  );
}
