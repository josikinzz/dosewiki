"use client";

import Link from "next/link";
import { useId, type KeyboardEvent as ReactKeyboardEvent } from "react";

import { Icon } from "@/components/common/Icon";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useTheme } from "@/context/ThemeContext";
import { cn } from "@/lib/utils";
import { ACCENTS } from "@/theme/accents";
import { SURFACES } from "@/theme/surfaces";
import { ThemeToggle } from "./ThemeToggle";
import { VisualStyleToggle } from "./VisualStyleToggle";

/**
 * Which rows this instrument offers. Passed in rather than read here: the visibility
 * questions are publication and role policy, resolved once in `AppearanceControls`, and
 * keeping them as props is what lets a story or a test show a locked publication's cog
 * without standing up a flavor config or a session.
 */
export type AppearanceCogRows = {
  /** Fun/Pro. Absent — never inert — where the publication's identity *is* one style. */
  showVisualStyle: boolean;
  /** Day/Night. */
  showColorScheme: boolean;
  /** The swatch row. */
  /** Canvas and component material family. */
  showSurface: boolean;
  showAccent: boolean;
  /** The protected full Palette Lab action. */
  showMoreSettings: boolean;
};

/**
 * One 44px trigger for every reader-facing appearance choice.
 *
 * Surface swatches follow the active color scheme so they preview the material
 * the page will actually use. Pro keeps its restrained fixed materials, so the
 * Surface row remains visible for context but is disabled and explicitly marked
 * "Fun only". The selected Surface is preserved when switching styles.
 *
 * The shared toggle and pill recipes provide the Fun and Pro treatments. The
 * Palette Lab is a separate, visible navigation action at the end of the panel.
 */
