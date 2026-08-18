"use client";

import Link from "next/link";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";

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
 * The reader's appearance cog: one 44px trigger, one popover holding every appearance
 * choice the build offers.
 *
 * It replaces a loose row of pills. The pills were fine at two axes and unreadable at
 * three, and the accent row has no pill shape at all — so the axes moved inside a panel and
 * the surface keeps exactly one control. The colour scheme moved in with them on purpose: a
 * cog *plus* a loose day/night pill reinstates the clutter the cog exists to remove.
 *
 * Two rows, and no visible text in either. The panel used to carry a "Style" / "Colour
 * scheme" / "Accent" label beside each control, deliberately left unassociated so it could
 * not overwrite the control's own action-shaped name. A label that may neither name nor
 * associate is a caption for a glyph the reader has already parsed, and it cost a label
 * column plus one row per axis. Deleting all three folds four rows into two — both axis
 * pills and the Theme Lab link on one line, the swatch strip under it. Measured in the
 * browser: 250x118 at a fine pointer and 246x174 at a coarse one, against 250x266 and
 * 290x274 for the four-row panel — the two folded 44px rows, the 17px label with its 6px
 * gap, the 1px rule and the three 12px column gaps that went with them. The fine-pointer
 * width does not move because the widest thing in the panel is still the swatch strip.
 *
 * So every accessible name in here is load-bearing, with nothing visible to fall back on:
 * the two pills state an action ("Switch to night mode"), each swatch states its accent's
 * label, the swatch row states "Accent", and the Theme Lab link states "More settings" —
 * that last one because {@link Icon} hard-codes `aria-hidden` with no escape hatch, so an
 * icon-only link would otherwise have no name at all. `AppearanceControls.test.tsx` holds
 * the panel to it: no text inside, every control reachable by name.
 *
 * The Lab link sits third in the markup, between the pills and the swatches, because that is
 * where it sits on screen. The tempting alternative — DOM-last, so the one control that
 * leaves the panel is also last in tab order, while `ml-auto` keeps it visually top-right —
 * is rejected. A sighted keyboard user's expectation is set by what they can see, so that
 * ordering walks the focus ring from the colour-scheme pill *down* to the swatch strip and
 * then back *up* to the top-right corner: exactly the loss of meaning and operability WCAG
 * 2.4.3 is about. Visual order, DOM order and focus order agreeing is worth more than the
 * habit of putting an exit action last, the more so because this one is already unmistakable
 * by shape — a round icon button beside two segmented pills, above a row of colour dots —
 * and by role, being the panel's only link. `AppearanceControls.test.tsx` tabs the whole
 * panel and asserts that single order.
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

  // Row one is the two pills plus the Lab link. Named because an accent-only build would
  // otherwise render an empty flex row and still pay the column's `gap-3` for it.
  const hasControlRow = showVisualStyle || showColorScheme || showMoreSettings;

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

              {showMoreSettings ? (
                <Link
                  href="/dev/themes"
                  // The panel's only link, and the only control in it that navigates rather
                  // than mutates. It carries no text and {@link Icon} hard-codes
                  // `aria-hidden`, so these two attributes are the whole of its accessible
                  // name. Measured, by deleting each: `title` alone still names it, because
                  // it is the last-resort fallback in the name computation — so dropping
                  // `aria-label` fails exactly one assertion, the document-order label list
                  // in `AppearanceControls.test.tsx`, and every name query keeps passing on
                  // a `title` that screen readers may ignore and touch never shows. Dropping
                  // both fails six assertions in that file — and quietly hollows out two more
                  // that no test run reports, `Footer.test.tsx:200` and
                  // `HomeExperience.test.tsx:140`, which prove a reader is offered no editor
                  // route by finding no link named this: an unnamed link satisfies them
                  // without asserting anything. Keep the pair, as on the trigger and on every
                  // swatch.
                  aria-label="More settings"
                  title="More settings"
                  className="theme-control-pill-quiet ml-auto inline-flex h-11 w-11 items-center justify-center rounded-full"
                >
                  <Icon icon="lucide:settings-2" size={16} />
                </Link>
              ) : null}
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
          {showAccent ? (
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
          ) : null}
        </div>
      </PopoverContent>
    </Popover>
  );
}
