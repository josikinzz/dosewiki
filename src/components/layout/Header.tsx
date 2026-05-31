import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { FileSignature, FlaskConical, Info, Menu, Sparkles, X } from "lucide-react";
import { AppImage } from "../common/AppImage";
import type { AppView, RouteChromeIcon, RouteChromeModel } from "../../types/navigation";
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

const NAV_ICONS = {
  substances: FlaskConical,
  effects: Sparkles,
  reports: FileSignature,
  about: Info,
} satisfies Partial<Record<RouteChromeIcon, typeof FlaskConical>>;

interface HeaderProps {
  model: RouteChromeModel;
  onNavigate: (view: AppView) => void;
}

export function Header({ model, onNavigate }: HeaderProps) {
  const aboutItem = model.secondaryNavItems.find((item) => item.id === "about");
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement | null>(null);
  const menuPanelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setIsMenuOpen(false);
  }, [model.currentView]);

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
    <header className="app-header theme-header-surface backdrop-blur-sm backdrop-safe">
      <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-3 gap-fallback-row-4 md:grid md:grid-cols-[auto_minmax(0,1fr)_auto] md:gap-4">
        <Button asChild variant="ghost" className="group/brand flex items-center gap-2 pl-0 text-left hover:bg-transparent">
          <Link href={model.headerLogo.href}>
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
            currentView={model.currentView}
            onNavigate={onNavigate}
            containerClassName="w-full"
            compact
          />
        </div>

        <div className="ml-auto hidden flex-shrink-0 items-center gap-2 md:ml-0 md:flex">
          <nav className="flex items-center gap-1">
            {model.primaryNavItems.map((item) => {
              const NavIcon = NAV_ICONS[item.icon] ?? FlaskConical;

              return (
                <Link
                  key={item.id}
                  href={item.href}
                  data-active={item.active}
                  className={`theme-header-nav-link relative flex min-h-11 items-center gap-2 rounded-full border border-transparent px-4 py-2 text-sm font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fuchsia-400 ${
                    item.active
                      ? "ring-1 ring-[color:var(--theme-card-border)]"
                      : ""
                  }`}
                  aria-current={item.active ? "page" : undefined}
                >
                  <NavIcon size={16} className="theme-header-nav-icon" />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </nav>
          
          <div className="theme-divider mx-2 h-6 w-px" />

          {aboutItem && (
            <Link
              href={aboutItem.href}
              data-active={aboutItem.active}
              className={`theme-header-nav-link flex min-h-11 items-center gap-2 rounded-full border border-transparent px-4 py-2 text-sm font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fuchsia-400 ${
                aboutItem.active
                  ? "ring-1 ring-[color:var(--theme-card-border)]"
                  : ""
              }`}
              aria-current={aboutItem.active ? "page" : undefined}
            >
              <Info size={16} className="theme-header-nav-icon" />
              <span>{aboutItem.label}</span>
            </Link>
          )}
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
                {model.primaryNavItems.map((item) => {
                  const NavIcon = NAV_ICONS[item.icon] ?? FlaskConical;
                  return (
                    <Link
                      key={item.id}
                      href={item.href}
                      onClick={() => setIsMenuOpen(false)}
                      data-active={item.active}
                      className={`theme-header-nav-link flex min-h-11 items-center gap-3 rounded-xl border border-transparent px-3 py-2.5 text-sm font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fuchsia-400 ${
                        item.active 
                          ? "ring-1 ring-[color:var(--theme-card-border)]" 
                          : ""
                      }`}
                      aria-current={item.active ? "page" : undefined}
                    >
                      <NavIcon size={18} className="theme-header-nav-icon" />
                      <span>{item.label}</span>
                      {item.active && <div className="theme-header-nav-indicator ml-auto h-1.5 w-1.5 rounded-full" />}
                    </Link>
                  );
                })}
              </nav>
              
              <div className="theme-divider my-2 h-px" />
              
              {aboutItem && (
                <Link
                  href={aboutItem.href}
                  onClick={() => setIsMenuOpen(false)}
                  data-active={aboutItem.active}
                  className={`theme-header-nav-link flex min-h-11 items-center gap-3 rounded-xl border border-transparent px-3 py-2.5 text-sm font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fuchsia-400 ${
                    aboutItem.active
                      ? "ring-1 ring-[color:var(--theme-card-border)]"
                      : ""
                  }`}
                  aria-current={aboutItem.active ? "page" : undefined}
                >
                  <Info size={18} className="theme-header-nav-icon" />
                  <span>{aboutItem.mobileLabel ?? aboutItem.label}</span>
                </Link>
              )}
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
