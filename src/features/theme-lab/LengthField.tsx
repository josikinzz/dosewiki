"use client";

import { useId, useState } from "react";
import { formatRem, parseRem, type LengthSpec } from "./paletteTokensRadius";
import styles from "./ThemeLab.module.css";

interface LengthFieldProps {
  initial: string;
  spec: LengthSpec;
  onChange: (next: string) => void;
}

export function LengthField({ initial, spec, onChange }: LengthFieldProps) {
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
      <label className={styles.fieldCaption} htmlFor={sliderId}>
        Roundness, sharp to round{" "}
        <span className={styles.alphaValue}>{formatRem(rem)}</span>
      </label>
      <input
        id={sliderId}
        type="range"
        min={spec.min}
        max={spec.max}
        step={spec.step}
        value={rem}
        aria-valuetext={formatRem(rem)}
        className={styles.rangeTrack}
        style={{
          background: `linear-gradient(to right, var(--theme-accent-muted) ${percent}%, transparent ${percent}%)`,
        }}
        onChange={(event) => commit(Number(event.target.value))}
      />
    </div>
  );
}
