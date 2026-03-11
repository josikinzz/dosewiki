import { useEffect, useRef, useState } from "react";
import { Icon, type IconName } from "../common/Icon";
import logoDataUri from "../../assets/dosewiki-logo.svg?inline";
import { AppView } from "../../types/navigation";
import { viewToPath } from "../../utils/routing";
import { GlobalSearch } from "../common/GlobalSearch";
import { Button } from "@/components/ui/button";

// Static view objects and nav items (moved to module scope to prevent recreation every render)
const SUBSTANCES_VIEW: AppView = { type: "substances" };
const EFFECTS_VIEW: AppView = { type: "effects" };
const REPORTS_VIEW: AppView = { type: "reports" };
const DEV_VIEW: AppView = { type: "dev", tab: "articles" };
const ABOUT_VIEW: AppView = { type: "about" };
const NAV_ITEMS: Array<{ label: string; view: AppView; icon: IconName }> = [
  { label: "Substances", view: SUBSTANCES_VIEW, icon: "lucide:flask-conical" },
  { label: "Effects", view: EFFECTS_VIEW, icon: "lucide:sparkles" },
  { label: "Reports", view: REPORTS_VIEW, icon: "lucide:file-signature" },
  { label: "Dev", view: DEV_VIEW, icon: "lucide:wrench" },
];
const ABOUT_PATH = viewToPath(ABOUT_VIEW);

interface HeaderProps {
  currentView: AppView;
  onNavigate: (view: AppView) => void;
}

export function Header({ currentView, onNavigate }: HeaderProps) {
  const isAboutActive = currentView.type === "about";

  const isActive = (itemView: AppView) => {
    if (itemView.type === "substances") {
      return (
        currentView.type === "substances" ||
        currentView.type === "category" ||
        currentView.type === "substance" ||
        currentView.type === "mechanism" ||
        currentView.type === "classification"
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
    <header className="app-header theme-header-surface border-b backdrop-blur-md backdrop-safe">
      <div className="mx-auto flex max-w-7xl items-center gap-4 px-4 py-3 gap-fallback-row-4">
        <Button
          variant="brand"
          onClick={() => handleNavigate(SUBSTANCES_VIEW)}
          className="pl-0 hover:bg-transparent"
        >
          <span className="inline-flex items-center justify-center transition-transform duration-200 group-hover/brand:scale-105 group-focus-visible/brand:scale-105">
            <img
              src={logoSrc}
              alt="dose.wiki logo"
              className="safari-svg-gpu h-9 w-9 animate-[spin_120s_linear_infinite] md:h-10 md:w-10"
              draggable={false}
            />
          </span>
          <span className="ml-3 inline-flex items-center text-2xl font-display font-bold tracking-tight text-fuchsia-300 transition-transform duration-200 group-hover/brand:scale-[1.04] group-focus-visible/brand:scale-[1.04]">
            dose.wiki
          </span>
        </Button>

        <div className="flex min-h-[44px] min-w-0 flex-1 items-center max-w-md ml-4">
          <GlobalSearch
            currentView={currentView}
            onNavigate={onNavigate}
            containerClassName="w-full"
            compact
          />
        </div>

        <div className="ml-auto hidden flex-shrink-0 items-center gap-2 md:flex">
          <nav className="flex items-center gap-1">
            {NAV_ITEMS.map(({ label, view, icon }) => {
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
                  className={`relative flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition-all ${
                    active
                      ? "bg-white/10 text-white shadow-sm ring-1 ring-white/10"
                      : "text-white/60 hover:bg-white/5 hover:text-white"
                  }`}
                >
                  <Icon icon={icon} size={16} className={active ? "text-fuchsia-300" : "opacity-70"} />
                  <span>{label}</span>
                </a>
              );
            })}
          </nav>
          
          <div className="theme-divider mx-2 h-6 w-px" />

          <a
            href={ABOUT_PATH}
            onClick={(event) => {
              event.preventDefault();
              handleNavigate(ABOUT_VIEW);
            }}
            className={`flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition-all ${
              isAboutActive
                ? "bg-fuchsia-500/20 text-fuchsia-200 ring-1 ring-fuchsia-500/30 shadow-[0_0_15px_rgba(232,121,249,0.15)]"
                : "text-white/60 hover:bg-white/5 hover:text-white"
            }`}
          >
            <Icon icon="lucide:info" size={16} />
            <span>About</span>
          </a>
        </div>

        <div className="relative flex-shrink-0 md:hidden ml-auto">
          <Button
            ref={menuButtonRef}
            variant="ghost"
            size="icon"
            onClick={() => setIsMenuOpen((prev) => !prev)}
            className="theme-icon-button h-10 w-10 rounded-full"
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
              className="theme-overlay-surface absolute right-0 top-[calc(100%+0.5rem)] w-64 origin-top-right rounded-2xl border p-2 shadow-xl backdrop-blur-xl"
            >
              <nav className="flex flex-col gap-1">
                {NAV_ITEMS.map(({ label, view, icon }) => {
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
                      className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${
                        active 
                          ? "bg-white/10 text-white" 
                          : "text-white/60 hover:bg-white/5 hover:text-white"
                      }`}
                    >
                      <Icon icon={icon} size={18} className={active ? "text-fuchsia-300" : "opacity-70"} />
                      <span>{label}</span>
                      {active && <div className="ml-auto h-1.5 w-1.5 rounded-full bg-fuchsia-400" />}
                    </a>
                  );
                })}
              </nav>
              
              <div className="theme-divider my-2 h-px" />
              
              <a
                href={ABOUT_PATH}
                onClick={(event) => {
                  event.preventDefault();
                  handleNavigate(ABOUT_VIEW);
                }}
                className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${
                  isAboutActive
                    ? "bg-fuchsia-500/20 text-fuchsia-200"
                    : "text-white/60 hover:bg-white/5 hover:text-white"
                }`}
              >
                <Icon icon="lucide:info" size={18} />
                <span>About dose.wiki</span>
              </a>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
