import { useEffect, useRef, useState } from "react";
import { Icon, type IconName } from "../common/Icon";
import logoDataUri from "../../assets/dosewiki-logo.svg?inline";
import { AppView } from "../../types/navigation";
import { viewToPath } from "../../utils/routing";
import { GlobalSearch } from "../common/GlobalSearch";
import { Button } from "@/components/ui/button";

interface HeaderProps {
  currentView: AppView;
  onNavigate: (view: AppView) => void;
}

export function Header({ currentView, onNavigate }: HeaderProps) {
  const substancesView: AppView = { type: "substances" };
  const effectsView: AppView = { type: "effects" };
  const reportsView: AppView = { type: "reports" };
  const devView: AppView = { type: "dev", tab: "articles" };
  const aboutView: AppView = { type: "about" };
  const navItems: Array<{ label: string; view: AppView; icon: IconName }> = [
    { label: "Substances", view: substancesView, icon: "lucide:flask-conical" },
    { label: "Effects", view: effectsView, icon: "lucide:sparkles" },
    { label: "Reports", view: reportsView, icon: "lucide:file-signature" },
    { label: "Dev", view: devView, icon: "lucide:wrench" },
  ];
  const aboutPath = viewToPath(aboutView);
  const isAboutActive = currentView.type === "about";

  const isActive = (itemView: AppView) => {
    if (itemView.type === "substances") {
      return (
        currentView.type === "substances" ||
        currentView.type === "category" ||
        currentView.type === "substance" ||
        currentView.type === "mechanism"
      );
    }

    if (itemView.type === "effects") {
      return (
        currentView.type === "effects" ||
        currentView.type === "effect" ||
        currentView.type === "effect-category"
      );
    }

    if (itemView.type === "reports") {
      return currentView.type === "reports" || currentView.type === "report";
    }

    if (itemView.type === "dev") {
      return currentView.type === "dev";
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

  const isSafari =
    typeof document !== "undefined" &&
    document.documentElement.classList.contains("is-safari");
  const logoSrc = isSafari ? "/dosewiki-logo.png" : logoDataUri;

  return (
    <header className="app-header border-b border-white/10 bg-[#0f0a1f]/80 backdrop-blur backdrop-safe">
      <div className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-3 gap-fallback-row-4">
        <Button
          variant="brand"
          onClick={() => handleNavigate(substancesView)}
        >
          <span className="inline-flex items-center justify-center transition-transform duration-200 group-hover/brand:scale-105 group-focus-visible/brand:scale-105">
            <img
              src={logoSrc}
              alt="dose.wiki logo"
              className="safari-svg-gpu h-9 w-9 animate-[spin_120s_linear_infinite] md:h-10 md:w-10"
              draggable={false}
            />
          </span>
          <span className="inline-flex items-center text-2xl font-display font-bold tracking-tight text-fuchsia-300 transition-transform duration-200 group-hover/brand:scale-[1.04] group-focus-visible/brand:scale-[1.04]">
            dose.wiki
          </span>
        </Button>

        <div className="flex min-h-[44px] min-w-0 flex-1 items-center">
          <GlobalSearch
            currentView={currentView}
            onNavigate={onNavigate}
            containerClassName="w-full"
            compact
          />
        </div>

        <div className="ml-2 hidden flex-shrink-0 items-center gap-6 md:flex gap-fallback-row-6">
          <nav className="flex items-center gap-6 text-sm text-white/80 gap-fallback-row-6">
            {navItems.map(({ label, view, icon }) => {
              const itemPath = viewToPath(view);
              const active = isActive(view);

              return (
                <a
                  key={label}
                  href={itemPath}
                  onClick={(event) => {
                    event.preventDefault();
                    handleNavigate(view);
                  }}
                  className={`relative flex items-center gap-2 font-medium transition-colors hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fuchsia-400 ${
                    active ? "text-white" : "text-white/70"
                  }`}
                >
                  <Icon icon={icon} size={16} />
                  <span className="relative inline-flex">
                    {label}
                    {active && (
                      <span className="pointer-events-none absolute -bottom-1 left-0 right-0 h-0.5 rounded-full bg-fuchsia-400" />
                    )}
                  </span>
                </a>
              );
            })}
          </nav>
          <a
            href={aboutPath}
            onClick={(event) => {
              event.preventDefault();
              handleNavigate(aboutView);
            }}
            className={`flex items-center gap-2 rounded-xl px-3 py-1.5 text-white/90 ring-1 transition ${
              isAboutActive
                ? "bg-fuchsia-500/25 text-white ring-fuchsia-400/60 shadow-[0_8px_24px_rgba(232,121,249,0.25)] hover:bg-fuchsia-500/30"
                : "bg-white/10 ring-white/15 hover:bg-white/15"
            }`}
          >
            <Icon icon="lucide:info" size={16} />
            <span>About</span>
          </a>
        </div>

        <div className="relative flex-shrink-0 md:hidden">
          <Button
            ref={menuButtonRef}
            variant="secondary"
            size="icon"
            onClick={() => setIsMenuOpen((prev) => !prev)}
            className="h-9 w-9"
            aria-haspopup="true"
            aria-expanded={isMenuOpen}
            aria-controls="mobile-nav"
          >
            {isMenuOpen ? <Icon icon="lucide:x" size={20} /> : <Icon icon="lucide:menu" size={20} />}
            <span className="sr-only">Toggle navigation</span>
          </Button>

          {isMenuOpen && (
            <div
              ref={menuPanelRef}
              id="mobile-nav"
              className="absolute right-0 top-[calc(100%+0.75rem)] w-56 rounded-2xl border border-white/10 bg-[#120d27] p-4 shadow-xl shadow-black/50"
            >
              <nav className="flex flex-col gap-2 text-sm gap-fallback-col-2">
                {navItems.map(({ label, view, icon }) => {
                  const itemPath = viewToPath(view);
                  const active = isActive(view);
                  return (
                    <a
                      key={label}
                      href={itemPath}
                      onClick={(event) => {
                        event.preventDefault();
                        handleNavigate(view);
                      }}
                      className={`flex items-center justify-between rounded-xl px-3 py-2 transition ${
                        active ? "bg-white/15 text-white" : "text-white/80 hover:bg-white/10 hover:text-white"
                      }`}
                    >
                      <span className="flex items-center gap-2">
                        <Icon icon={icon} size={16} />
                        <span>{label}</span>
                      </span>
                      {active && <span className="h-2 w-2 rounded-full bg-fuchsia-400" />}
                    </a>
                  );
                })}
              </nav>
              <a
                href={aboutPath}
                onClick={(event) => {
                  event.preventDefault();
                  handleNavigate(aboutView);
                }}
                className={`mt-4 flex w-full items-center justify-center gap-2 rounded-xl px-3 py-2 text-sm font-medium text-white/90 ring-1 transition ${
                  isAboutActive
                    ? "bg-fuchsia-500/25 text-white ring-fuchsia-400/60 shadow-[0_8px_24px_rgba(232,121,249,0.25)] hover:bg-fuchsia-500/30"
                    : "bg-white/10 ring-white/15 hover:bg-white/15"
                }`}
              >
                <Icon icon="lucide:info" size={16} />
                <span>About</span>
              </a>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
