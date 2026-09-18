"use client";

import { useCallback, useId, useRef, useState } from "react";
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
import { PanelInput } from "./panelKit";
import styles from "./ThemeLab.module.css";

/**
 * The Theme Lab's compact color control: a saturation/value rectangle over a
 * full-width hue slider, with hex + alpha beneath.
 *
 * It replaces the fixed 176px ring-plus-square wheel, which pinned more panel
 * height than the catalog it sat above. The rainbow wheel is not gone — it
 * survives as the tool's brand glyph in the panel header — but
 * the *editing* surface is now a rectangle that spans the panel width and costs
 * roughly half the vertical space.
 *
 * The contract is unchanged from the wheel it replaces: an `initial` color plus
 * an `onChange` callback, with the component remounted (via `key`) whenever the
 * selection changes externally, so it owns its editing state thereafter.
 */

interface ColorFieldProps {
  /** Starting color. Remount via `key` to rebind to a new selection. */
  initial: Rgba;
  onChange: (next: Rgba) => void;
}

export function ColorField({ initial, onChange }: ColorFieldProps) {
  const [hsv, setHsv] = useState<Hsv>(() => rgbToHsv(initial));
  const [alpha, setAlpha] = useState<number>(() => initial.a);
  const [hexDraft, setHexDraft] = useState<string>(() => rgbToHex(initial));
  // The fields are kit components, so the labels pair by id rather than by
  // wrapping a native control.
  const hexId = useId();
  const alphaId = useId();

  // Always call the freshest onChange without re-binding pointer handlers.
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const hueBarRef = useRef<HTMLDivElement>(null);
  const squareRef = useRef<HTMLDivElement>(null);
  const dragRectRef = useRef<DOMRect | null>(null);
  const dragPositionRef = useRef<{ clientX: number; clientY: number } | null>(null);
  const dragFrameRef = useRef<number | null>(null);

  const commit = useCallback((nextHsv: Hsv, nextAlpha: number) => {
    setHsv(nextHsv);
    setAlpha(nextAlpha);
    const rgb = hsvToRgb(nextHsv);
    const next = { ...rgb, a: nextAlpha };
    setHexDraft(rgbToHex(rgb));
    onChangeRef.current(next);
  }, []);

  const updateHueFromEvent = useCallback(
    (event: { clientX: number }) => {
      const rect = dragRectRef.current;
      if (!rect || rect.width === 0) return;
      const hue = clamp((event.clientX - rect.left) / rect.width, 0, 1) * 360;
      commit({ ...hsv, h: hue }, alpha);
    },
    [alpha, commit, hsv],
  );

  const updateSvFromEvent = useCallback(
    (event: { clientX: number; clientY: number }) => {
      const rect = dragRectRef.current;
      if (!rect) return;
      const s = clamp((event.clientX - rect.left) / rect.width, 0, 1);
      const v = clamp(1 - (event.clientY - rect.top) / rect.height, 0, 1);
      commit({ ...hsv, s, v }, alpha);
    },
    [alpha, commit, hsv],
  );

  const makeDragHandler = useCallback(
    (
      apply: (event: { clientX: number; clientY: number }) => void,
      getRect: () => DOMRect | null,
    ) =>
      (event: React.PointerEvent) => {
        event.preventDefault();
        (event.target as Element).setPointerCapture?.(event.pointerId);
        dragRectRef.current = getRect();
        apply(event);
        const move = (moveEvent: PointerEvent) => {
          dragPositionRef.current = { clientX: moveEvent.clientX, clientY: moveEvent.clientY };
          if (dragFrameRef.current !== null) return;
          dragFrameRef.current = window.requestAnimationFrame(() => {
            dragFrameRef.current = null;
            const position = dragPositionRef.current;
            if (position) apply(position);
          });
        };
        const end = () => {
          window.removeEventListener("pointermove", move);
          window.removeEventListener("pointerup", end);
          window.removeEventListener("pointercancel", end);
          if (dragFrameRef.current !== null) {
            window.cancelAnimationFrame(dragFrameRef.current);
            dragFrameRef.current = null;
            // Flush the coalesced move so the handle lands where the pointer ended.
            const position = dragPositionRef.current;
            if (position) apply(position);
          }
          dragPositionRef.current = null;
          dragRectRef.current = null;
        };
        window.addEventListener("pointermove", move);
        window.addEventListener("pointerup", end);
        window.addEventListener("pointercancel", end);
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
    const cleaned = value.trim().replace(/^#/, "");
    const nextAlpha = cleaned.length === 4 || cleaned.length === 8 ? parsed.a : alpha;
    commit(rgbToHsv(parsed), nextAlpha);
  };

  // Keyboard nudges on the focusable handles.
  const onHueKeyDown = (event: React.KeyboardEvent) => {
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

  const huePercent = (hsv.h / 360) * 100;
  const svLeftPercent = hsv.s * 100;
  const svTopPercent = (1 - hsv.v) * 100;

  return (
    <div className={styles.colorField}>
      <div
        ref={squareRef}
        className={styles.svSquare}
        style={{
          backgroundColor: pureHue,
          backgroundImage:
            "linear-gradient(to top, #000, rgba(0,0,0,0)), linear-gradient(to right, #fff, rgba(255,255,255,0))",
        }}
        onPointerDown={makeDragHandler(
          updateSvFromEvent,
          () => squareRef.current?.getBoundingClientRect() ?? null,
        )}
      >
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
          style={{ left: `${svLeftPercent}%`, top: `${svTopPercent}%`, backgroundColor: solid }}
          onKeyDown={onSquareKeyDown}
          onPointerDown={(event) => event.stopPropagation()}
        />
      </div>

      <div
        ref={hueBarRef}
        className={styles.hueBar}
        onPointerDown={makeDragHandler(
          updateHueFromEvent,
          () => hueBarRef.current?.getBoundingClientRect() ?? null,
        )}
      >
        <div
          className={styles.hueHandle}
          role="slider"
          tabIndex={0}
          aria-label="Hue"
          aria-valuemin={0}
          aria-valuemax={360}
          aria-valuenow={Math.round(hsv.h)}
          style={{ left: `${huePercent}%`, backgroundColor: pureHue }}
          onKeyDown={onHueKeyDown}
          onPointerDown={(event) => event.stopPropagation()}
        />
      </div>

      <div className={styles.fieldReadout}>
        <span className={styles.swatchLarge} aria-hidden="true">
          <span className={styles.swatchLargeFill} style={{ background: formatColor(current) }} />
        </span>
        <div className={styles.readoutFields}>
          <div className={styles.hexField}>
            <label className={styles.fieldCaption} htmlFor={hexId}>
              Hex
            </label>
            <PanelInput
              id={hexId}
              type="text"
              spellCheck={false}
              value={hexDraft}
              className="font-mono"
              onChange={(event) => {
                setHexDraft(event.target.value);
                applyHexDraft(event.target.value);
              }}
              onBlur={(event) => setHexDraft(rgbToHex(hexToRgba(event.target.value) ?? rgb))}
            />
          </div>
          <div className={styles.alphaField}>
            <label className={styles.fieldCaption} htmlFor={alphaId}>
              Alpha <span className={styles.alphaValue}>{Math.round(alpha * 100)}%</span>
            </label>
            <input
              id={alphaId}
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={alpha}
              // Announce the percentage the label shows, not the raw 0–1 step.
              aria-valuetext={`${Math.round(alpha * 100)}%`}
              className={styles.rangeTrack}
              style={{
                background: `linear-gradient(to right, transparent, ${solid}), repeating-conic-gradient(var(--pl-checker) 0 25%, transparent 0 50%) 0 0 / 12px 12px`,
              }}
              onChange={onAlphaChange}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
