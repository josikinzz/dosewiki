import Link from "next/link";
import { Icon } from "../common/Icon";
import { AppImage } from "../common/AppImage";
import logoDataUri from "../../assets/dosewiki-logo.svg?inline";
import { ThemeToggle } from "@/app/_components/ThemeToggle";

export function Footer() {
  const isSafari =
    typeof document !== "undefined" &&
    document.documentElement.classList.contains("is-safari");
  const logoSrc = isSafari ? "/dosewiki-logo.png" : logoDataUri;

  return (
    <footer className="app-footer theme-footer-surface border-t py-8">
      <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-6 px-4 md:flex-row">
        {/* Left: Brand & License */}
        <div className="flex flex-col items-center gap-4 md:flex-row md:gap-6">
          <Link href="/" className="flex items-center gap-2 group">
            <div className="relative flex h-8 w-8 items-center justify-center rounded-lg bg-fuchsia-500/10 ring-1 ring-inset ring-fuchsia-500/20 transition-[background-color,box-shadow] group-hover:bg-fuchsia-500/15 group-hover:ring-fuchsia-500/25">
              <AppImage
                src={logoSrc}
                alt="dose.wiki logo"
                width={20}
                height={20}
                className="h-5 w-5 transition-transform duration-500 group-hover:rotate-12"
                draggable={false}
              />
            </div>
            <span className="font-display text-lg font-bold tracking-tight text-fuchsia-300 transition-colors group-hover:text-fuchsia-200">
              dose.wiki
            </span>
          </Link>

          <div className="theme-divider hidden h-4 w-px md:block" />

          <p className="theme-text-faint text-sm">
            <a
              href="https://creativecommons.org/licenses/by-sa/4.0/"
              target="_blank"
              rel="noopener noreferrer"
              className="theme-link-muted transition-colors"
            >
              CC BY-SA 4.0
            </a>
          </p>
        </div>

        {/* Right: Links & Safety */}
        <nav className="theme-text-muted flex flex-wrap items-center justify-center gap-4 text-sm font-medium md:gap-6">
          <Link href="/about" className="theme-link-muted transition-colors">About</Link>
          <a
            href="https://github.com/dose-wiki/dose.wiki"
            target="_blank"
            rel="noopener noreferrer"
            className="theme-link-muted flex items-center gap-2 transition-colors"
          >
            <Icon icon="lucide:github" size={16} />
            <span>GitHub</span>
          </a>

          <ThemeToggle />

          <span className="theme-text-faint hidden md:block" aria-hidden="true">|</span>

          <span className="flex items-center gap-2 text-[color:var(--theme-danger-text)]" title="Not medical advice">
            <Icon icon="lucide:alert-triangle" size={14} />
            <span>Use responsibly</span>
          </span>
        </nav>
      </div>
    </footer>
  );
}
