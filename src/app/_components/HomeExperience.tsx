"use client";

import { type CSSProperties, useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { Search } from "lucide-react";
import { DoseWikiLogo } from "@/components/common/DoseWikiLogo";
import { Icon } from "@/components/common/Icon";
import { SiteSupporter } from "@/components/common/SiteSupporter";
import { SiteWordmark } from "@/components/common/SiteWordmark";
import { Input } from "@/components/ui/input";
import { SITE_FLAVOR_CONFIG } from "@/config/siteFlavor";
import { partitionQuickLinkRows, type HomeQuickLink } from "./homeQuickLinks";
import { AppearanceControls } from "./AppearanceControls";

interface HomeExperienceProps {
  quickLinks: readonly HomeQuickLink[];
  isConstructionMode?: boolean;
  /**
   * Editable hero and banner copy, resolved on the server. Each falls back to
   * the flavor config value this page shipped with, so an un-seeded deployment
   * — and either flavor — renders exactly what it always did.
   */
  copy?: {
    tagline?: string;
    constructionTitle?: string;
    constructionSubtitle?: string;
  };
}

export function HomeExperience({
  quickLinks,
  isConstructionMode = false,
  copy,
}: HomeExperienceProps) {
  const searchInputId = useId();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [clickedItem, setClickedItem] = useState<string | null>(null);
  // Logo click delight: "charge & bloom" pop + hue sweep, escalating on rapid clicks.
  const [logoChargeTick, setLogoChargeTick] = useState(0);
  const [logoChargeLevel, setLogoChargeLevel] = useState(0);
  const logoChargeLevelRef = useRef(0);
  const logoChargeResetRef = useRef<number | null>(null);

  // The construction-mode mock header shows primary sections then the utility section.
  // It used to hardcode `slice(0, 3)` plus a lookup for the literal label "About", which
  // silently dropped entries on any flavor with more than four quick links. Split by the
  // flavor's own ordered id lists instead, preserving the order `quickLinks` arrives in.
  const primaryItems = quickLinks.filter((item) =>
    SITE_FLAVOR_CONFIG.primaryNavIds.includes(item.id),
  );
  const secondaryItems = quickLinks.filter((item) =>
    SITE_FLAVOR_CONFIG.secondaryNavIds.includes(item.id),
  );

  const chargeLogo = () => {
    const nextLevel = Math.min(logoChargeLevelRef.current + 1, 6);
    logoChargeLevelRef.current = nextLevel;
    setLogoChargeLevel(nextLevel);
    // Bump the tick so the alternating animation class restarts the keyframes.
    setLogoChargeTick((tick) => tick + 1);
    if (logoChargeResetRef.current !== null) {
      window.clearTimeout(logoChargeResetRef.current);
    }
    logoChargeResetRef.current = window.setTimeout(() => {
      logoChargeLevelRef.current = 0;
      setLogoChargeLevel(0);
    }, 1400);
  };

  useEffect(
    () => () => {
      if (logoChargeResetRef.current !== null) {
        window.clearTimeout(logoChargeResetRef.current);
      }
    },
    [],
  );

  const showComingSoon = (label: string) => {
    setClickedItem(label);
    window.setTimeout(() => {
      setClickedItem((current) => (current === label ? null : current));
    }, 900);
  };

  const renderSoonBadge = (className = "") => {
    if (!isConstructionMode) {
      return null;
    }

    return (
      <span
        aria-hidden="true"
        className={`theme-home-soon-badge pointer-events-none absolute rounded-full px-2 py-1 text-[0.65rem] font-semibold tracking-[0.16em] opacity-0 transition-[opacity,transform] duration-200 ${className}`}
      >
        SOON
        <sup className="ml-0.5 align-super text-[0.58em] font-bold leading-none tracking-normal normal-case">
          tm
        </sup>
      </span>
    );
  };

  return (
    <>
      {/* The blocked landing's header. The live site's header is `RouteChrome`'s own
          `Header`, which this deliberately mirrors at its dose.wiki-home shape — brand,
          full-width search, hamburger, no desktop nav bar — down to the classes, so the
          holding page shows the chrome a visitor will actually get. What differs is that
          nothing here navigates: each control answers with the SOON badge instead. */}
      {isConstructionMode && (
      <header className="app-header theme-chrome-dark theme-header-surface backdrop-blur-sm backdrop-safe">
        <div className="flex w-full items-center gap-3 px-4 py-3 min-[1600px]:px-6 gap-fallback-row-4">
          <button
            type="button"
            onClick={() => showComingSoon("Home")}
            className="group/brand flex h-11 w-11 items-center gap-2 p-0 text-left hover:bg-transparent xl:h-10 xl:w-auto xl:pl-0"
            aria-label={`${SITE_FLAVOR_CONFIG.name} home mockup`}
          >
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
          </button>

          <div className="flex min-h-[44px] min-w-0 flex-1 items-center">
            <form
              className="w-full min-w-0"
              onSubmit={(event) => {
                event.preventDefault();
                showComingSoon("Search");
              }}
              role="search"
            >
              {/* `GlobalSearch`' compact header variant, inert: same `Input`, same
                  `theme-global-search-input` pill, same trailing divider and round submit
                  button (`GlobalSearch.tsx` compact branch). The live field's own machinery
                  — debounce, manifest prefetch, live results — has nothing to search here. */}
              <div className="relative min-w-0" data-clicked={clickedItem === "Search"}>
                <label htmlFor={searchInputId} className="sr-only">
                  Search the library
                </label>
                <Input
                  id={searchInputId}
                  type="search"
                  placeholder="Search..."
                  aria-label="Search mockup"
                  readOnly
                  autoComplete="off"
                  spellCheck={false}
                  onFocus={() => showComingSoon("Search")}
                  onKeyDown={() => showComingSoon("Search")}
                  className="theme-global-search-input min-w-0 w-full rounded-full py-2 pl-4 pr-16 transition-[border-color,background-color,box-shadow,transform] duration-200 placeholder:italic placeholder:opacity-60"
                />
                <div className="absolute right-0 top-1/2 flex -translate-y-1/2 items-center gap-2">
                  <span aria-hidden="true" className="theme-home-search-divider h-7 w-px" />
                  <button
                    type="submit"
                    className="theme-home-search-button inline-flex h-11 w-11 items-center justify-center rounded-full border border-transparent transition-transform duration-[220ms] ease-[cubic-bezier(0.25,1,0.5,1)] hover:scale-[1.025] focus-visible:outline-none focus-visible:ring-2 active:scale-[0.98] motion-reduce:transition-none motion-reduce:hover:scale-100 motion-reduce:active:scale-100"
                    aria-label={`Search ${SITE_FLAVOR_CONFIG.name}`}
                  >
                    <Search size={18} />
                  </button>
                </div>
                {renderSoonBadge("-top-3 right-14")}
              </div>
            </form>
          </div>

          <div className="relative ml-auto flex-shrink-0">
            <button
              type="button"
              onClick={() => setIsMenuOpen((current) => !current)}
              data-open={isMenuOpen}
              className="theme-icon-button theme-mobile-menu-toggle h-11 w-11 rounded-2xl"
              aria-haspopup="true"
              aria-expanded={isMenuOpen}
              aria-controls="mock-mobile-nav"
            >
              <Icon icon={isMenuOpen ? "lucide:x" : "lucide:menu"} size={28} className="!h-7 !w-7" />
              <span className="sr-only">Toggle navigation</span>
            </button>

            {isMenuOpen && (
              <div
                id="mock-mobile-nav"
                className="theme-overlay-surface theme-mobile-nav-panel absolute right-0 top-[calc(100%+0.5rem)] w-64 origin-top-right rounded-2xl border p-2.5 shadow-[var(--theme-elevation-xl)] ring-1 ring-dose-divider backdrop-blur-sm"
              >
                <nav className="flex flex-col gap-1" aria-label="Mobile site sections">
                  {primaryItems.map((item) => (
                    <button
                      key={item.label}
                      type="button"
                      onClick={() => showComingSoon(item.label)}
                      data-clicked={clickedItem === item.label}
                      className="theme-header-nav-link theme-focus-ring theme-mobile-nav-link theme-home-mock-button relative flex min-h-11 items-center gap-3.5 rounded-xl border border-transparent px-3 py-2.5 text-sm font-semibold"
                    >
                      <Icon icon={item.icon} size={24} className="theme-header-nav-icon shrink-0" />
                      <span>{item.label}</span>
                      {renderSoonBadge("right-2 top-1")}
                    </button>
                  ))}
                </nav>

                {/* The live header rules off its utility section the same way. */}
                <div className="theme-gradient-divider my-2 h-px" />

                {secondaryItems.map((item) => (
                  <button
                    key={item.label}
                    type="button"
                    onClick={() => showComingSoon(item.label)}
                    data-clicked={clickedItem === item.label}
                    className="theme-header-nav-link theme-focus-ring theme-mobile-nav-link theme-home-mock-button relative flex min-h-11 items-center gap-3.5 rounded-xl border border-transparent px-3 py-2.5 text-sm font-semibold"
                  >
                    <Icon icon={item.icon} size={24} className="theme-header-nav-icon shrink-0" />
                    <span>{item.label}</span>
                    {renderSoonBadge("right-2 top-1")}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </header>
      )}

      <main
        id="main-content"
        tabIndex={-1}
        className="theme-page-shell theme-home-shell relative isolate grid min-h-[calc(100vh-var(--theme-header-height,4.25rem))] overflow-hidden px-4 text-center focus:outline-none supports-[height:100svh]:min-h-[calc(100svh-var(--theme-header-height,4.25rem))] supports-[height:100dvh]:min-h-[calc(100dvh-var(--theme-header-height,4.25rem))] sm:px-6 lg:px-8"
      >
        <div
          aria-hidden="true"
          className="theme-home-ambient absolute inset-0 -z-20"
        />
        {/* The positioning lives on the cog's own trigger: `theme-home-theme-toggle` is the
            hook the search-mode rules reposition, so any wrapper between this class and the
            button would take the offset and leave the control where it was.

            The blocked landing keeps the four appearance axes — a visitor may as well see
            the site in the appearance they prefer — but withholds the Theme Lab. The Lab
            authors and shares custom palettes through routes the construction hosts do not
            serve, so its drawer would open onto a surface that cannot answer. */}
        <AppearanceControls
          className="theme-home-theme-toggle fixed bottom-4 right-4 z-30 sm:bottom-6 sm:right-6"
          allowThemeLab={!isConstructionMode}
        />

        <section className="theme-home-stage mx-auto flex w-full max-w-5xl flex-col items-center transition-[max-width,padding,transform] duration-300 ease-out">
          <div className="theme-home-brand-lockup flex flex-col items-center justify-center gap-3 transition-[gap,opacity,transform] duration-300 ease-out sm:gap-4">
            <button
              type="button"
              aria-label={SITE_FLAVOR_CONFIG.logo.heroAnimateLabel}
              className="theme-home-logo-frame inline-flex cursor-pointer items-center justify-center border-0 bg-transparent p-0"
              onClick={chargeLogo}
              style={{ "--logo-charge": logoChargeLevel } as CSSProperties}
            >
              <DoseWikiLogo
                alt={SITE_FLAVOR_CONFIG.logo.heroAlt}
                width={204}
                height={195}
                className={[
                  "theme-home-logo theme-home-logo-main h-32 w-32 transition-[height,width,filter,transform] duration-300 ease-out sm:h-36 sm:w-36 md:h-44 md:w-44",
                  logoChargeTick === 0
                    ? ""
                    : logoChargeTick % 2 === 1
                      ? "theme-home-logo-charge-a"
                      : "theme-home-logo-charge-b",
                ]
                  .filter(Boolean)
                  .join(" ")}
              />
            </button>
            <h1 className="theme-home-wordmark theme-text-primary font-display text-[clamp(3.15rem,7vw,5.75rem)] font-semibold leading-none tracking-normal transition-[opacity,transform] duration-200">
              <SiteWordmark />
            </h1>
          </div>

          <p className="theme-home-intro theme-text-secondary mt-4 max-w-2xl text-balance text-base leading-snug transition-[opacity,transform,max-height,margin] duration-300 sm:text-lg md:text-xl">
            {copy?.tagline || SITE_FLAVOR_CONFIG.description}
          </p>

          {isConstructionMode && (
            <div className="theme-home-construction-banner mt-6 inline-flex items-center gap-3 rounded-3xl border px-5 py-3 font-display">
              <Icon icon="lucide:construction" size={24} className="theme-home-construction-icon" />
              <span className="flex flex-col items-center leading-none">
                <span className="text-sm font-semibold uppercase tracking-[0.22em] sm:text-base">
                  {copy?.constructionTitle || "Under construction"}
                </span>
                <span className="mt-1 text-sm font-semibold italic normal-case tracking-wide sm:text-base">
                  {copy?.constructionSubtitle || "coming soon, August 31st 2026 ;3"}
                </span>
              </span>
              <Icon icon="lucide:triangle-alert" size={24} className="theme-home-construction-icon theme-home-construction-icon-delay" />
            </div>
          )}

          {/* Balanced tile rows: below lg the flavor's quick links split into centred
              rows of at most three (5 → 3+2, 4 → 2+2). Each row is its own flex line
              with a tight content-based gap, so a short last row reads as a centred
              pair — the top row's spread never dictates its spacing. At lg — the first
              breakpoint whose content box (1024px − 2×32px padding = 960px) fits five
              7rem tiles plus four 2.5rem gaps (720px) — each row becomes
              `display: contents` and the tiles flatten into one centred row. Tiles
              keep their ≥80px touch targets at every width. */}
          <nav
            aria-label={isConstructionMode ? "Mock app sections" : "App sections"}
            className="theme-home-nav mt-9 flex flex-col items-center gap-6 transition-[bottom,gap,margin,opacity,transform] duration-300 lg:flex-row lg:justify-center lg:gap-10"
          >
            {partitionQuickLinkRows(quickLinks).map((row) => (
              <div
                key={row[0].href}
                className="theme-home-nav-row flex justify-center gap-5 sm:gap-8 lg:contents"
              >
                {row.map((item) =>
                  isConstructionMode ? (
                <button
                  key={item.href}
                  type="button"
                  onClick={() => showComingSoon(item.label)}
                  data-clicked={clickedItem === item.label}
                  className="theme-home-nav-link theme-home-mock-button group flex w-24 flex-col items-center gap-2.5 transition-[color,width,gap,transform] duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-4 sm:w-28"
                >
                  <span className="theme-home-nav-icon theme-public-card-hover-quiet relative flex h-20 w-20 items-center justify-center rounded-2xl border transition-[height,width,border-color,background-color,box-shadow,transform] duration-300 sm:h-[5.75rem] sm:w-[5.75rem]">
                    <Icon icon={item.icon} size={44} className="theme-home-nav-svg transition-[height,width,transform] duration-300" />
                    {renderSoonBadge("-right-2 -top-2 group-data-[clicked=true]:opacity-100")}
                  </span>
                  <span className="theme-home-nav-label font-display text-lg font-semibold leading-none tracking-normal transition-[opacity,max-width] duration-200">
                    {item.label}
                  </span>
                  </button>
                ) : (
                <Link
                  key={item.href}
                  href={item.href}
                  className="theme-home-nav-link group flex w-24 flex-col items-center gap-2.5 transition-[color,width,gap,transform] duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-4 sm:w-28"
                >
                  <span className="theme-home-nav-icon theme-public-card-hover-quiet relative flex h-20 w-20 items-center justify-center rounded-2xl border transition-[height,width,border-color,background-color,box-shadow,transform] duration-300 sm:h-[5.75rem] sm:w-[5.75rem]">
                    <Icon icon={item.icon} size={44} className="theme-home-nav-svg transition-[height,width,transform] duration-300" />
                  </span>
                  <span className="theme-home-nav-label font-display text-lg font-semibold leading-none tracking-normal transition-[opacity,max-width] duration-200">
                    {item.label}
                  </span>
                  </Link>
                ),
              )}
              </div>
            ))}
          </nav>
        </section>

        {/* The dose.wiki homepage suppresses the site footer (see RouteFooter), so the
            supporter credit that lives there has to be repeated somewhere. It anchors the
            bottom-left corner opposite the appearance controls, which keeps it
            clear of the hero's vertical rhythm at every viewport height. It sits outside
            <section> because the hero stage animates `transform`, and a transformed
            ancestor would become the containing block for a fixed child. Last in the DOM,
            so it is also last in reading order. */}
        <SiteSupporter
          markHeightRem={1.75}
          className="fixed bottom-4 left-4 z-20 sm:bottom-6 sm:left-6"
        />
      </main>
    </>
  );
}
