export default function Loading() {
  return (
    <main className="mx-auto flex min-h-[60vh] w-full max-w-5xl items-center justify-center px-4 py-16">
      <div className="flex flex-col items-center gap-3">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-fuchsia-500 border-t-transparent" />
        <p className="theme-text-muted text-sm">Loading dose.wiki…</p>
      </div>
    </main>
  );
}
