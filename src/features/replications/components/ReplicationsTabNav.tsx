"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

import { Icon, type IconName } from "@/components/common/Icon";
import { msg, useT } from "@/i18n/client";
import { cn } from "@/lib/utils";

interface SectionTab {
  href: string;
  label: string;
  icon: IconName;
}

/**
 * The section's tabs are real routes, so the gallery — the default view — owns
 * the bare /replications path rather than a fragment or query param.
 */
const SECTION_TABS: SectionTab[] = [
  // The section's route-chrome icon (header/nav) is hugeicons:camera-ai; the
  // Gallery *tab* wears its own glyph by instruction.
  { href: "/replications", label: msg("Gallery"), icon: "hugeicons:ai-image" },
  { href: "/replications/tutorials", label: msg("Tutorials"), icon: "lucide:list" },
  { href: "/replications/audio", label: msg("Audio"), icon: "lucide:audio-lines" },
  { href: "/replications/more-info", label: msg("More Info"), icon: "lucide:info" },
];

const SUBREDDIT_URL = "https://www.reddit.com/r/replications";

/**
 * Replication section tabs wear the site's canonical `theme-selected-control`
 * pills so they match public segmented tabs and article route tabs. The
 * trailing r/replications link is deliberately *not* a tab: it leaves the
 * site, so it reads as a plain link with an external glyph.
 *
 * The row scrolls horizontally on narrow viewports (it bleeds into the page
 * padding so the scroll area reaches the screen edge) and every target keeps a
 * 44px minimum height on coarse pointers.
 *
 * Each tab route renders this itself rather than inheriting it from the
 * section layout, so a tab can place its own standing copy *above* the bar
 * (the gallery's fair-use notice does). It therefore carries the section
 * measure and its default top offset, keeping the bar on the same left edge
 * and at the same height on every tab that has nothing above it.
 *
 * `trailing` is where a tab states something about itself once: the gallery
 * puts the archive's size there. It shares this row because the row is
 * already the page's quietest line and, unlike the control bar below it, it
 * does not stick to the top of every scroll position.
 */
export function ReplicationsTabNav({
  className,
  trailing,
}: {
  className?: string;
  trailing?: ReactNode;
}) {
  const pathname = usePathname();
  const t = useT();

  return (
    <div
      className={cn(
        "mx-auto mt-2 flex w-full max-w-7xl items-center gap-4",
        className,
      )}
    >
      <nav
        aria-label={t("Replications sections")}
        className="-mx-4 min-w-0 flex-1 overflow-x-auto px-4 [scrollbar-width:thin] md:mx-0 md:px-0"
      >
        <div className="theme-route-tabs-list theme-text-muted flex w-max min-w-full items-center justify-start gap-1.5 md:min-w-0">
          {SECTION_TABS.map((tab) => {
            // Every route that renders this nav is a tab's own exact path — the
            // focused gallery views (/replications/artist/<key>, /replications/
            // effect/<slug>) live outside the `(tabs)` group and carry no nav.
            const isActive = pathname === tab.href;

            return (
              <Link
                key={tab.href}
                href={tab.href}
                aria-current={isActive ? "page" : undefined}
                data-state={isActive ? "active" : "inactive"}
                className={cn(
                  "theme-selected-control group relative isolate flex min-h-8 shrink-0 items-center gap-1.5 overflow-hidden whitespace-nowrap rounded-full border border-transparent px-3 py-1.5 text-sm font-medium transition-[transform,background-color,color,box-shadow,border-color] duration-[260ms] ease-[cubic-bezier(0.25,1,0.5,1)] motion-reduce:transition-none [@media(pointer:coarse)]:min-h-11",
                  "active:scale-[0.99] motion-reduce:active:scale-100",
                )}
              >
                <span
                  className={cn(
                    "theme-selected-control-icon relative flex h-6 w-6 shrink-0 items-center justify-center rounded-full ring-1 transition-[background-color,color,box-shadow,transform] duration-300",
                    !isActive &&
                      "bg-transparent ring-transparent shadow-[var(--theme-elevation-none)]",
                  )}
                >
                  <Icon icon={tab.icon} size={17} />
                </span>
                {t(tab.label)}
              </Link>
            );
          })}

          <a
            href={SUBREDDIT_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="theme-focus-ring theme-text-faint ml-1.5 flex min-h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1.5 text-sm font-medium transition-colors hover:text-dose-text-secondary motion-reduce:transition-none [@media(pointer:coarse)]:min-h-11"
          >
            <Icon icon="ph:reddit-logo-bold" size={16} />
            r/replications
            <Icon
              icon="lucide:external-link"
              size={13}
              aria-hidden="true"
              className="opacity-70"
            />
          </a>
        </div>
      </nav>
      {/* From `lg` up only: at `md` the tabs plus the r/replications link
          already fill the row, and the sentence pushed the link under a
          scroll. It is a once-read statement, so it yields. */}
      {trailing ? (
        <p className="theme-text-faint hidden shrink-0 text-xs tabular-nums lg:block">
          {trailing}
        </p>
      ) : null}
    </div>
  );
}
