"use client";

import Link from "next/link";
import type { KeyboardEvent as ReactKeyboardEvent, ReactNode } from "react";

import { Icon } from "@/components/common/Icon";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useTheme } from "@/context/ThemeContext";
import { cn } from "@/lib/utils";
import { ACCENTS } from "@/theme/accents";
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
  showAccent: boolean;
  /** The Theme Lab link. Editors only: a reader cannot use that route. */
  showMoreSettings: boolean;
};

/**
 * One labelled row: what the control governs on the left, the control itself on the right.
 *
 * The label is a plain span, deliberately not associated with the control. Each control
 * already carries an action-shaped accessible name ("Switch to Pro visual style"), so
 * associating this would replace that sentence with a bare noun.
 */
function CogRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-6">
      <span className="type-control-label text-dose-text-secondary">{label}</span>
      {children}
    </div>
  );
}

/**
 * The reader's appearance cog: one 44px trigger, one popover holding every appearance
 * choice the build offers.
 *
 * It replaces a loose row of pills. The pills were fine at two axes and unreadable at
 * three, and the accent row has no pill shape at all — so the axes moved inside a panel and
 * the surface keeps exactly one control. The colour scheme moved in with them on purpose: a
 * cog *plus* a loose day/night pill reinstates the clutter the cog exists to remove.
 *
 * Nothing here is styled per visual style. Every surface it wears is an existing themed
 * recipe — `theme-overlay-surface` for the panel, `theme-toggle-pill` for the trigger,
 * `theme-control-pill-quiet` for the swatches and the link — so Fun gets its frosted,
 * rounded, glowing treatment and Pro gets Effect Index's flat hairline one from the same
 * markup, in all four appearance combinations.
 *
 * Both axis controls are the shared {@link ThemeToggle} / {@link VisualStyleToggle} pills,
 * unchanged: they are already two-state segmented switches with a sliding thumb, already
 * bound to the provider, and already dressed for every combination. Rebuilding them as
 * panel-local segments would be a second convention for the same job.
 */
export function AppearanceCog({
  className,
  showVisualStyle,
  showColorScheme,
  showAccent,
  showMoreSettings,
}: AppearanceCogRows & { className?: string }) {
  const { accent, setAccent } = useTheme();

  // A cog that opens an empty panel is worse than no cog. Effect Index with its style locked
  // and its accent locked still has day/night, so this is reached only by a build that offers
  // a reader nothing at all.
  if (!showVisualStyle && !showColorScheme && !showAccent && !showMoreSettings) {
    return null;
  }

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
            icon="lucide:settings-2"
            size={18}
            className="transition-transform duration-300 ease-out group-data-[state=open]:rotate-45 motion-reduce:transition-none"
          />
        </button>
      </PopoverTrigger>
      <PopoverContent
        // Sized to its rows rather than the primitive's fixed w-72: the widest row is the
        // swatch strip, and the panel should not carry dead width when an axis is locked.
        className="w-auto p-3 motion-reduce:animate-none"
        align="end"
        sideOffset={10}
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
          {showVisualStyle ? (
            <CogRow label="Style">
              <VisualStyleToggle />
            </CogRow>
          ) : null}

          {showColorScheme ? (
            <CogRow label="Colour scheme">
              <ThemeToggle />
            </CogRow>
          ) : null}

          {showAccent ? (
            <div className="flex flex-col gap-1.5">
              <span className="type-control-label text-dose-text-secondary">Accent</span>
              {/* Whatever length the table has: the set grows and shrinks in
                  `src/theme/accents.ts`, and no count, label or colour is stated here.
                  The row is pulled out by half a cell's spare width so the swatches'
                  visible left and right edges land on the label column and the pills' right
                  edge, rather than the invisible cell bounds doing so. */}
              <div
                role="group"
                aria-label="Accent"
                className="-mx-1.5 flex items-center gap-1 [@media(pointer:coarse)]:-mx-2.5"
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
                          // the rendered token in `accents.test.ts`, not a colour choice
                          // this component is allowed to make.
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
            <>
              <span aria-hidden="true" className="-mx-3 h-px bg-dose-divider" />
              <Link
                href="/dev/themes"
                className="theme-control-pill-quiet inline-flex min-h-11 items-center justify-between gap-3 rounded-xl px-3"
              >
                <span className="inline-flex items-center gap-2">
                  <Icon icon="lucide:sliders-horizontal" size={16} />
                  <span className="type-control-label">More settings</span>
                </span>
                <Icon icon="lucide:arrow-up-right" size={14} />
              </Link>
            </>
          ) : null}
        </div>
      </PopoverContent>
    </Popover>
  );
}
