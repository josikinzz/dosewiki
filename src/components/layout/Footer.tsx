import { Icon } from "../common/Icon";
import logoDataUri from "../../assets/dosewiki-logo.svg?inline";
import { useTheme } from "../../context/ThemeContext";

export function Footer() {
  const { theme, toggleTheme } = useTheme();
  const isSafari =
    typeof document !== "undefined" &&
    document.documentElement.classList.contains("is-safari");
  const logoSrc = isSafari ? "/dosewiki-logo.png" : logoDataUri;
  const isLight = theme === "light";

  return (
    <footer className="app-footer theme-footer-surface border-t py-8">
      <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-6 px-4 md:flex-row">
        {/* Left: Brand & License */}
        <div className="flex flex-col items-center gap-4 md:flex-row md:gap-6">
          <a href="/" className="flex items-center gap-2 group">
            <div className="relative flex h-8 w-8 items-center justify-center rounded-lg bg-fuchsia-500/10 ring-1 ring-inset ring-fuchsia-500/20 transition-all group-hover:bg-fuchsia-500/20 group-hover:ring-fuchsia-500/30">
              <img
                src={logoSrc}
                alt="dose.wiki logo"
                className="h-5 w-5 transition-transform duration-500 group-hover:rotate-12"
                draggable={false}
              />
            </div>
            <span className="font-display text-lg font-bold tracking-tight text-fuchsia-300 transition-colors group-hover:text-fuchsia-200">
              dose.wiki
            </span>
          </a>

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
          <a href="/about" className="theme-link-muted transition-colors">About</a>
          <a
            href="https://github.com/dose-wiki/dose.wiki"
            target="_blank"
            rel="noopener noreferrer"
            className="theme-link-muted flex items-center gap-2 transition-colors"
          >
            <Icon icon="lucide:github" size={16} />
            <span>GitHub</span>
          </a>

          <button
            type="button"
            onClick={toggleTheme}
            aria-pressed={isLight}
            aria-label={`Switch to ${isLight ? "dark" : "light"} mode`}
            className="theme-toggle-pill inline-flex min-h-11 items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition"
          >
            <Icon
              icon={isLight ? "lucide:sun" : "lucide:moon-star"}
              size={16}
              className="text-fuchsia-300"
            />
            <span>{isLight ? "Light mode" : "Dark mode"}</span>
          </button>

          <span className="theme-text-faint hidden md:block" aria-hidden="true">|</span>

          <span className="flex items-center gap-2 text-rose-400/80" title="Not medical advice">
            <Icon icon="lucide:alert-triangle" size={14} />
            <span>Use responsibly</span>
          </span>
        </nav>
      </div>
    </footer>
  );
}
