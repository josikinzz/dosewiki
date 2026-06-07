"use client";

import { useState } from "react";
import Link from "next/link";
import { Icon, type IconName } from "@/components/common/Icon";
import { HomeSearch } from "./HomeSearch";
import { ThemeToggle } from "./ThemeToggle";

interface HomeQuickLink {
  href: string;
  label: string;
  icon: IconName;
}

interface HomeExperienceProps {
  logoSource: string;
  quickLinks: readonly HomeQuickLink[];
}

export function HomeExperience({
  logoSource,
  quickLinks,
}: HomeExperienceProps) {
  const [isSearchMode, setIsSearchMode] = useState(false);

  return (
    <main
      id="main-content"
      tabIndex={-1}
      data-search-mode={isSearchMode}
      className="theme-page-shell theme-home-shell relative isolate flex min-h-screen overflow-hidden px-4 text-center focus:outline-none supports-[height:100svh]:min-h-[100svh] supports-[height:100dvh]:min-h-[100dvh] sm:px-6 lg:px-8"
    >
      <div
        aria-hidden="true"
        className="theme-home-ambient absolute inset-0 -z-20"
      />
      <div
        aria-hidden="true"
        className="theme-home-starfield absolute inset-0 -z-10 opacity-[0.18]"
      />
      <div className="theme-home-theme-toggle fixed bottom-4 right-4 z-30 sm:bottom-6 sm:right-6">
        <ThemeToggle />
      </div>

      <section className="theme-home-stage mx-auto flex w-full max-w-5xl flex-col items-center transition-[max-width,padding,transform] duration-300 ease-out">
        <div className="theme-home-brand-lockup flex flex-col items-center justify-center gap-5 transition-[gap,opacity,transform] duration-300 ease-out sm:flex-row sm:gap-7">
          <img
            src={logoSource}
            alt="dose.wiki molecule logo"
            width={204}
            height={195}
            className="theme-home-logo theme-home-logo-main h-36 w-36 transition-[height,width,filter,transform] duration-300 ease-out sm:h-44 sm:w-44 md:h-52 md:w-52"
            draggable={false}
          />
          <h1 className="theme-home-wordmark theme-text-primary font-display text-[clamp(3.4rem,8vw,6.75rem)] font-semibold leading-none tracking-normal transition-[opacity,transform] duration-200">
            dose<span className="theme-accent-heading">.wiki</span>
          </h1>
        </div>

        <p className="theme-home-intro theme-text-secondary mt-5 max-w-2xl text-balance text-base leading-snug transition-[opacity,transform,max-height,margin] duration-300 sm:text-lg md:text-xl">
          A truly open encyclopedic database for the study of psychoactive substances and altered states of consciousness.
        </p>

        <div className="theme-home-search-row mt-10 flex w-full max-w-4xl items-center gap-3 transition-[max-width,margin,transform] duration-300 ease-out">
          <img
            src={logoSource}
            alt=""
            width={56}
            height={56}
            aria-hidden="true"
            className="theme-home-logo theme-home-logo-inline hidden h-14 w-14 shrink-0 transition-[height,width,opacity,transform] duration-300"
            draggable={false}
          />
          <div className="min-w-0 flex-1">
            <HomeSearch
              compactSearchMode={isSearchMode}
              onSearchModeChange={setIsSearchMode}
            />
          </div>
        </div>

        <nav
          aria-label="Primary site sections"
          className="theme-home-nav mt-12 grid grid-cols-2 gap-x-8 gap-y-7 transition-[bottom,gap,margin,opacity,transform] duration-300 sm:flex sm:flex-wrap sm:justify-center sm:gap-12"
        >
          {quickLinks.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="theme-home-nav-link group flex w-28 flex-col items-center gap-3 transition-[color,width,gap,transform] duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-4 sm:w-32"
              title={isSearchMode ? item.label : undefined}
            >
              <span className="theme-home-nav-icon relative flex h-20 w-20 items-center justify-center rounded-full border transition-[height,width,border-color,background-color,box-shadow,transform] duration-200 group-hover:-translate-y-1 sm:h-24 sm:w-24">
                <Icon icon={item.icon} size={38} className="theme-home-nav-svg transition-[height,width,transform] duration-200 group-hover:scale-105" />
              </span>
              <span className="theme-home-nav-label font-display text-xl font-semibold leading-none tracking-normal transition-[opacity,max-width] duration-200">
                {item.label}
              </span>
            </Link>
          ))}
        </nav>
      </section>
    </main>
  );
}
