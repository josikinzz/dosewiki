"use client";

import type { ReactNode } from "react";
import { Button } from "@/components/ui";
import { cn } from "@/lib/utils";
import styles from "./PaletteLab.module.css";

/**
 * One complete look in the gallery: its name, its dark/light strips, and a
 * badge when it is the one being worn.
 *
 * Shipped presets and the visitor's own saved slots render through this same
 * component on purpose — the ticket's promise is that a custom theme applies
 * "exactly like a shipped preset", and sharing the card is the cheapest way to
 * keep that true as the card evolves.
 */

interface ThemeCardProps {
  name: string;
  /** Five representative colors per theme. Display only. */
  swatch: { dark: string[]; light: string[] };
  active: boolean;
  badge?: ReactNode;
  title?: string;
  onSelect: () => void;
}

/**
 * The two color strips (dark over light) a look is judged by at a glance.
 * Shared with the shared-theme invite card, so a theme previews with exactly
 * the strips it will wear in the gallery once kept.
 */
export function ThemeStrips({ swatch }: { swatch: { dark: string[]; light: string[] } }) {
  return (
    <span className={styles.presetStrips} aria-hidden="true">
      {(["dark", "light"] as const).map((strip) => (
        <span key={strip} className={styles.presetStrip}>
          {swatch[strip].map((value, index) => (
            <span key={`${strip}-${index}`} style={{ background: value }} />
          ))}
        </span>
      ))}
    </span>
  );
}

export function ThemeCard({ name, swatch, active, badge, title, onSelect }: ThemeCardProps) {
  return (
    <Button
      type="button"
      variant={active ? "pillActive" : "outline"}
      size="auto"
      className={cn(
        // `pillActive` names a border *colour* and no width, while `outline`
        // carries `border` — and preflight resets every element to
        // `border: 0 solid`. Without this the selected card loses its 1px
        // border, shrinks 2px in both axes and reflows the list the moment a
        // theme is picked.
        "border",
        "w-full flex-col items-stretch gap-1.5 rounded-xl px-2 py-1.5 text-left",
        "[@media(pointer:coarse)]:min-h-11",
      )}
      aria-pressed={active}
      title={title}
      onClick={onSelect}
    >
      <span className={styles.presetName}>
        {name}
        {badge}
      </span>
      <ThemeStrips swatch={swatch} />
    </Button>
  );
}
