import Link from "next/link";
import { Github, Info } from "lucide-react";
import { AppImage } from "../common/AppImage";
import { ThemeToggle } from "@/app/_components/ThemeToggle";

export function Footer() {
  const logoSrc = "/dosewiki-logo.png";

  return (
    <footer className="app-footer theme-footer-surface border-t py-6">
      <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex max-w-3xl items-start gap-3">
            <Link href="/" className="group inline-flex shrink-0 self-start">
              <AppImage
                src={logoSrc}
                alt="dose.wiki logo"
                width={32}
                height={32}
                className="h-8 w-8 opacity-90 transition-opacity group-hover:opacity-100"
                draggable={false}
              />
            </Link>

            <div className="flex min-w-0 flex-col gap-1 leading-tight">
              <Link href="/" className="group self-start">
                <span className="theme-accent-heading font-display text-base font-semibold tracking-tight transition-colors group-hover:text-[color:var(--theme-accent-soft)]">
                  dose.wiki
                </span>
              </Link>

              <p className="theme-text-faint text-xs leading-5">
                Community harm-reduction information. Not medical advice. Content is available under the{" "}
                <a
                  href="https://creativecommons.org/licenses/by-sa/4.0/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="theme-link-muted transition-colors"
                >
                  CC BY-SA 4.0 license
                </a>
                .
              </p>
            </div>
          </div>

          <nav className="theme-text-muted flex flex-wrap items-center gap-x-3 gap-y-2 text-sm font-medium sm:justify-end">
            <Link
              href="/about"
              aria-label="About"
              title="About"
              className="theme-icon-button inline-flex h-11 w-11 items-center justify-center rounded-full transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fuchsia-400"
            >
              <Info size={18} />
            </Link>
            <a
              href="https://github.com/dose-wiki/dose.wiki"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="dose.wiki GitHub"
              className="theme-icon-button inline-flex h-11 w-11 items-center justify-center rounded-full transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fuchsia-400"
            >
              <Github size={18} />
            </a>
            <ThemeToggle />
          </nav>
        </div>
      </div>
    </footer>
  );
}
