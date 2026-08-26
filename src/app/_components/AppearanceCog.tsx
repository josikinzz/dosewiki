"use client";

import { useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";

import { Icon } from "@/components/common/Icon";
import { Popover, PopoverArrow, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { setThemeLabOpen } from "@/features/theme-lab/themeLabStore";
import { cn } from "@/lib/utils";
import { AppearanceAxes, type AppearanceAxesRows } from "./AppearanceAxes";

/**
 * Which controls this instrument offers. AppearanceAxes owns reader preferences;
 * the cog adds the dev-only Theme Lab action that is not an appearance axis.
 */
export type AppearanceCogRows = AppearanceAxesRows & {
  /** Opens the protected Theme Lab drawer when publication policy permits it. */
  showMoreSettings: boolean;
};

/**
 * One 44px trigger for every reader-facing appearance choice.
 *
 * The popover owns its compact, permanently dark shell. `AppearanceAxes` supplies the
 * same named controls used by Theme Lab; the optional dev-only Theme Lab action follows
 * those reader preferences rather than competing with them.
 */
export function AppearanceCog({
  className,
  iconSize = 28,
  showVisualStyle,
  showColorScheme,
  showAccent,
  showSurface,
  showFont,
  showMoreSettings,
}: AppearanceCogRows & { className?: string; iconSize?: number }) {
  const appearanceTriggerRef = useRef<HTMLButtonElement>(null);
  const [popoverOpen, setPopoverOpen] = useState(false);

  // A cog that opens an empty panel is worse than no cog. Effect Index with its style locked
  // and its accent locked still has day/night, so this is reached only by a build that offers
  // a reader nothing at all.
  if (
    !showVisualStyle &&
    !showColorScheme &&
    !showSurface &&
    !showAccent &&
    !showFont &&
    !showMoreSettings
  ) {
    return null;
  }

  return (
    <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          ref={appearanceTriggerRef}
          // Names the panel, not the icon: "Appearance settings" tells a screen-reader user
          // what pressing this opens. Radix adds the expanded state and the panel's id.
          aria-label="Appearance settings"
          title="Appearance settings"
          data-appearance-cog=""
          // The transparent 44px box preserves the touch target without drawing a
          // button around the glyph. Open turns the gear a quarter-turn — a state
          // cue that does not depend on colour, which matters here because the panel
          // this opens exists to change colour.
          className={cn(
            "group theme-header-icon-button theme-focus-ring inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl transition-colors",
            className,
          )}
        >
          <Icon
            icon="carbon:settings"
            size={iconSize}
            className="transition-transform duration-300 ease-out group-hover:rotate-45 group-data-[state=open]:rotate-90 motion-reduce:transition-none"
          />
        </button>
      </PopoverTrigger>
      <PopoverContent
        // The same 22rem composition serves pointer and touch layouts. Desktop no longer
        // expands into a toolbar, while the viewport clamp keeps a 320px phone on-screen.
        // `theme-chrome-dark` pins the dark control palette even when the page is light.
        className="theme-chrome-dark theme-appearance-popover w-[min(22rem,calc(100vw-1.5rem))] max-w-none p-0 motion-reduce:animate-none"
        align="end"
        sideOffset={8}
        collisionPadding={12}
        aria-label="Appearance settings"
        /**
         * Escape belongs to this panel and stops here. Radix closes it from its own
         * capture-phase listener before this runs, so the dismissal is unaffected; stopping
         * propagation after it keeps the key from reaching anything else. Two kinds of
         * page-level handler would otherwise see it: a React `onKeyDown` above the cog,
         * because React routes portalled events up the *component* tree rather than the DOM
         * tree, and a `window` listener like the /dev shell's "Escape leaves the editor",
         * because React's own root listener sits inside `<body>`. `Header.tsx` stops its
         * Escape for the same reason.
         */
        onKeyDown={(event: ReactKeyboardEvent<HTMLDivElement>) => {
          if (event.key === "Escape") {
            event.stopPropagation();
          }
        }}
      >
        {/* The stem uses the same dark chrome fill as the panel. */}
        <PopoverArrow aria-hidden="true" width={16} height={8} className="theme-popover-arrow" />
        <div className="max-h-[calc(100vh-5.5rem)] overflow-y-auto overscroll-contain p-3">
          <AppearanceAxes
            showVisualStyle={showVisualStyle}
            showColorScheme={showColorScheme}
            showSurface={showSurface}
            showAccent={showAccent}
            showFont={showFont}
          />
          {showMoreSettings ? (
            <button
              type="button"
              aria-label="Open Theme Lab"
              title="Open Theme Lab"
              aria-haspopup="dialog"
              aria-controls="theme-lab-panel"
              onClick={() => {
                setPopoverOpen(false);
                setThemeLabOpen(true, appearanceTriggerRef.current);
              }}
              className="theme-control-pill-quiet mt-3 inline-flex h-10 items-center justify-center gap-2 rounded-full px-3 text-xs font-semibold [@media(pointer:coarse)]:h-11"
            >
              <Icon icon="ri:wrench-line" size={15} />
              <span>Theme Lab</span>
            </button>
          ) : null}
        </div>
      </PopoverContent>
    </Popover>
  );
}
