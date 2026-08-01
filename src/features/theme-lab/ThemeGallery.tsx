"use client";

import { PanelBadge } from "./panelKit";
import { MyThemes } from "./MyThemes";
import { ThemeCard } from "./ThemeCard";
import { PALETTE_PRESETS } from "./palettePresets";
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
        <ul className={styles.presetList}>
          {PALETTE_PRESETS.map((preset) => {
            const isActive = activeThemeRef.kind === "preset" && preset.id === activeThemeRef.id;
            const modified = isActive && changedCount > 0;
            return (
              <li key={preset.id}>
                <ThemeCard
                  name={preset.name}
                  swatch={preset.swatch}
                  active={isActive}
                  title={preset.tagline}
                  badge={
                    isActive ? (
                      <PanelBadge variant="default">
                        {modified ? "active · edited" : "active"}
                      </PanelBadge>
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