export function AppearanceCog({
  className,
  showVisualStyle,
  showColorScheme,
  showAccent,
  showSurface,
  showMoreSettings,
}: AppearanceCogRows & { className?: string }) {
  const { colorScheme, visualStyle, surface, setSurface, accent, setAccent } = useTheme();
  const surfaceAvailabilityId = useId();
  const surfacesDisabled = visualStyle === "pro";

  // A cog that opens an empty panel is worse than no cog. Effect Index with its style locked
  // and its accent locked still has day/night, so this is reached only by a build that offers
  // a reader nothing at all.
  if (!showVisualStyle && !showColorScheme && !showSurface && !showAccent && !showMoreSettings) {
    return null;
  }

  // The first row only holds the two compact binary controls. Palette Lab is a
  // separate, explicit action at the bottom of the panel.
  const hasControlRow = showVisualStyle || showColorScheme;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
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
          <Icon
            icon="reicon:color-swatch"
            size={16}
            // Open used to rotate this 45°, which read as a cog turning. A palette of
            // colour chips has no axis to turn about, so open is now a 10% swell: the
            // same duration and easing, no rotation, and a cue that does not depend on
            // colour — which matters here because the colour cue below is
            // `--theme-accent-strong`, the very token the open panel exists to change.
            className="transition-transform duration-300 ease-out group-data-[state=open]:scale-110 motion-reduce:transition-none"
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
          {hasControlRow ? (
            <div className="flex items-center gap-2">
              {showVisualStyle ? <VisualStyleToggle /> : null}
              {showColorScheme ? <ThemeToggle /> : null}

            </div>
          ) : null}

          {/* Whatever length the table has: the set grows and shrinks in
              `src/theme/accents.ts`, and no count, label or colour is stated here. The row
              is pulled out by half a cell's spare width so the swatches' visible left and
              right edges land on the panel's padding column rather than the invisible cell
              bounds doing so — and since every wrapped line starts at that same content-box
              edge, the trick holds per line, not just for the first one.

              The coarse-pointer max width is a wrap budget, not a size: four 44px cells and
              their three 4px gaps, so a seventh accent breaks 4+3. Letting the line run full
              width instead gives 6+1 — six coarse cells make a 290px panel, which a 320px
              viewport grants by 6px, and a seventh overflows it by 42px. Four per line is
              the balanced break, and it holds the panel to the width row one already asks
              for. */}
          {showSurface ? (
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between gap-3 px-1">
                <span className="text-[0.6875rem] font-semibold uppercase tracking-[0.12em] text-dose-text-muted">
                  Surfaces
                </span>
                {surfacesDisabled ? (
                  <span
                    id={surfaceAvailabilityId}
                    className="text-[0.625rem] font-medium uppercase tracking-[0.1em] text-dose-text-muted"
                  >
                    Fun only
                  </span>
                ) : null}
              </div>
              <div
                role="group"
                aria-label="Surfaces"
                aria-describedby={surfacesDisabled ? surfaceAvailabilityId : undefined}
                className="-mx-1.5 flex flex-wrap items-center gap-1 [@media(pointer:coarse)]:-mx-2.5 [@media(pointer:coarse)]:max-w-[11.75rem]"
              >
                {SURFACES.map((option) => {
                  const isActive = option.id === surface;
                  const swatch = option.tint[colorScheme];
                  return (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() => setSurface(option.id)}
                      disabled={surfacesDisabled}
                      aria-pressed={isActive}
                      aria-label={option.label}
                      title={
                        surfacesDisabled
                          ? `${option.label} · switch to Fun to change surfaces`
                          : option.label
                      }
                      data-surface-swatch={option.id}
                      data-active={isActive}
                      className={cn(
                        "theme-control-pill-quiet inline-flex h-9 w-9 items-center justify-center rounded-full",
                        "[@media(pointer:coarse)]:h-11 [@media(pointer:coarse)]:w-11",
                        "disabled:cursor-not-allowed disabled:opacity-50 disabled:saturate-0",
                      )}
                    >
                      <span
                        aria-hidden="true"
                        className="h-5 w-5 rounded-full border border-current/25"
                        style={{ backgroundColor: swatch }}
                      />
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}

          {showAccent ? (
            <div className="flex flex-col gap-1.5">
              <span className="px-1 text-[0.6875rem] font-semibold uppercase tracking-[0.12em] text-dose-text-muted">
                Accent
              </span>
              <div
                role="group"
                aria-label="Accent"
                className="-mx-1.5 flex flex-wrap items-center gap-1 [@media(pointer:coarse)]:-mx-2.5 [@media(pointer:coarse)]:max-w-[11.75rem]"
              >
              {ACCENTS.map((option) => {
                const isActive = option.id === accent;

                return (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => setAccent(option.id)}
                    aria-pressed={isActive}
                    aria-label={option.label}
                    title={option.label}
                    data-accent-swatch={option.id}
                    // Drives the shared pill recipe's pressed treatment, so the chosen
                    // swatch also changes its cell's surface and border. Together with the
                    // halo below, "chosen" survives without colour vision.
                    data-active={isActive}
                    className="theme-control-pill-quiet inline-flex h-9 w-9 items-center justify-center rounded-full [@media(pointer:coarse)]:h-11 [@media(pointer:coarse)]:w-11"
                  >
                    <span
                      aria-hidden="true"
                      className={cn(
                        "inline-flex h-6 w-6 items-center justify-center rounded-full border-2 transition-colors duration-200 motion-reduce:transition-none",
                        isActive ? "border-dose-accent-strong" : "border-transparent",
                      )}
                    >
                      <span
                        aria-hidden="true"
                        className="h-4 w-4 rounded-full"
                        // The accent's own declared swatch. It is data, measured against
                        // the rendered token in `accents.test.ts`, not a colour choice this
                        // component is allowed to make.
                        style={{ backgroundColor: option.swatch }}
                      />
                    </span>
                  </button>
                );
              })}
              </div>
            </div>
          ) : null}

          {showMoreSettings ? (
            <Link
              href="/dev/themes"
              aria-label="Open full Palette Lab"
              title="Open full Palette Lab"
              className={cn(
                "theme-control-pill-quiet inline-flex h-10 w-full items-center justify-center gap-2 rounded-full px-3",
                "text-xs font-semibold tracking-[0.01em]",
              )}
            >
              <Icon icon="lucide:palette" size={15} />
              <span>Full Palette Lab</span>
              <Icon icon="lucide:arrow-right" size={14} />
            </Link>
          ) : null}
        </div>
      </PopoverContent>
    </Popover>
  );
}
