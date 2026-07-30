"use client";

import { PALETTE_PRESETS } from "./palettePresets";
import { isActiveThemeKnown, type ThemeLabState } from "./paletteLabTheme";
import styles from "./PaletteLab.module.css";

/**
 * The Theme Lab's gallery: complete shipped looks, one tap to wear.
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
  onSelect: (presetId: string) => void;
}

export function ThemeGallery({ themeState, changedCount, onSelect }: ThemeGalleryProps) {
  const { activeThemeRef } = themeState;

  return (
    <section className={styles.group} aria-label="Themes">
      <div className={styles.essentialHead}>
        <span className={styles.groupTitle}>Themes</span>
      </div>
      <p className={styles.essentialBlurb}>
        Complete looks — dark and light together. Switch freely: every theme keeps its own edits, so
        nothing you tweaked is lost.
      </p>
      {/* A palette this build no longer ships: the saved reference (and its
          edits) are kept, and the default look stands in meanwhile. */}
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
              <button
                type="button"
                className={`${styles.presetCard} ${isActive ? styles.presetCardActive : ""}`}
                aria-pressed={isActive}
                title={preset.tagline}
                onClick={() => onSelect(preset.id)}
              >
                <span className={styles.presetName}>
                  {preset.name}
                  {isActive && (
                    <span className={styles.presetActiveBadge}>
                      {modified ? "active · edited" : "active"}
                    </span>
                  )}
                </span>
                <span className={styles.presetStrips} aria-hidden="true">
                  {(["dark", "light"] as const).map((strip) => (
                    <span key={strip} className={styles.presetStrip}>
                      {preset.swatch[strip].map((hex, index) => (
                        <span key={`${strip}-${index}`} style={{ background: hex }} />
                      ))}
                    </span>
                  ))}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      <p className={styles.galleryFootnote}>
        Want to change individual colors? Switch to <strong>Essentials</strong> or{" "}
        <strong>All colors</strong> above, then pick a swatch.
      </p>
    </section>
  );
}
