import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { DoseWikiLogo } from "../common/DoseWikiLogo";
import { Icon } from "../common/Icon";
import { SiteWordmark } from "../common/SiteWordmark";
import type { AppView, RouteChromeModel } from "../../types/navigation";
import { Button } from "@/components/ui/button";
import { resolveRouteChromeIcon } from "@/utils/routeChromeIcons";

const GlobalSearch = dynamic(
  () => import("../common/GlobalSearch").then((mod) => mod.GlobalSearch),
  {
    ssr: false,
    loading: () => (
      <div
        aria-hidden="true"
        className="theme-public-skeleton-surface h-11 w-full rounded-full border"
      />
    ),
  },
);

interface HeaderProps {
  model: RouteChromeModel;
  onNavigate: (view: AppView) => void;
  onReplaceNavigate?: (view: AppView) => void;
  onLiveNavigate?: (view: AppView) => void;
  liveSearchClearView?: AppView | null;
  forceMobileNav?: boolean;
}

export function Header({
  model,
  onNavigate,
  onReplaceNavigate,
  onLiveNavigate,
  liveSearchClearView = null,
  forceMobileNav = false,
}: HeaderProps) {
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
      <div
        data-nosnippet
        className={
          forceMobileNav
            ? "mx-auto flex max-w-7xl items-center gap-3 px-4 py-3 gap-fallback-row-4"
            : "mx-auto flex max-w-7xl items-center gap-3 px-4 py-3 gap-fallback-row-4 lg:grid lg:grid-cols-[auto_minmax(0,1fr)_auto] lg:gap-4"
        }
      >
        <Button
          asChild
          variant="ghost"
          className="group/brand flex h-11 w-11 items-center gap-2 p-0 text-left hover:bg-transparent xl:h-10 xl:w-auto xl:pl-0 xl:pr-4"
        >
          <Link href={model.headerLogo.href} scroll={false}>
          <span className="inline-flex items-center justify-center transition-transform duration-200 group-hover/brand:scale-105 group-focus-visible/brand:scale-105">
            <DoseWikiLogo
              width={40}
              height={40}
              className="safari-svg-gpu h-10 w-10"
              draggable={false}
            />
          </span>
          <span className="theme-text-primary hidden items-center text-2xl font-display font-bold tracking-tight transition-transform duration-200 group-hover/brand:scale-[1.04] group-focus-visible/brand:scale-[1.04] xl:inline-flex">
            <SiteWordmark />
          </span>
          </Link>
        </Button>

        <div
          className={
            forceMobileNav
              ? "flex min-h-[44px] min-w-0 flex-1 items-center"
              : "flex min-h-[44px] min-w-0 flex-1 items-center lg:w-full lg:max-w-2xl lg:justify-self-center"
          }
        >
          <GlobalSearch
            currentView={model.currentView}
            onNavigate={onNavigate}
            onReplaceNavigate={onReplaceNavigate}
            onLiveNavigate={onLiveNavigate}
            containerClassName="min-w-0 w-full"
            compact
            liveResultsMode
            liveSearchClearView={liveSearchClearView}
          />
        </div>

        <div className={forceMobileNav ? "hidden" : "ml-auto hidden flex-shrink-0 items-center gap-2 lg:ml-0 lg:flex"}>
          <nav className="flex items-center gap-1">
            {model.primaryNavItems.map((item) => {
              const navIcon = resolveRouteChromeIcon(item.icon);

              return (
                <Link
                  key={item.id}
                  href={item.href}
                  scroll={false}
                  data-active={item.active}
                  className={`theme-header-nav-link relative flex min-h-11 items-center gap-2.5 rounded-full border border-transparent px-4 py-2 text-sm font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fuchsia-400 ${
                    item.active
                      ? "ring-1 ring-dose-card-border"
                      : ""
                  }`}
                  aria-current={item.active ? "page" : undefined}
                >
                  <Icon icon={navIcon} size={22} className="theme-header-nav-icon shrink-0" />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </nav>
          
          <div className="theme-divider mx-2 h-6 w-px" />

          {aboutItem && (
            <Link
              href={aboutItem.href}
              scroll={false}
              data-active={aboutItem.active}
              className={`theme-header-nav-link flex min-h-11 items-center gap-2.5 rounded-full border border-transparent px-4 py-2 text-sm font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fuchsia-400 ${
                aboutItem.active
                  ? "ring-1 ring-dose-card-border"
                  : ""
              }`}
              aria-current={aboutItem.active ? "page" : undefined}
            >
              <Icon icon={resolveRouteChromeIcon(aboutItem.icon)} size={22} className="theme-header-nav-icon shrink-0" />
              <span>{aboutItem.label}</span>
            </Link>
          )}
        </div>

        <div className={forceMobileNav ? "relative ml-auto flex-shrink-0" : "relative ml-auto flex-shrink-0 lg:hidden"}>
          <Button
            ref={menuButtonRef}
            variant="ghost"
            size="icon"
            onClick={() => setIsMenuOpen((prev) => !prev)}
            data-open={isMenuOpen}
            className="theme-icon-button theme-mobile-menu-toggle h-11 w-11 rounded-2xl"
            aria-haspopup="true"
            aria-expanded={isMenuOpen}
            aria-controls="mobile-nav"
          >
            <Icon
              icon={isMenuOpen ? "lucide:x" : "lucide:menu"}
              size={28}
              className="!h-7 !w-7"
            />
            <span className="sr-only">Toggle navigation</span>
          </Button>

          {isMenuOpen && (
            <div
              ref={menuPanelRef}
              id="mobile-nav"
              className="theme-overlay-surface theme-mobile-nav-panel absolute right-0 top-[calc(100%+0.5rem)] w-64 origin-top-right rounded-2xl border p-2.5 shadow-xl ring-1 ring-dose-divider backdrop-blur-sm"
            >
              <nav className="flex flex-col gap-1">
                {model.primaryNavItems.map((item) => {
                  const navIcon = resolveRouteChromeIcon(item.icon);
                  return (
                    <Link
                      key={item.id}
                      href={item.href}
                      scroll={false}
                      onClick={() => setIsMenuOpen(false)}
                      data-active={item.active}
                      className={`theme-header-nav-link theme-mobile-nav-link flex min-h-11 items-center gap-3.5 rounded-xl border border-transparent px-3 py-2.5 text-sm font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fuchsia-400 ${
                        item.active 
                          ? "ring-1 ring-dose-card-border"
                          : ""
                      }`}
                      aria-current={item.active ? "page" : undefined}
                    >
                      <Icon icon={navIcon} size={24} className="theme-header-nav-icon shrink-0" />
                      <span>{item.label}</span>
                      {item.active && <div className="theme-header-nav-indicator ml-auto h-1.5 w-1.5 rounded-full" />}
                    </Link>
                  );
                })}
              </nav>
              
              <div className="theme-gradient-divider my-2 h-px" />
              
              {aboutItem && (
                <Link
                  href={aboutItem.href}
                  scroll={false}
                  onClick={() => setIsMenuOpen(false)}
                  data-active={aboutItem.active}
                  className={`theme-header-nav-link theme-mobile-nav-link flex min-h-11 items-center gap-3.5 rounded-xl border border-transparent px-3 py-2.5 text-sm font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fuchsia-400 ${
                    aboutItem.active
                      ? "ring-1 ring-dose-card-border"
                      : ""
                  }`}
                  aria-current={aboutItem.active ? "page" : undefined}
                >
                  <Icon icon={resolveRouteChromeIcon(aboutItem.icon)} size={24} className="theme-header-nav-icon shrink-0" />
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
