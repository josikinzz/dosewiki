"use client";

import { useCallback, useRef, useState } from "react";
import {
  clamp,
  formatColor,
  hexToRgba,
  hsvToRgb,
  rgbToHex,
  rgbToHsv,
  type Hsv,
  type Rgba,
} from "./colorUtils";
import styles from "./PaletteLab.module.css";

const SIZE = 208;
const RING = 20;
const R = SIZE / 2;
const RING_MID = R - RING / 2;
const INNER_R = R - RING;
const SQUARE = Math.floor(INNER_R * Math.SQRT2) - 2;
const SQ_OFFSET = (SIZE - SQUARE) / 2;

interface ColorWheelProps {
  /** Starting color. The component is meant to be remounted (via `key`) when
   *  this changes externally, so it owns its editing state thereafter. */
  initial: Rgba;
  onChange: (next: Rgba) => void;
}

export function ColorWheel({ initial, onChange }: ColorWheelProps) {
  const [hsv, setHsv] = useState<Hsv>(() => rgbToHsv(initial));
  const [alpha, setAlpha] = useState<number>(() => initial.a);
  const [hexDraft, setHexDraft] = useState<string>(() => rgbToHex(initial));

  // Always call the freshest onChange without re-binding pointer handlers.
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const ringRef = useRef<HTMLDivElement>(null);
  const squareRef = useRef<HTMLDivElement>(null);

  const commit = useCallback((nextHsv: Hsv, nextAlpha: number) => {
    setHsv(nextHsv);
    setAlpha(nextAlpha);
    const rgb = hsvToRgb(nextHsv);
    const next = { ...rgb, a: nextAlpha };
    setHexDraft(rgbToHex(rgb));
    onChangeRef.current(next);
  }, []);

  const updateHueFromEvent = useCallback(
    (event: { clientX: number; clientY: number }) => {
      const el = ringRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const angle = Math.atan2(event.clientY - cy, event.clientX - cx) * (180 / Math.PI);
      const hue = (angle + 90 + 360) % 360;
      commit({ ...hsv, h: hue }, alpha);
    },
    [alpha, commit, hsv],
  );

  const updateSvFromEvent = useCallback(
    (event: { clientX: number; clientY: number }) => {
      const el = squareRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const s = clamp((event.clientX - rect.left) / rect.width, 0, 1);
      const v = clamp(1 - (event.clientY - rect.top) / rect.height, 0, 1);
      commit({ ...hsv, s, v }, alpha);
    },
    [alpha, commit, hsv],
  );

  const makeDragHandler = useCallback(
    (apply: (event: { clientX: number; clientY: number }) => void) =>
      (event: React.PointerEvent) => {
        event.preventDefault();
        (event.target as Element).setPointerCapture?.(event.pointerId);
        apply(event);
        const move = (moveEvent: PointerEvent) => apply(moveEvent);
        const up = () => {
          window.removeEventListener("pointermove", move);
          window.removeEventListener("pointerup", up);
        };
        window.addEventListener("pointermove", move);
        window.addEventListener("pointerup", up);
      },
    [],
  );

  const onAlphaChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const next = clamp(Number(event.target.value), 0, 1);
    commit(hsv, next);
  };

  const applyHexDraft = (value: string) => {
    const parsed = hexToRgba(value);
    if (!parsed) return;
    // Hex edits set RGB; preserve the current alpha unless the hex carried one.
    const nextAlpha = /[0-9a-fA-F]{8}$|[0-9a-fA-F]{4}$/.test(value.replace(/^#/, ""))
      ? parsed.a
      : alpha;
    commit(rgbToHsv(parsed), nextAlpha);
  };

  // Keyboard nudges on the focusable handles.
  const onRingKeyDown = (event: React.KeyboardEvent) => {
    const step = event.shiftKey ? 10 : 2;
    if (event.key === "ArrowRight" || event.key === "ArrowUp") {
      event.preventDefault();
      commit({ ...hsv, h: (hsv.h + step) % 360 }, alpha);
    } else if (event.key === "ArrowLeft" || event.key === "ArrowDown") {
      event.preventDefault();
      commit({ ...hsv, h: (hsv.h - step + 360) % 360 }, alpha);
    }
  };

  const onSquareKeyDown = (event: React.KeyboardEvent) => {
    const step = event.shiftKey ? 0.1 : 0.02;
    let { s, v } = hsv;
    if (event.key === "ArrowRight") s = clamp(s + step, 0, 1);
    else if (event.key === "ArrowLeft") s = clamp(s - step, 0, 1);
    else if (event.key === "ArrowUp") v = clamp(v + step, 0, 1);
    else if (event.key === "ArrowDown") v = clamp(v - step, 0, 1);
    else return;
    event.preventDefault();
    commit({ ...hsv, s, v }, alpha);
  };

  const rgb = hsvToRgb(hsv);
  const current: Rgba = { ...rgb, a: alpha };
  const pureHue = `hsl(${hsv.h.toFixed(1)} 100% 50%)`;
  const solid = rgbToHex(rgb);

  const hueAngle = ((hsv.h - 90) * Math.PI) / 180;
  const hueX = R + RING_MID * Math.cos(hueAngle);
  const hueY = R + RING_MID * Math.sin(hueAngle);
  const svX = SQ_OFFSET + hsv.s * SQUARE;
  const svY = SQ_OFFSET + (1 - hsv.v) * SQUARE;

  return (
    <div className={styles.wheel}>
      <div className={styles.wheelStage} style={{ width: SIZE, height: SIZE }}>
        <div
          ref={ringRef}
          className={styles.hueRing}
          style={{
            width: SIZE,
            height: SIZE,
            background:
              "conic-gradient(from 0deg, #ff0000, #ffff00, #00ff00, #00ffff, #0000ff, #ff00ff, #ff0000)",
            WebkitMaskImage: `radial-gradient(circle at center, transparent 0 ${INNER_R}px, #000 ${INNER_R}px 100%)`,
            maskImage: `radial-gradient(circle at center, transparent 0 ${INNER_R}px, #000 ${INNER_R}px 100%)`,
          }}
          onPointerDown={makeDragHandler(updateHueFromEvent)}
        />
        <div
          ref={squareRef}
          className={styles.svSquare}
          style={{
            width: SQUARE,
            height: SQUARE,
            left: SQ_OFFSET,
            top: SQ_OFFSET,
            backgroundColor: pureHue,
            backgroundImage:
              "linear-gradient(to top, #000, rgba(0,0,0,0)), linear-gradient(to right, #fff, rgba(255,255,255,0))",
          }}
          onPointerDown={makeDragHandler(updateSvFromEvent)}
        />
        <div
          className={styles.hueHandle}
          role="slider"
          tabIndex={0}
          aria-label="Hue"
          aria-valuemin={0}
          aria-valuemax={360}
          aria-valuenow={Math.round(hsv.h)}
          style={{ left: hueX, top: hueY, backgroundColor: pureHue }}
          onKeyDown={onRingKeyDown}
        />
        <div
          className={styles.svHandle}
          role="slider"
          tabIndex={0}
          aria-label="Saturation and brightness"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(hsv.v * 100)}
          aria-valuetext={`saturation ${Math.round(hsv.s * 100)}%, brightness ${Math.round(
            hsv.v * 100,
          )}%`}
          style={{ left: svX, top: svY, backgroundColor: solid }}
          onKeyDown={onSquareKeyDown}
        />
      </div>

      <div className={styles.wheelReadout}>
        <span className={styles.swatchLarge} aria-hidden="true">
          <span className={styles.swatchLargeFill} style={{ background: formatColor(current) }} />
        </span>
        <div className={styles.readoutFields}>
          <label className={styles.hexField}>
            <span className={styles.fieldCaption}>Hex</span>
            <input
              type="text"
              spellCheck={false}
              value={hexDraft}
              className={styles.hexInput}
              onChange={(event) => {
                setHexDraft(event.target.value);
                applyHexDraft(event.target.value);
              }}
              onBlur={(event) => setHexDraft(rgbToHex(hexToRgba(event.target.value) ?? rgb))}
            />
          </label>
          <label className={styles.alphaField}>
            <span className={styles.fieldCaption}>
              Alpha <span className={styles.alphaValue}>{Math.round(alpha * 100)}%</span>
            </span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={alpha}
              className={styles.alphaSlider}
              style={{
                background: `linear-gradient(to right, transparent, ${solid}), repeating-conic-gradient(var(--pl-checker) 0 25%, transparent 0 50%) 0 0 / 12px 12px`,
              }}
              onChange={onAlphaChange}
            />
          </label>
        </div>
      </div>
    </div>
  );
}
