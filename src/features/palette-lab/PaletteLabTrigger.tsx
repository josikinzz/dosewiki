"use client";

import { useRef } from "react";
import { togglePaletteLab, usePaletteLabOpen } from "./paletteLabStore";
import styles from "./PaletteLab.module.css";

interface PaletteLabTriggerProps {
  className?: string;
}

/**
 * The color-wheel button that opens the Palette Lab sidebar. It is decoupled
 * from the panel (which is mounted once, globally) and just toggles shared
 * state, so the same trigger can sit next to the theme toggle in the footer and
 * on the homepage. Shown at every width: the panel docks as a right sidebar on
 * desktop and as a bottom sheet on mobile.
 */
export function PaletteLabTrigger({ className = "" }: PaletteLabTriggerProps) {
  const open = usePaletteLabOpen();
  const ref = useRef<HTMLButtonElement>(null);

  return (
    <button
      type="button"
      ref={ref}
      data-palette-lab=""
      aria-label={open ? "Close Palette Lab" : "Open Palette Lab"}
      aria-expanded={open}
      aria-haspopup="dialog"
      aria-controls="palette-lab-panel"
      title="Palette Lab — live color editor"
      className={`theme-icon-button ${styles.trigger} ${open ? styles.triggerActive : ""} ${className}`.trim()}
      onClick={() => togglePaletteLab(ref.current)}
    >
      <span className={styles.triggerWheel} aria-hidden="true" />
    </button>
  );
}
