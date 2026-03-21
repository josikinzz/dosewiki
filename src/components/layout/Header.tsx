import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { FileSignature, FlaskConical, Info, Menu, Sparkles, X } from "lucide-react";
import { AppImage } from "../common/AppImage";
import { AppView } from "../../types/navigation";
import { viewToPath } from "../../utils/routing";
import { Button } from "@/components/ui/button";

const GlobalSearch = dynamic(
  () => import("../common/GlobalSearch").then((mod) => mod.GlobalSearch),
  {
    ssr: false,
    loading: () => (
      <div
        aria-hidden="true"
        className="h-11 w-full rounded-full border border-white/10 bg-white/[0.04] shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]"
      />
    ),
  },
);

// Static view objects and nav items (moved to module scope to prevent recreation every render)
const SUBSTANCES_VIEW: AppView = { type: "substances" };
const EFFECTS_VIEW: AppView = { type: "effects" };
const REPORTS_VIEW: AppView = { type: "reports" };
const ABOUT_VIEW: AppView = { type: "about" };
const NAV_ITEMS = [
  { label: "Substances", view: SUBSTANCES_VIEW, Icon: FlaskConical },
  { label: "Effects", view: EFFECTS_VIEW, Icon: Sparkles },
  { label: "Reports", view: REPORTS_VIEW, Icon: FileSignature },
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

  return (
    <header className="app-header theme-header-surface border-b backdrop-blur-sm backdrop-safe">
      <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-3 gap-fallback-row-4 md:grid md:grid-cols-[auto_minmax(0,1fr)_auto] md:gap-4">
        <Button asChild variant="brand" className="pl-0 hover:bg-transparent">
          <Link href={viewToPath(SUBSTANCES_VIEW)}>
          <span className="inline-flex items-center justify-center transition-transform duration-200 group-hover/brand:scale-105 group-focus-visible/brand:scale-105">
            <AppImage
              src="/dosewiki-logo.png"
              alt="dose.wiki logo"
              width={40}
              height={40}
              priority
              className="safari-svg-gpu h-8 w-8 md:h-10 md:w-10"
              draggable={false}
            />
          </span>
          <span className="theme-accent-heading inline-flex items-center text-[1.6rem] font-display font-bold tracking-tight transition-transform duration-200 group-hover/brand:scale-[1.04] group-focus-visible/brand:scale-[1.04] md:text-2xl">
            dose.wiki
          </span>
          </Link>
        </Button>

        <div className="flex min-h-[44px] min-w-0 flex-1 items-center md:w-full md:max-w-2xl md:justify-self-center">
          <GlobalSearch
            currentView={currentView}
            onNavigate={onNavigate}
            containerClassName="w-full"
            compact
          />
        </div>

        <div className="ml-auto hidden flex-shrink-0 items-center gap-2 md:ml-0 md:flex">
          <nav className="flex items-center gap-1">
            {NAV_ITEMS.map(({ label, view, Icon: NavIcon }) => {
              const itemPath = viewToPath(view);
              const active = isActive(view);

              return (
                <Link
                  key={label}
                  href={itemPath}
                  data-active={active}
                  className={`theme-header-nav-link relative flex min-h-11 items-center gap-2 rounded-full border border-transparent px-4 py-2 text-sm font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fuchsia-400 ${
                    active
                      ? "ring-1 ring-[color:var(--theme-card-border)]"
                      : ""
                  }`}
                  aria-current={active ? "page" : undefined}
                >
                  <NavIcon size={16} className="theme-header-nav-icon" />
                  <span>{label}</span>
                </Link>
              );
            })}
          </nav>
          
          <div className="theme-divider mx-2 h-6 w-px" />

          <Link
            href={ABOUT_PATH}
            data-active={isAboutActive}
            className={`theme-header-nav-link flex min-h-11 items-center gap-2 rounded-full border border-transparent px-4 py-2 text-sm font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fuchsia-400 ${
              isAboutActive
                ? "ring-1 ring-[color:var(--theme-card-border)]"
                : ""
            }`}
            aria-current={isAboutActive ? "page" : undefined}
          >
            <Info size={16} className="theme-header-nav-icon" />
            <span>About</span>
          </Link>
        </div>

        <div className="relative flex-shrink-0 md:hidden ml-auto">
          <Button
            ref={menuButtonRef}
            variant="ghost"
            size="icon"
            onClick={() => setIsMenuOpen((prev) => !prev)}
            className="theme-icon-button h-11 w-11 rounded-full"
            aria-haspopup="true"
            aria-expanded={isMenuOpen}
            aria-controls="mobile-nav"
          >
            {isMenuOpen ? <X size={20} /> : <Menu size={20} />}
            <span className="sr-only">Toggle navigation</span>
          </Button>

          {isMenuOpen && (
            <div
              ref={menuPanelRef}
              id="mobile-nav"
              className="theme-overlay-surface absolute right-0 top-[calc(100%+0.5rem)] w-64 origin-top-right rounded-2xl border p-2 shadow-xl ring-1 ring-[color:var(--theme-border-subtle)] backdrop-blur-sm"
            >
              <nav className="flex flex-col gap-1">
                {NAV_ITEMS.map(({ label, view, Icon: NavIcon }) => {
                  const itemPath = viewToPath(view);
                  const active = isActive(view);
                  return (
                    <Link
                      key={label}
                      href={itemPath}
                      onClick={() => setIsMenuOpen(false)}
                      data-active={active}
                      className={`theme-header-nav-link flex min-h-11 items-center gap-3 rounded-xl border border-transparent px-3 py-2.5 text-sm font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fuchsia-400 ${
                        active 
                          ? "ring-1 ring-[color:var(--theme-card-border)]" 
                          : ""
                      }`}
                      aria-current={active ? "page" : undefined}
                    >
                      <NavIcon size={18} className="theme-header-nav-icon" />
                      <span>{label}</span>
                      {active && <div className="theme-header-nav-indicator ml-auto h-1.5 w-1.5 rounded-full" />}
                    </Link>
                  );
                })}
              </nav>
              
              <div className="theme-divider my-2 h-px" />
              
              <Link
                href={ABOUT_PATH}
                onClick={() => setIsMenuOpen(false)}
                data-active={isAboutActive}
                className={`theme-header-nav-link flex min-h-11 items-center gap-3 rounded-xl border border-transparent px-3 py-2.5 text-sm font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fuchsia-400 ${
                  isAboutActive
                    ? "ring-1 ring-[color:var(--theme-card-border)]"
                    : ""
                }`}
                aria-current={isAboutActive ? "page" : undefined}
              >
                <Info size={18} className="theme-header-nav-icon" />
                <span>About dose.wiki</span>
              </Link>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
