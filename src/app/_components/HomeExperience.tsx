"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { DoseWikiLogo } from "@/components/common/DoseWikiLogo";
import { GlobalSearch } from "@/components/common/GlobalSearch";
import { Icon, type IconName } from "@/components/common/Icon";
import type { AppView } from "@/types/navigation";
import { viewToPath } from "@/utils/routing";
import { PaletteLabTrigger } from "@/components/dev/PaletteLab";
import { ThemeToggle } from "./ThemeToggle";

interface HomeQuickLink {
  href: string;
  label: string;
  icon: IconName;
}

interface HomeExperienceProps {
  quickLinks: readonly HomeQuickLink[];
  isConstructionMode?: boolean;
}

export function HomeExperience({
  quickLinks,
  isConstructionMode = false,
}: HomeExperienceProps) {
  const router = useRouter();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [clickedItem, setClickedItem] = useState<string | null>(null);

  const primaryItems = quickLinks.slice(0, 3);
  const aboutItem = quickLinks.find((item) => item.label === "About") ?? quickLinks[3];

  const navItems = aboutItem ? [...primaryItems, aboutItem] : primaryItems;
  const homeView = { type: "home" } satisfies AppView;

  const navigateToView = (nextView: AppView) => {
    router.push(viewToPath(nextView));
  };

  const replaceWithView = (nextView: AppView) => {
    router.replace(viewToPath(nextView), { scroll: false });
  };

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
      {isConstructionMode && (
      <header className="app-header theme-header-surface backdrop-blur-sm backdrop-safe">
        <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-3 gap-fallback-row-4 lg:grid lg:grid-cols-[auto_minmax(0,1fr)_auto] lg:gap-4">
          {isConstructionMode ? (
            <button
              type="button"
              onClick={() => showComingSoon("Home")}
              className="group/brand flex h-11 w-11 items-center gap-2 p-0 text-left hover:bg-transparent xl:h-10 xl:w-auto xl:pl-0 xl:pr-4"
              aria-label="dose.wiki home mockup"
            >
              <span className="inline-flex items-center justify-center transition-transform duration-200 group-hover/brand:scale-105 group-focus-visible/brand:scale-105">
                <DoseWikiLogo
                  alt="dose.wiki logo"
                  width={40}
                  height={40}
                  className="safari-svg-gpu h-10 w-10"
                  draggable={false}
                />
              </span>
              <span className="theme-text-primary hidden items-center text-2xl font-display font-bold tracking-tight transition-transform duration-200 group-hover/brand:scale-[1.04] group-focus-visible/brand:scale-[1.04] xl:inline-flex">
                dose<span className="theme-accent-heading">.wiki</span>
              </span>
            </button>
          ) : (
            <Link
              href="/"
              className="group/brand flex h-11 w-11 items-center gap-2 p-0 text-left hover:bg-transparent xl:h-10 xl:w-auto xl:pl-0 xl:pr-4"
              aria-label="dose.wiki home"
            >
              <span className="inline-flex items-center justify-center transition-transform duration-200 group-hover/brand:scale-105 group-focus-visible/brand:scale-105">
                <DoseWikiLogo
                  alt="dose.wiki logo"
                  width={40}
                  height={40}
                  className="safari-svg-gpu h-10 w-10"
                  draggable={false}
                />
              </span>
              <span className="theme-text-primary hidden items-center text-2xl font-display font-bold tracking-tight transition-transform duration-200 group-hover/brand:scale-[1.04] group-focus-visible/brand:scale-[1.04] xl:inline-flex">
                dose<span className="theme-accent-heading">.wiki</span>
              </span>
            </Link>
          )}

          <div className="flex min-h-[44px] min-w-0 flex-1 items-center lg:w-full lg:max-w-2xl lg:justify-self-center">
            {isConstructionMode ? (
              <form
                className="w-full"
                onSubmit={(event) => {
                  event.preventDefault();
                  showComingSoon("Search");
                }}
                role="search"
              >
                <div
                  className="theme-home-mock-search relative flex h-11 w-full min-w-0 items-center rounded-full border px-4"
                  data-clicked={clickedItem === "Search"}
                >
                  <input
                    type="search"
                    aria-label="Search mockup"
                    placeholder="Search..."
                    readOnly
                    onFocus={() => showComingSoon("Search")}
                    onKeyDown={() => showComingSoon("Search")}
                    className="min-w-0 flex-1 bg-transparent text-base italic outline-none placeholder:text-current"
                  />
                  <div className="theme-divider mx-3 hidden h-7 w-px sm:block" />
                  <button
                    type="submit"
                    className="theme-accent-heading inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-transform duration-200 hover:scale-105 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fuchsia-400"
                    aria-label="Search mockup"
                  >
                    <Icon icon="lucide:search" size={22} />
                  </button>
                  {renderSoonBadge("-top-3 right-3")}
                </div>
              </form>
            ) : (
              <GlobalSearch
                currentView={homeView}
                onNavigate={navigateToView}
                onReplaceNavigate={replaceWithView}
                containerClassName="min-w-0 w-full"
                compact
                liveResultsMode
              />
            )}
          </div>

          <div className="hidden">
            <nav className="flex items-center gap-1" aria-label="Site sections">
              {primaryItems.map((item) => (
                isConstructionMode ? (
                  <button
                    key={item.label}
                    type="button"
                    onClick={() => showComingSoon(item.label)}
                    data-clicked={clickedItem === item.label}
                    className="theme-header-nav-link theme-home-mock-button relative flex min-h-11 items-center gap-2.5 rounded-full border border-transparent px-4 py-2 text-sm font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fuchsia-400"
                  >
                    <Icon icon={item.icon} size={22} className="theme-header-nav-icon shrink-0" />
                    <span>{item.label}</span>
                    {renderSoonBadge("-right-2 -top-2")}
                  </button>
                ) : (
                  <Link
                    key={item.label}
                    href={item.href}
                    className="theme-header-nav-link relative flex min-h-11 items-center gap-2.5 rounded-full border border-transparent px-4 py-2 text-sm font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fuchsia-400"
                  >
                    <Icon icon={item.icon} size={22} className="theme-header-nav-icon shrink-0" />
                    <span>{item.label}</span>
                  </Link>
                )
              ))}
            </nav>

            <div className="theme-divider mx-2 h-6 w-px" />

            {aboutItem && (
              isConstructionMode ? (
                <button
                  type="button"
                  onClick={() => showComingSoon(aboutItem.label)}
                  data-clicked={clickedItem === aboutItem.label}
                  className="theme-header-nav-link theme-home-mock-button relative flex min-h-11 items-center gap-2.5 rounded-full border border-transparent px-4 py-2 text-sm font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fuchsia-400"
                >
                  <Icon icon={aboutItem.icon} size={22} className="theme-header-nav-icon shrink-0" />
                  <span>{aboutItem.label}</span>
                  {renderSoonBadge("-right-2 -top-2")}
                </button>
              ) : (
                <Link
                  href={aboutItem.href}
                  className="theme-header-nav-link relative flex min-h-11 items-center gap-2.5 rounded-full border border-transparent px-4 py-2 text-sm font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fuchsia-400"
                >
                  <Icon icon={aboutItem.icon} size={22} className="theme-header-nav-icon shrink-0" />
                  <span>{aboutItem.label}</span>
                </Link>
              )
            )}
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
                className="theme-overlay-surface theme-mobile-nav-panel absolute right-0 top-[calc(100%+0.5rem)] w-64 origin-top-right rounded-2xl border p-2.5 shadow-xl ring-1 ring-dose-divider backdrop-blur-sm"
              >
                <nav className="flex flex-col gap-1" aria-label="Mobile site sections">
                  {navItems.map((item) => (
                    isConstructionMode ? (
                      <button
                        key={item.label}
                        type="button"
                        onClick={() => showComingSoon(item.label)}
                        data-clicked={clickedItem === item.label}
                        className="theme-header-nav-link theme-mobile-nav-link theme-home-mock-button relative flex min-h-11 items-center gap-3.5 rounded-xl border border-transparent px-3 py-2.5 text-sm font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fuchsia-400"
                      >
                        <Icon icon={item.icon} size={24} className="theme-header-nav-icon shrink-0" />
                        <span>{item.label}</span>
                        {renderSoonBadge("right-2 top-1")}
                      </button>
                    ) : (
                      <Link
                        key={item.label}
                        href={item.href}
                        onClick={() => setIsMenuOpen(false)}
                        className="theme-header-nav-link theme-mobile-nav-link relative flex min-h-11 items-center gap-3.5 rounded-xl border border-transparent px-3 py-2.5 text-sm font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fuchsia-400"
                      >
                        <Icon icon={item.icon} size={24} className="theme-header-nav-icon shrink-0" />
                        <span>{item.label}</span>
                      </Link>
                    )
                  ))}
                </nav>
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
        <div className="theme-home-theme-toggle fixed bottom-4 right-4 z-30 flex items-center gap-2 sm:bottom-6 sm:right-6">
          <PaletteLabTrigger />
          <ThemeToggle />
        </div>

        <section className="theme-home-stage mx-auto flex w-full max-w-5xl flex-col items-center transition-[max-width,padding,transform] duration-300 ease-out">
          <div className="theme-home-brand-lockup flex flex-col items-center justify-center gap-3 transition-[gap,opacity,transform] duration-300 ease-out sm:gap-4">
            <span className="theme-home-logo-frame inline-flex items-center justify-center">
              <DoseWikiLogo
                alt="dose.wiki molecule logo"
                width={204}
                height={195}
                className="theme-home-logo theme-home-logo-main h-32 w-32 transition-[height,width,filter,transform] duration-300 ease-out sm:h-36 sm:w-36 md:h-44 md:w-44"
              />
            </span>
            <h1 className="theme-home-wordmark theme-text-primary font-display text-[clamp(3.15rem,7vw,5.75rem)] font-semibold leading-none tracking-normal transition-[opacity,transform] duration-200">
              dose<span className="theme-accent-heading">.wiki</span>
            </h1>
          </div>

          <p className="theme-home-intro theme-text-secondary mt-4 max-w-2xl text-balance text-base leading-snug transition-[opacity,transform,max-height,margin] duration-300 sm:text-lg md:text-xl">
            A truly open encyclopedic database for the study of psychoactive substances and altered states of consciousness.
          </p>

          {isConstructionMode && (
            <div className="theme-home-construction-banner mt-6 inline-flex items-center gap-3 rounded-3xl border px-5 py-3 font-display">
              <Icon icon="lucide:construction" size={24} className="theme-home-construction-icon" />
              <span className="flex flex-col items-center leading-none">
                <span className="text-sm font-semibold uppercase tracking-[0.22em] sm:text-base">Under construction</span>
                <span className="mt-1 text-sm font-semibold italic normal-case tracking-wide sm:text-base">
                  coming soon, summer 2026 ;3
                </span>
              </span>
              <Icon icon="lucide:triangle-alert" size={24} className="theme-home-construction-icon theme-home-construction-icon-delay" />
            </div>
          )}

          <nav
            aria-label={isConstructionMode ? "Mock app sections" : "App sections"}
            className="theme-home-nav mt-9 grid grid-cols-2 gap-x-8 gap-y-6 transition-[bottom,gap,margin,opacity,transform] duration-300 sm:flex sm:flex-wrap sm:justify-center sm:gap-10"
          >
            {quickLinks.map((item) => (
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
              )
            ))}
          </nav>
        </section>
      </main>
    </>
  );
}
