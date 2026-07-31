"use client";

import { Button } from "@/components/ui";
import { cn } from "@/lib/utils";
import { PanelBadge } from "./panelKit";
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
              <Button
                type="button"
                variant={isActive ? "pillActive" : "outline"}
                size="auto"
                className={cn(
                  "w-full flex-col items-stretch gap-1.5 rounded-xl px-2 py-1.5 text-left",
                  "[@media(pointer:coarse)]:min-h-11",
                )}
                aria-pressed={isActive}
                title={preset.tagline}
                onClick={() => onSelect(preset.id)}
              >
                <span className={styles.presetName}>
                  {preset.name}
                  {isActive && (
                    <PanelBadge variant="default">
                      {modified ? "active · edited" : "active"}
                    </PanelBadge>
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
              </Button>
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
