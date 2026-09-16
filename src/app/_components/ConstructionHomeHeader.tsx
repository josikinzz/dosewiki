"use client";

import { useId, useState } from "react";
import { Search } from "lucide-react";
import { DoseWikiLogo } from "@/components/common/DoseWikiLogo";
import { Icon } from "@/components/common/Icon";
import { SiteVersionBadge } from "@/components/common/SiteVersionBadge";
import { SiteWordmark } from "@/components/common/SiteWordmark";
import { Input } from "@/components/ui/input";
import { SITE_FLAVOR_CONFIG } from "@/config/siteFlavor";
import { AppearanceControls } from "./AppearanceControls";
import { useConstructionHomeInteractions } from "./ConstructionHomeInteractions";
import type { HomeQuickLink } from "./homeQuickLinks";

interface ConstructionHomeHeaderProps {
  quickLinks: readonly HomeQuickLink[];
}

function SoonBadge({ className = "" }: { className?: string }) {
  return (
    <span aria-hidden="true" className={`theme-home-soon-badge pointer-events-none absolute rounded-full px-2 py-1 text-[0.65rem] font-semibold tracking-[0.16em] opacity-0 transition-[opacity,transform] duration-200 ${className}`}>
      SOON
      <sup className="ml-0.5 align-super text-[0.58em] font-bold leading-none tracking-normal normal-case">tm</sup>
    </span>
  );
}

export function ConstructionHomeHeader({ quickLinks }: ConstructionHomeHeaderProps) {
  const searchInputId = useId();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const { clickedItem, showComingSoon } = useConstructionHomeInteractions();
  const primaryItems = quickLinks.filter((item) => SITE_FLAVOR_CONFIG.primaryNavIds.includes(item.id));
  const secondaryItems = quickLinks.filter((item) => SITE_FLAVOR_CONFIG.secondaryNavIds.includes(item.id));

 

  const menuItems = (items: readonly HomeQuickLink[]) => items.map((item) => (
    <button key={item.label} type="button" onClick={() => showComingSoon(item.label)} data-clicked={clickedItem === item.label} className="theme-header-nav-link theme-focus-ring theme-mobile-nav-link theme-home-mock-button relative flex min-h-11 items-center gap-3.5 rounded-xl border border-transparent px-3 py-2.5 text-sm font-semibold">
      <Icon icon={item.icon} size={24} className="theme-header-nav-icon shrink-0" />
      <span>{item.label}</span>
      <SoonBadge className="right-2 top-1" />
    </button>
  ));

  return (
    <header className="app-header theme-chrome-dark theme-header-surface backdrop-blur-sm backdrop-safe">
      <div className="flex w-full items-center gap-3 px-4 py-3 min-[1600px]:px-6 gap-fallback-row-4">
        <button type="button" onClick={() => showComingSoon("Home")} className="group/brand flex h-11 w-auto items-center gap-2 p-0 text-left hover:bg-transparent xl:h-10 xl:pl-0" aria-label={`${SITE_FLAVOR_CONFIG.name} home mockup`}>
          <span className="relative inline-flex items-center justify-center transition-transform duration-200 group-hover/brand:scale-105 group-focus-visible/brand:scale-105">
            <DoseWikiLogo width={40} height={40} className="safari-svg-gpu h-10 w-10" draggable={false} />
            <SiteVersionBadge variant="logoOverlay" />
          </span>
          <span className="hidden flex-col items-start justify-center gap-[3px] xl:flex">
            <span className="theme-text-primary inline-flex items-center text-2xl font-display font-bold leading-none tracking-tight transition-transform duration-200 group-hover/brand:scale-[1.04] group-focus-visible/brand:scale-[1.04]"><SiteWordmark /></span>
            <SiteVersionBadge variant="header" />
          </span>
        </button>

        <div className="flex min-h-[44px] min-w-0 flex-1 items-center">
          <form className="w-full min-w-0" onSubmit={(event) => { event.preventDefault(); showComingSoon("Search"); }} role="search">
            <div className="relative min-w-0" data-clicked={clickedItem === "Search"}>
              <label htmlFor={searchInputId} className="sr-only">Search the library</label>
              <Input id={searchInputId} type="search" placeholder="Search..." aria-label="Search mockup" readOnly autoComplete="off" spellCheck={false} onFocus={() => showComingSoon("Search")} onKeyDown={() => showComingSoon("Search")} className="theme-global-search-input min-w-0 w-full rounded-full py-2 pl-4 pr-16 transition-[border-color,background-color,box-shadow,transform] duration-200 placeholder:italic placeholder:opacity-60" />
              <div className="absolute right-0 top-1/2 flex -translate-y-1/2 items-center gap-2">
                <span aria-hidden="true" className="theme-home-search-divider h-7 w-px" />
                <button type="submit" className="theme-home-search-button inline-flex h-11 w-11 items-center justify-center rounded-full border border-transparent transition-transform duration-[220ms] ease-[cubic-bezier(0.25,1,0.5,1)] hover:scale-[1.025] theme-focus-ring active:scale-[0.98] motion-reduce:transition-none motion-reduce:hover:scale-100 motion-reduce:active:scale-100" aria-label={`Search ${SITE_FLAVOR_CONFIG.name}`}><Search size={18} /></button>
              </div>
              <SoonBadge className="-top-3 right-14" />
            </div>
          </form>
        </div>

        <div className="ml-auto flex flex-shrink-0 items-center gap-2">
          <AppearanceControls allowThemeLab={false} />
          <div className="relative">
            <button type="button" onClick={() => setIsMenuOpen((current) => !current)} data-open={isMenuOpen} className="theme-header-icon-button theme-focus-ring inline-flex h-11 w-11 items-center justify-center rounded-xl transition-colors" aria-haspopup="true" aria-expanded={isMenuOpen} aria-controls="mock-mobile-nav">
              <Icon icon={isMenuOpen ? "lucide:x" : "lucide:menu"} size={28} className="!h-7 !w-7" />
              <span className="sr-only">Toggle navigation</span>
            </button>
            {isMenuOpen && (
              <div id="mock-mobile-nav" className="theme-overlay-surface theme-mobile-nav-panel absolute right-0 top-[calc(100%+0.5rem)] w-64 origin-top-right rounded-2xl border p-2.5 shadow-[var(--theme-elevation-xl)] ring-1 ring-dose-divider backdrop-blur-sm">
                <nav className="flex flex-col gap-1" aria-label="Mobile site sections">{menuItems(primaryItems)}</nav>
                <div className="theme-gradient-divider my-2 h-px" />
                {menuItems(secondaryItems)}
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
