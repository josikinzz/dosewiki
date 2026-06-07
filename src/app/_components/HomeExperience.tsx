"use client";

import Link from "next/link";
import { Icon, type IconName } from "@/components/common/Icon";
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
  return (
    <main
      id="main-content"
      tabIndex={-1}
      className="theme-page-shell theme-home-shell relative isolate grid min-h-[calc(100vh-var(--theme-header-height,4.25rem))] overflow-hidden px-4 text-center focus:outline-none supports-[height:100svh]:min-h-[calc(100svh-var(--theme-header-height,4.25rem))] supports-[height:100dvh]:min-h-[calc(100dvh-var(--theme-header-height,4.25rem))] sm:px-6 lg:px-8"
    >
      <div
        aria-hidden="true"
        className="theme-home-ambient absolute inset-0 -z-20"
      />
      <div className="theme-home-theme-toggle fixed bottom-4 right-4 z-30 sm:bottom-6 sm:right-6">
        <ThemeToggle />
      </div>

      <section className="theme-home-stage mx-auto flex w-full max-w-5xl flex-col items-center transition-[max-width,padding,transform] duration-300 ease-out">
        <div className="theme-home-brand-lockup flex flex-col items-center justify-center gap-3 transition-[gap,opacity,transform] duration-300 ease-out sm:gap-4">
          <img
            src={logoSource}
            alt="dose.wiki molecule logo"
            width={204}
            height={195}
            className="theme-home-logo theme-home-logo-main h-32 w-32 transition-[height,width,filter,transform] duration-300 ease-out sm:h-36 sm:w-36 md:h-44 md:w-44"
            draggable={false}
          />
          <h1 className="theme-home-wordmark theme-text-primary font-display text-[clamp(3.15rem,7vw,5.75rem)] font-semibold leading-none tracking-normal transition-[opacity,transform] duration-200">
            dose<span className="theme-accent-heading">.wiki</span>
          </h1>
        </div>

        <p className="theme-home-intro theme-text-secondary mt-4 max-w-2xl text-balance text-base leading-snug transition-[opacity,transform,max-height,margin] duration-300 sm:text-lg md:text-xl">
          A truly open encyclopedic database for the study of psychoactive substances and altered states of consciousness.
        </p>

        <nav
          aria-label="Primary site sections"
          className="theme-home-nav mt-9 grid grid-cols-2 gap-x-8 gap-y-6 transition-[bottom,gap,margin,opacity,transform] duration-300 sm:flex sm:flex-wrap sm:justify-center sm:gap-10"
        >
          {quickLinks.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              scroll={false}
              className="theme-home-nav-link group flex w-24 flex-col items-center gap-2.5 transition-[color,width,gap,transform] duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-4 sm:w-28"
            >
              <span className="theme-home-nav-icon relative flex h-20 w-20 items-center justify-center rounded-[1.45rem] border transition-[height,width,border-color,background-color,box-shadow,transform] duration-200 group-hover:-translate-y-1 sm:h-[5.75rem] sm:w-[5.75rem]">
                <Icon icon={item.icon} size={34} className="theme-home-nav-svg transition-[height,width,transform] duration-200 group-hover:scale-105" />
              </span>
              <span className="theme-home-nav-label font-display text-lg font-semibold leading-none tracking-normal transition-[opacity,max-width] duration-200">
                {item.label}
              </span>
            </Link>
          ))}
        </nav>
      </section>
    </main>
  );
}
