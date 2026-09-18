"use client";

import { Icon } from "@/components/common/Icon";
import { homeTileGlyphStyle } from "./homeTileGlyph";
import { useConstructionHomeInteractions } from "./ConstructionHomeInteractions";
import { partitionQuickLinkRows, type HomeQuickLink } from "./homeQuickLinks";

interface ConstructionHomeNavProps {
  quickLinks: readonly HomeQuickLink[];
}

export function ConstructionHomeNav({ quickLinks }: ConstructionHomeNavProps) {
  const { clickedItem, showComingSoon } = useConstructionHomeInteractions();

  return (
    <nav aria-label="Mock app sections" className="theme-home-nav mt-9 flex flex-col items-center gap-6 transition-[bottom,gap,margin,opacity,transform] duration-300 lg:flex-row lg:justify-center lg:gap-10">
      {partitionQuickLinkRows(quickLinks).map((row) => (
        <div key={row[0].href} className="theme-home-nav-row flex justify-center gap-5 sm:gap-8 lg:contents">
          {row.map((item) => (
            <button key={item.href} type="button" onClick={() => showComingSoon(item.label)} data-clicked={clickedItem === item.label} className="theme-home-nav-link theme-home-mock-button group flex w-24 flex-col items-center gap-2.5 transition-[color,width,gap,transform] duration-300 theme-focus-ring sm:w-28">
              <span className="theme-home-nav-icon theme-public-card-hover-quiet relative flex h-20 w-20 items-center justify-center rounded-2xl border transition-[height,width,border-color,background-color,box-shadow,transform] duration-300 sm:h-[5.75rem] sm:w-[5.75rem]" style={homeTileGlyphStyle(item.icon)}>
                <Icon icon={item.icon} size={44} className="theme-home-nav-svg transition-[height,width,transform] duration-300" />
                <span aria-hidden="true" className="theme-home-soon-badge pointer-events-none absolute -right-2 -top-2 rounded-full px-2 py-1 text-[0.65rem] font-semibold tracking-[0.16em] opacity-0 transition-[opacity,transform] duration-200 group-data-[clicked=true]:opacity-100">
                  SOON
                  <sup className="ml-0.5 align-super text-[0.58em] font-bold leading-none tracking-normal normal-case">tm</sup>
                </span>
              </span>
              <span className="theme-home-nav-label font-display text-lg font-semibold leading-none tracking-normal transition-[opacity,max-width] duration-200">{item.label}</span>
            </button>
          ))}
        </div>
      ))}
    </nav>
  );
}
