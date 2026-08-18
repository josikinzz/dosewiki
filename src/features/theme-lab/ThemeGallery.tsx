"use client";

import { useTheme } from "@/context/ThemeContext";
import { getAccent } from "@/theme/accents";
import { PanelBadge } from "./panelKit";
import { MyThemes } from "./MyThemes";
import { ThemeCard } from "./ThemeCard";
import { PALETTE_PRESETS, getPreset } from "./palettePresets";
import { presetRef, type ThemeRef } from "./paletteLabStorage";
import { isActiveThemeKnown, type ThemeLabState } from "./paletteLabTheme";
import styles from "./PaletteLab.module.css";

/**
 * The Theme Lab's gallery: complete looks — the shipped palettes first, then
 * the visitor's own saved themes — one tap to wear.
 *
 * This is the panel's landing view. It used to be a section buried mid-scroll
 * inside every catalog view, under a color editor that was always expanded;
 * promoting it to its own view is what makes the tool usable without learning
 * an editor first.
 *
 * It lives beside the panel rather than inside it because `PaletteLab.tsx` sits
 * against its LOC budget.
 *
 * Two of the three appearance axes can turn a selection here into a lie, and the
 * gallery states both rather than badging a winner that lost. A non-default
 * accent's Fun block is an entire colourway, not a hue: `blue` emits
 * `--h-brand: 215`, `--theme-body-bg: #020a12`, `--theme-accent: #a5f3fc` and
 * ~40 more at `accent-tokens.generated.css:19-67`. It ties the `data-palette`
 * block at (0,2,1) — measured against `palette-presets.generated.css:463` — and
 * lands later in the bundle (`src/app/_styles/dosewiki.ts:23-26`), so it paints
 * and the saved colourway does not. Under Pro the masking runs the other way:
 * `pro-theme.css:72-74` is the same (0,2,1) and also later, so it restates 16 of
 * the 19 `--theme-*` tokens a colourway sets (counted against Garnet's dark
 * block) and leaves all 20 of its `--h-*`/`--c-*` seeds alone. Those seeds are
 * the only thing a pick here still moves, and Pro reads almost none of them.
 *
 * Reported, never switched. The argument at `AccentScope.tsx:14-19` holds here
 * too — the accent axis has one owner, the reader's appearance control, and a
 * switcher in this panel would be a second cog with the same drift between them
 * that the cog exists to prevent. The colourway each accent wears is read from
 * the accent table's own `funPresetId` (`src/theme/accents.ts:36`), so this view
 * cannot fall out of step with what the stylesheet was generated from.
 *
 * A custom theme needs neither notice: its captured look is injected at (0,4,1),
 * a step above both the accent sheet and the Pro palette.
 */

interface ThemeGalleryProps {
  themeState: ThemeLabState;
  /** How many tokens the visitor has changed on the theme being worn. */
  changedCount: number;
  onSelect: (ref: ThemeRef) => void;
  /** Bump the panel's editor after a saved theme was added or removed. */
  onChanged: () => void;
}

export function ThemeGallery({ themeState, changedCount, onSelect, onChanged }: ThemeGalleryProps) {
  const { activeThemeRef } = themeState;
  const { accent, visualStyle } = useTheme();
  const { label: accentLabel, funPresetId } = getAccent(accent);

  // Only a shipped colourway can be overpainted, so the whole question is
  // scoped to a preset reference this build still has.
  const shippedSelection =
    activeThemeRef.kind === "preset" && isActiveThemeKnown(themeState) ? activeThemeRef.id : null;

  // Fun only: every accent's Fun block carries
  // `:where(:not([data-visual-style="pro"]))`, which is what stops a colourway
  // repainting a Pro page. An accent whose colourway *is* the saved one changes
  // nothing worth saying.
  const accentOverride =
    shippedSelection !== null &&
    visualStyle !== "pro" &&
    funPresetId !== null &&
    funPresetId !== shippedSelection
      ? { painting: getPreset(funPresetId), saved: getPreset(shippedSelection) }
      : null;
  const maskedByPro = shippedSelection !== null && visualStyle === "pro";
  const selectionPaints = accentOverride === null && !maskedByPro;

  return (
    <>
      <section className={styles.group} aria-label="Themes">
        <div className={styles.essentialHead}>
          <span className={styles.groupTitle}>Themes</span>
        </div>
        <p className={styles.essentialBlurb}>
          Complete looks — dark and light together. Switch freely: every theme keeps its own edits,
          so nothing you tweaked is lost.
        </p>
        {/* A theme this build no longer has: the saved reference (and its edits)
            are kept, and the default look stands in meanwhile. */}
        {!isActiveThemeKnown(themeState) && (
          <p className={styles.essentialBlurb} role="status">
            Your saved theme “{activeThemeRef.id}” isn’t in this version — showing the default look.
            Your edits to it are still saved.
          </p>
        )}
        {accentOverride && (
          <p className={styles.essentialBlurb} role="status">
            The {accentLabel} accent carries a whole colourway, not just a hue:{" "}
            {accentOverride.painting.name} is painting and your saved {accentOverride.saved.name}{" "}
            sits under it. The accent is set in the site’s appearance control, not here.
          </p>
        )}
        {maskedByPro && (
          <p className={styles.essentialBlurb} role="status">
            Pro paints from its own palette, so a theme picked here moves almost nothing — only the
            hue seeds Pro leaves alone. Switch to Fun to wear these; your own edits land in Pro
            either way.
          </p>
        )}
        <ul className={styles.presetList}>
          {PALETTE_PRESETS.map((preset) => {
            const isSelected = activeThemeRef.kind === "preset" && preset.id === activeThemeRef.id;
            const modified = isSelected && changedCount > 0;
            const isPainting = preset.id === accentOverride?.painting.id;
            // "active" is a claim about the page, so it is only made when the
            // selection is what the page resolves; otherwise it is "saved".
            const state = selectionPaints ? "active" : "saved";
            return (
              <li key={preset.id}>
                <ThemeCard
                  name={preset.name}
                  swatch={preset.swatch}
                  active={isSelected}
                  title={preset.tagline}
                  badge={
                    isSelected ? (
                      <PanelBadge variant="default">
                        {modified ? `${state} · edited` : state}
                      </PanelBadge>
                    ) : isPainting ? (
                      <PanelBadge variant="secondary">painting</PanelBadge>
                    ) : undefined
                  }
                  onSelect={() => onSelect(presetRef(preset.id))}
                />
              </li>
            );
          })}
        </ul>
      </section>

      <MyThemes
        themeState={themeState}
        changedCount={changedCount}
        onSelect={onSelect}
        onChanged={onChanged}
      />

      <p className={styles.galleryFootnote}>
        Want to change individual colors? Switch to <strong>Essentials</strong> or{" "}
        <strong>All colors</strong> above, then pick a swatch.
      </p>
    </>
  );
}
