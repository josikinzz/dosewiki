"use client";

import { useId, useState } from "react";
import { formatRem, parseRem, type LengthSpec } from "./paletteTokensRadius";
import styles from "./ThemeLab.module.css";

/**
 * The Theme Lab's length control: a slider over a live corner preview.
 *
 * Colors get a saturation/value rectangle; a length gets the one control a
 * length wants — a track with a readout, plus a preview tile wearing the value
 * so the visitor can see the shape they are choosing without hunting for a card
 * on the page behind the panel.
 *
 * The contract mirrors {@link ColorField}: an `initial` value plus an `onChange`,
 * with the component remounted (via `key`) whenever the selection changes, so it
 * owns its editing state thereafter. `onChange` emits a CSS length string
 * because that is what the override layer, the export and storage all speak.
 */

interface LengthFieldProps {
  /** Current CSS value, e.g. "1rem". Remount via `key` to rebind. */
  initial: string;
  spec: LengthSpec;
  onChange: (next: string) => void;
}

export function LengthField({ initial, spec, onChange }: LengthFieldProps) {
  // An unparseable or absent computed value (a `calc()`, or jsdom reporting
  // nothing) starts the slider at the token's authored default rather than at
  // zero, which would read as "this token is already sharp".
  const [rem, setRem] = useState<number>(
    () => parseRem(initial) ?? parseRem(spec.fallback) ?? spec.min,
  );
  const sliderId = useId();

  const commit = (next: number) => {
    const clamped = Math.min(spec.max, Math.max(spec.min, next));
    setRem(clamped);
    onChange(formatRem(clamped));
  };

  const percent = spec.max > spec.min ? ((rem - spec.min) / (spec.max - spec.min)) * 100 : 0;

  return (
    <div className={styles.lengthField}>
      <div className={styles.lengthPreview} aria-hidden="true">
        <span className={styles.lengthPreviewTile} style={{ borderRadius: formatRem(rem) }} />
        <span className={styles.lengthPreviewTile} style={{ borderRadius: formatRem(rem) }} />
      </div>
      {/* The caption carries the ends of the range as words, so "sharp" and
          "round" are stated rather than inferred from the track. */}
      <label className={styles.fieldCaption} htmlFor={sliderId}>
        Roundness — sharp to round{" "}
        <span className={styles.alphaValue}>{formatRem(rem)}</span>
      </label>
      <input
        id={sliderId}
        type="range"
        min={spec.min}
        max={spec.max}
        step={spec.step}
        value={rem}
        // Without this a screen reader announces a bare number; the unit is the
        // part a visitor picking a corner size actually needs.
        aria-valuetext={formatRem(rem)}
        className={styles.rangeTrack}
        // Sharp on the left, round on the right, with the current position marked
        // — the same "read the track, not the thumb" affordance the alpha slider
        // gets from its gradient.
        style={{
          background: `linear-gradient(to right, var(--theme-accent-muted) ${percent}%, transparent ${percent}%)`,
        }}
        onChange={(event) => commit(Number(event.target.value))}
      />
    </div>
  );
}
