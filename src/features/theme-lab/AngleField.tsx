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

/**
 * The Theme Lab's angle control: one full turn of hue over a live preview of
 * the family the seed derives.
 *
 * A hue seed is not a color, it is *where* a whole family of colors sits on the
 * circle, so the instrument is a circle rather than a swatch: a rainbow track
 * spanning 0–360 (the panel's shared range instrument, wearing a hue gradient
 * instead of an alpha one), three preview chips showing the light / mid / deep
 * ends of the family that angle produces, and a readout with wrap-around
 * nudges. Dragging this is the whole-theme re-hue the tool is for.
 *
 * Wraparound: a native range clamps at its ends, so the seam at 0/360 is
 * crossed with the nudge buttons — and by typing any angle at all, since 400
 * lands on 40 and -20 on 340. The track itself stops one degree short of a full
 * turn because 360 *is* 0, and offering both would duplicate one end.
 *
 * The contract mirrors {@link ColorField} and {@link LengthField}: an `initial`
 * value plus an `onChange`, with the component remounted (via `key`) whenever
 * the selection changes, so it owns its editing state thereafter. `onChange`
 * emits a bare degree string because that is what the stylesheet's `oklch()`
 * calls, the override layer, the export and storage all speak.
 */

interface AngleFieldProps {
  /** Current CSS value, e.g. "326". Remount via `key` to rebind. */
  initial: string;
  spec: AngleSpec;
  onChange: (next: string) => void;
}

/** Enough stops that the track reads as a continuous circle of hue. */
const TRACK_STOPS = 13;

const TRACK = `linear-gradient(to right, ${Array.from(
  { length: TRACK_STOPS },
  (_, index) => hueSwatchColor((index / (TRACK_STOPS - 1)) * ANGLE_MAX, 70, 0.17),
).join(", ")})`;

/** Light / mid / deep — the three ends the derived families actually occupy. */
const PREVIEW: { lightness: number; chroma: number }[] = [
  { lightness: 88, chroma: 0.09 },
  { lightness: 66, chroma: 0.19 },
  { lightness: 38, chroma: 0.13 },
];

export function AngleField({ initial, spec, onChange }: AngleFieldProps) {
  // An unparseable or absent computed value (jsdom, or a variable the browser
  // has not resolved) starts on the seed's authored angle rather than at zero,
  // which would read as "this theme is already red".
  const start = parseAngle(initial) ?? spec.fallback;
  const [degrees, setDegrees] = useState<number>(start);
  // The typed readout keeps its own draft so a half-typed "3" is not normalized
  // to 3° under the visitor's cursor.
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
            // The border alias rather than the raw theme custom property: the
            // repo's token audit scans feature TSX (comments included) for the
            // bare variable, and the alias expands to the same declaration.
            className="h-9 flex-1 rounded-md border border-dose-border-strong"
            style={{ background: hueSwatchColor(degrees, stop.lightness, stop.chroma) }}
          />
        ))}
      </div>
      <label className={styles.fieldCaption} htmlFor={sliderId}>
        Hue — all the way around{" "}
        <span className={styles.alphaValue}>{formatAngle(degrees)}°</span>
      </label>
      <input
        id={sliderId}
        type="range"
        min={0}
        max={ANGLE_MAX - 1}
        step={1}
        value={degrees}
        // Without this a screen reader announces a bare number; the unit is the
        // part a visitor spinning a palette actually needs.
        aria-valuetext={`${formatAngle(degrees)} degrees`}
        className={styles.rangeTrack}
        style={{ background: TRACK }}
        onChange={(event) => commit(Number(event.target.value))}
      />
      <div className="mt-1 flex items-center gap-1.5">
        {/* The seam at 0/360 is where a native range stops and a circle does
            not, so crossing it is what these two are for. */}
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
          // Any angle at all is legal on a circle, so the wrap happens on blur:
          // typing "400" is not rewritten to "40" mid-keystroke.
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
