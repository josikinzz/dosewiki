export function Footer() {
  return (
    <footer className="border-t border-white/10">
      <div className="relative mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-4 py-10 text-xs text-white/60 md:flex-row">
        <p className="text-center md:text-left">
          <a
            href="https://github.com/josikinzz/dosewiki"
            className="font-semibold text-white/80 transition hover:text-fuchsia-200"
            target="_blank"
            rel="noreferrer"
          >
            Fully open source on GitHub
          </a>
          <span className="mx-2 text-white/40" aria-hidden="true">
            ·
          </span>
          Use responsibly.
        </p>
      </div>
    </footer>
  );
}
