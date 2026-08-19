"use client";

import { useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";

import { Icon } from "@/components/common/Icon";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { setThemeLabOpen } from "@/features/theme-lab/themeLabStore";
import { cn } from "@/lib/utils";
import { AppearanceAxes, type AppearanceAxesRows } from "./AppearanceAxes";

/**
 * Which rows this instrument offers. The four axes are `AppearanceAxes`' own contract;
 * the cog adds the one row that is not an axis.
 */
export type AppearanceCogRows = AppearanceAxesRows & {
  /** The public Theme Lab drawer action. */
  showMoreSettings: boolean;
};

/**
 * One 44px trigger for every reader-facing appearance choice.
 *
 * The four axes themselves are `AppearanceAxes`, shared with the Theme Lab drawer so the
 * cog and the drawer offer the reader exactly the same controls. What is the cog's own is
 * the trigger, the popover it opens, and the Theme Lab action at its foot.
 *
 * Theme Lab opens the global drawer over the page instead of navigating away.
 */
export function AppearanceCog({
  className,
  showVisualStyle,
  showColorScheme,
  showAccent,
  showSurface,
  showMoreSettings,
}: AppearanceCogRows & { className?: string }) {
  const appearanceTriggerRef = useRef<HTMLButtonElement>(null);
  const [popoverOpen, setPopoverOpen] = useState(false);

  // A cog that opens an empty panel is worse than no cog. Effect Index with its style locked
  // and its accent locked still has day/night, so this is reached only by a build that offers
  // a reader nothing at all.
  if (!showVisualStyle && !showColorScheme && !showSurface && !showAccent && !showMoreSettings) {
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
          className={cn(
            "theme-toggle-pill group inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full",
            "transition-[border-color,background-color,color] duration-300 motion-reduce:transition-none",
            "data-[state=open]:text-dose-accent-strong",
            className,
          )}
        >
          <span
            aria-hidden="true"
            // The brand wheel, shared as a global utility so the same glyph can sit on this
            // pill and anywhere else without either copy owning the gradient. Open swells it
            // 10% rather than rotating it: the ring's outline is radially symmetric, so a
            // rotation would only sweep hues, and the swell is a cue that does not depend on
            // colour — which matters here because the panel this opens exists to change colour.
            className={cn(
              "theme-color-wheel h-4 w-4",
              "transition-transform duration-300 ease-out group-data-[state=open]:scale-110 motion-reduce:transition-none",
            )}
          />
        </button>
      </PopoverTrigger>
      <PopoverContent
        // Sized to its rows rather than the primitive's fixed w-72, so the panel carries no
        // dead width when an axis is locked. Which row is widest depends on the pointer: the
        // swatch strip at a fine one, the control row once the strip wraps at a coarse one.
        className="w-auto p-3 motion-reduce:animate-none"
        align="end"
        sideOffset={12}
        collisionPadding={12}
        aria-label="Appearance"
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
        <div className="flex flex-col gap-3">
          <AppearanceAxes
            showVisualStyle={showVisualStyle}
            showColorScheme={showColorScheme}
            showSurface={showSurface}
            showAccent={showAccent}
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
              className={cn(
                "theme-control-pill-quiet inline-flex h-10 w-full items-center justify-center gap-2 rounded-full px-3",
                "text-xs font-semibold tracking-[0.01em]",
              )}
            >
              <Icon icon="ri:wrench-line" size={15} />
              <span>Theme Lab</span>
              <Icon icon="lucide:panel-right-open" size={14} />
            </button>
          ) : null}
        </div>
      </PopoverContent>
    </Popover>
  );
}
