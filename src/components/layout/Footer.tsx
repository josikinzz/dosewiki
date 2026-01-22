import { Icon } from "../common/Icon";
import logoDataUri from "../../assets/dosewiki-logo.svg?inline";

export function Footer() {
  const isSafari =
    typeof document !== "undefined" &&
    document.documentElement.classList.contains("is-safari");
  const logoSrc = isSafari ? "/dosewiki-logo.png" : logoDataUri;

  return (
    <footer className="border-t border-white/5 bg-[#0b0818] py-8">
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
          
          <div className="hidden h-4 w-px bg-white/10 md:block" />
          
          <p className="text-sm text-white/50">
            <a
              href="https://creativecommons.org/licenses/by-sa/4.0/"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-white/80 transition-colors"
            >
              CC BY-SA 4.0
            </a>
          </p>
        </div>

        {/* Right: Links & Safety */}
        <nav className="flex flex-wrap items-center justify-center gap-6 text-sm font-medium text-white/60">
          <a href="/about" className="transition-colors hover:text-white">About</a>
          <a 
            href="https://github.com/dose-wiki/dose.wiki" 
            target="_blank" 
            rel="noopener noreferrer" 
            className="flex items-center gap-2 transition-colors hover:text-white"
          >
            <Icon icon="lucide:github" size={16} />
            <span>GitHub</span>
          </a>
          
          <span className="hidden text-white/10 md:block" aria-hidden="true">|</span>
          
          <span className="flex items-center gap-2 text-rose-400/80" title="Not medical advice">
            <Icon icon="lucide:alert-triangle" size={14} />
            <span>Use responsibly</span>
          </span>
        </nav>
      </div>
    </footer>
  );
}
