import { useEffect, useRef, useState } from "react";
import { Menu, X } from "lucide-react";
import logoDataUri from "../../assets/dosewiki-logo.svg?inline";
import { AppView } from "../../types/navigation";
import { viewToHash } from "../../utils/routing";

interface HeaderProps {
  currentView: AppView;
  defaultSlug: string;
  onNavigate: (view: AppView) => void;
}

export function Header({ currentView, defaultSlug, onNavigate }: HeaderProps) {
  const substancesView: AppView = { type: "substances" };
  const articleView: AppView =
    currentView.type === "substance"
      ? currentView
      : { type: "substance", slug: defaultSlug };

  const navItems = [
    { label: "Substances", view: substancesView },
    { label: "Effects", view: { type: "effects" as const } },
    { label: "Interactions", view: { type: "interactions" as const } },
    { label: "About", view: { type: "about" as const } },
  ];

  const isActive = (itemView: AppView) => {
    if (itemView.type === "substances") {
      return (
        currentView.type === "substances" ||
        currentView.type === "category" ||
        currentView.type === "substance"
      );
    }

    if (itemView.type === "effects") {
      return currentView.type === "effects" || currentView.type === "effect";
    }

    return itemView.type === currentView.type;
  };

  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement | null>(null);
  const menuPanelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setIsMenuOpen(false);
  }, [currentView]);

  useEffect(() => {
    if (!isMenuOpen) {
      return;
    }

    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (
        menuPanelRef.current &&
        !menuPanelRef.current.contains(target) &&
        !menuButtonRef.current?.contains(target)
      ) {
        setIsMenuOpen(false);
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsMenuOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [isMenuOpen]);

  const handleNavigate = (view: AppView) => {
    onNavigate(view);
    setIsMenuOpen(false);
  };

  return (
    <header className="sticky top-0 z-50 border-b border-white/10 bg-[#0f0a1f]/70 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-3">
        <button
          type="button"
          onClick={() => handleNavigate(substancesView)}
          className="-ml-1 group/brand flex items-center gap-2 text-left sm:-ml-2"
        >
          <span className="inline-flex items-center justify-center transition-transform duration-200 group-hover/brand:scale-105 group-focus-visible/brand:scale-105">
            <img
              src={logoDataUri}
              alt="dose.wiki logo"
              className="h-9 w-9 md:h-10 md:w-10"
              draggable={false}
            />
          </span>
          <span className="inline-flex items-center bg-gradient-to-r from-fuchsia-300 to-violet-200 bg-clip-text text-xl font-bold tracking-tight text-transparent transition-transform duration-200 group-hover/brand:scale-[1.04] group-focus-visible/brand:scale-[1.04]">
            dose.wiki
          </span>
        </button>

        <div className="ml-auto hidden items-center gap-4 md:flex">
          <nav className="flex items-center gap-6 text-sm text-white/80">
            {navItems.map((item) => {
              const itemHash = viewToHash(item.view.type === "substance" ? articleView : item.view);

              return (
                <a
                  key={item.label}
                  href={itemHash}
                  onClick={(event) => {
                    event.preventDefault();
                    handleNavigate(item.view);
                  }}
                  className={`relative font-medium transition-colors hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fuchsia-400 ${
                    isActive(item.view) ? "text-white" : "text-white/70"
                  }`}
                >
                  {item.label}
                  {isActive(item.view) && (
                    <span className="pointer-events-none absolute -bottom-1 left-1/2 h-0.5 w-6 -translate-x-1/2 rounded-full bg-fuchsia-400" />
                  )}
                </a>
              );
            })}
          </nav>
          <button className="rounded-xl bg-white/10 px-3 py-1.5 text-white/90 ring-1 ring-white/15 transition hover:bg-white/15">
            Donate
          </button>
        </div>

        <div className="relative ml-auto md:hidden">
          <button
            ref={menuButtonRef}
            type="button"
            onClick={() => setIsMenuOpen((prev) => !prev)}
            className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-white/10 text-white transition hover:bg-white/15 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fuchsia-400"
            aria-haspopup="true"
            aria-expanded={isMenuOpen}
            aria-controls="mobile-nav"
          >
            {isMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            <span className="sr-only">Toggle navigation</span>
          </button>

          {isMenuOpen && (
            <div
              ref={menuPanelRef}
              id="mobile-nav"
              className="absolute right-0 top-[calc(100%+0.75rem)] w-56 rounded-2xl border border-white/10 bg-[#120d27] p-4 shadow-xl shadow-black/50"
            >
              <nav className="flex flex-col gap-2 text-sm">
                {navItems.map((item) => {
                  const itemHash = viewToHash(item.view.type === "substance" ? articleView : item.view);
                  const active = isActive(item.view);
                  return (
                    <a
                      key={item.label}
                      href={itemHash}
                      onClick={(event) => {
                        event.preventDefault();
                        handleNavigate(item.view);
                      }}
                      className={`flex items-center justify-between rounded-xl px-3 py-2 transition ${
                        active ? "bg-white/15 text-white" : "text-white/80 hover:bg-white/10 hover:text-white"
                      }`}
                    >
                      <span>{item.label}</span>
                      {active && <span className="h-2 w-2 rounded-full bg-fuchsia-400" />}
                    </a>
                  );
                })}
              </nav>
              <button className="mt-4 w-full rounded-xl bg-white/10 px-3 py-2 text-sm font-medium text-white/90 ring-1 ring-white/15 transition hover:bg-white/15">
                Donate
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
