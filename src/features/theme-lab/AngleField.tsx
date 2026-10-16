"use client";

import { useId, useState } from "react";
import { PanelButton, PanelInput } from "./panelKit";
import {
  ANGLE_CAVEAT,
  ANGLE_MAX,
  ANGLE_NUDGE,
  formatAngle,
  hueSwatchColor,
  normalizeAngle,
  parseAngle,
  type AngleSpec,
} from "./paletteTokensHues";
import styles from "./ThemeLab.module.css";

interface AngleFieldProps {
  initial: string;
  spec: AngleSpec;
  onChange: (next: string) => void;
}

const TRACK_STOPS = 13;

const TRACK = `linear-gradient(to right, ${Array.from(
  { length: TRACK_STOPS },
  (_, index) => hueSwatchColor((index / (TRACK_STOPS - 1)) * ANGLE_MAX, 70, 0.17),
).join(", ")})`;

const PREVIEW: { lightness: number; chroma: number }[] = [
  { lightness: 88, chroma: 0.09 },
  { lightness: 66, chroma: 0.19 },
  { lightness: 38, chroma: 0.13 },
];

export function AngleField({ initial, spec, onChange }: AngleFieldProps) {
  const start = parseAngle(initial) ?? spec.fallback;
  const [degrees, setDegrees] = useState<number>(start);
  const [draft, setDraft] = useState<string>(() => formatAngle(start));
  const sliderId = useId();
  const numberId = useId();

  const commit = (next: number) => {
    const wrapped = normalizeAngle(next);
    setDegrees(wrapped);
    setDraft(formatAngle(wrapped));
    onChange(formatAngle(wrapped));
  };

  return (
    <div className="flex flex-col gap-[0.1875rem]">
      <div className="mb-1.5 flex items-center gap-1.5" aria-hidden="true">
        {PREVIEW.map((stop) => (
          <span
            key={stop.lightness}
            className="h-9 flex-1 rounded-md border border-dose-border-strong"
            style={{ background: hueSwatchColor(degrees, stop.lightness, stop.chroma) }}
          />
        ))}
      </div>
      <label className={styles.fieldCaption} htmlFor={sliderId}>
        Hue, all the way around{" "}
        <span className={styles.alphaValue}>{formatAngle(degrees)}°</span>
      </label>
      <input
        id={sliderId}
        type="range"
        min={0}
        max={ANGLE_MAX - 1}
        step={1}
        value={degrees}
        aria-valuetext={`${formatAngle(degrees)} degrees`}
        className={styles.rangeTrack}
        style={{ background: TRACK }}
        onChange={(event) => commit(Number(event.target.value))}
      />
      <div className="mt-1 flex items-center gap-1.5">
        <PanelButton
          variant="outline"
          aria-label={`Turn back ${ANGLE_NUDGE} degrees`}
          onClick={() => commit(degrees - ANGLE_NUDGE)}
        >
          −{ANGLE_NUDGE}°
        </PanelButton>
        <label className="sr-only" htmlFor={numberId}>
          Hue angle in degrees
        </label>
        <PanelInput
          id={numberId}
          type="number"
          inputMode="numeric"
          value={draft}
          className="flex-1 text-center"
          onChange={(event) => {
            setDraft(event.target.value);
            const parsed = parseAngle(event.target.value);
            if (parsed !== null) {
              setDegrees(parsed);
              onChange(formatAngle(parsed));
            }
          }}
          onBlur={() => commit(parseAngle(draft) ?? degrees)}
        />
        <PanelButton
          variant="outline"
          aria-label={`Turn forward ${ANGLE_NUDGE} degrees`}
          onClick={() => commit(degrees + ANGLE_NUDGE)}
        >
          +{ANGLE_NUDGE}°
        </PanelButton>
      </div>
      <p className={styles.editorHint}>{ANGLE_CAVEAT}</p>
    </div>
  );
}
