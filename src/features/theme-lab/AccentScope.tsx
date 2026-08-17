"use client";

import { useTheme } from "@/context/ThemeContext";
import { getAccent } from "@/theme/accents";

/**
 * Which accent's seeds are on the bench, named once under the day/night switch.
 *
 * The panel edits custom properties, and an accent is a *set* of them switched on
 * by `data-accent`. Nothing on the panel said which set: an editor tuning
 * `--ei-accent` in Pro was editing the seeds of some particular accent and had
 * only the DOM inspector to tell them which. This is the line that says it.
 *
 * Deliberately a label and not a control. The accent axis has one owner — the
 * reader's appearance control, through `ThemeProvider` — and a second switcher in
 * here would be a second cog, with the same drift between them that the cog
 * exists to prevent. It names the half being edited too, because the two halves
 * of an accent live in different styles: Fun resolves a colourway, Pro resolves
 * the `--ei-*` seeds, and only one of them is on screen at a time.
 *
 * Lives beside the panel rather than inside it because `PaletteLab.tsx` sits
 * against its LOC budget, the same reason `MyThemes` and `FlatnessControls` do.
 */

const ROW = "flex flex-wrap items-center gap-1.5 px-1.5 pb-1 text-[0.78125rem]";
const DOT = "h-2.5 w-2.5 shrink-0 rounded-full border border-black/25";

export function AccentScope() {
  const { accent, visualStyle } = useTheme();
  const { label, swatch, funPresetId, pro } = getAccent(accent);

  // The default accent is the absence of an override in both halves, so it is
  // the authored palette that gets named rather than an accent's own layer.
  const half =
    visualStyle === "pro"
      ? pro
        ? "editing its Pro seeds"
        : "editing Pro’s authored seeds"
      : funPresetId
        ? "editing its Fun colourway"
        : "editing the authored Fun palette";

  return (
    <div
      className={ROW}
      title="The accent is chosen with the site's own appearance control. The lab edits the tokens it resolves."
    >
      <span className={DOT} style={{ background: swatch }} aria-hidden="true" />
      <span className="theme-text-secondary font-semibold">{label} accent</span>
      <span className="theme-text-muted">· {half}</span>
    </div>
  );
}
