"use client";

import {
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  useId,
  useRef,
  useState,
} from "react";

import { Icon } from "@/components/common/Icon";
import { useTheme } from "@/context/ThemeContext";
import { useT } from "@/i18n/client";
import { cn } from "@/lib/utils";
import { BASE_ACCENT_PRO_SEEDS, BASE_ACCENT_SWATCH } from "@/theme/accents";
import { getDefaultAppearanceColors } from "@/theme/appearanceChroma";
import { proAccentRepresentativeSeed } from "@/theme/chromaMath";
import { BASE_SURFACE_PRO_SEEDS, BASE_SURFACE_TINT } from "@/theme/surfaces";
import { FontPicker } from "./FontPicker";
import { StylePicker } from "./StylePicker";
import { ThemeToggle } from "./ThemeToggle";

const RAIL_LIGHTNESS = 0.72;
const RAIL_CHROMA = 0.21;

function trackGradient(swatch: string, hue: number): string {
  const stops = [0, 0.25, 0.5, 0.75, 1].map(
    (t) =>
      `oklch(from ${swatch} ${RAIL_LIGHTNESS} ${(RAIL_CHROMA * t).toFixed(4)} calc(h + ${hue}))`,
  );
  return `linear-gradient(90deg, ${stops.join(", ")})`;
}

function hueTrackGradient(swatch: string): string {
  const stops = [0, 60, 120, 180, 240, 300, 360].map(
    (degrees) =>
      `oklch(from ${swatch} ${RAIL_LIGHTNESS} ${RAIL_CHROMA} calc(h + ${degrees}))`,
  );
  return `linear-gradient(90deg, ${stops.join(", ")})`;
}

function useDirectTouchRange(max: number, onChange: (value: number) => void) {
  const activePointerRef = useRef<number | null>(null);

  const updateFromPointer = (event: ReactPointerEvent<HTMLInputElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    if (bounds.width <= 0) return;

    const position = Math.min(
      1,
      Math.max(0, (event.clientX - bounds.left) / bounds.width),
    );
    onChange(Math.round(position * max));
  };

  return {
    onPointerDown(event: ReactPointerEvent<HTMLInputElement>) {
      if (event.pointerType === "mouse") return;

      event.preventDefault();
      activePointerRef.current = event.pointerId;
      event.currentTarget.setPointerCapture?.(event.pointerId);
      event.currentTarget.focus({ preventScroll: true });
      updateFromPointer(event);
    },
    onPointerMove(event: ReactPointerEvent<HTMLInputElement>) {
      if (activePointerRef.current !== event.pointerId) return;
      updateFromPointer(event);
    },
    onPointerUp(event: ReactPointerEvent<HTMLInputElement>) {
      if (activePointerRef.current !== event.pointerId) return;
      updateFromPointer(event);
      activePointerRef.current = null;
    },
    onPointerCancel(event: ReactPointerEvent<HTMLInputElement>) {
      if (activePointerRef.current === event.pointerId) {
        activePointerRef.current = null;
      }
    },
    onLostPointerCapture(event: ReactPointerEvent<HTMLInputElement>) {
      if (activePointerRef.current === event.pointerId) {
        activePointerRef.current = null;
      }
    },
  };
}

function HueSlider({
  label,
  swatch,
  degrees,
  tick,
  onChange,
}: {
  label: string;
  swatch: string;
  degrees: number;
  tick: number;
  onChange: (degrees: number) => void;
}) {
  const directTouch = useDirectTouchRange(359, onChange);
  const t = useT();
  return (
    <div data-appearance-hue="" className="flex flex-col gap-1">
      <div className="flex items-center justify-between gap-3 px-1">
        <span className="text-[0.6875rem] font-medium text-dose-text-muted">
          {t("Hue")}
        </span>
        <span className="text-[0.6875rem] font-medium tabular-nums text-dose-text-muted">
          {degrees}°
        </span>
      </div>
      <div className="px-1">
        <div
          className="theme-chroma-track"
          style={
            {
              "--theme-chroma-track-gradient": hueTrackGradient(swatch),
            } as CSSProperties
          }
        >
          <span
            aria-hidden="true"
            className="theme-chroma-tick"
            style={{ "--theme-chroma-tick": tick / 359 } as CSSProperties}
          />
          <input
            type="range"
            className="theme-chroma-slider"
            min={0}
            max={359}
            step={1}
            value={degrees}
            aria-label={label}
            title={label}
            onChange={(event) => onChange(Number(event.currentTarget.value))}
            {...directTouch}
          />
        </div>
      </div>
    </div>
  );
}

function ChromaSlider({
  label,
  swatch,
  hue,
  tick,
  level,
  onChange,
}: {
  label: string;
  swatch: string;
  hue: number;
  tick: number;
  level: number;
  onChange: (level: number) => void;
}) {
  const directTouch = useDirectTouchRange(100, (value) =>
    onChange(value / 100),
  );
  const percent = Math.round(level * 100);
  const t = useT();
  return (
    <div data-appearance-chroma="" className="flex flex-col gap-1">
      <div className="flex items-center justify-between gap-3 px-1">
        <span className="text-[0.6875rem] font-medium text-dose-text-muted">
          {t("Saturation")}
        </span>
        <span className="text-[0.6875rem] font-medium tabular-nums text-dose-text-muted">
          {percent}%
        </span>
      </div>
      <div className="px-1">
        <div
          className="theme-chroma-track"
          style={
            {
              "--theme-chroma-track-gradient": trackGradient(swatch, hue),
            } as CSSProperties
          }
        >
          <span
            aria-hidden="true"
            className="theme-chroma-tick"
            style={{ "--theme-chroma-tick": tick } as CSSProperties}
          />
          <input
            type="range"
            className="theme-chroma-slider"
            min={0}
            max={100}
            step={1}
            value={percent}
            aria-label={label}
            title={label}
            onChange={(event) =>
              onChange(Number(event.currentTarget.value) / 100)
            }
            {...directTouch}
          />
        </div>
      </div>
    </div>
  );
}

export function axisDot(swatch: string, hue: number, level: number): string {
  return `oklch(from ${swatch} ${RAIL_LIGHTNESS} ${(RAIL_CHROMA * level).toFixed(4)} calc(h + ${hue}))`;
}

function ColorAxisDisclosure({
  axisName,
  dotColor,
  degrees,
  percent,
  children,
}: {
  axisName: string;
  dotColor: string;
  degrees: number;
  percent: number;
  children: ReactNode;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const contentId = useId();

  return (
    <div>
      <button
        type="button"
        aria-expanded={isOpen}
        aria-controls={contentId}
        aria-label={`${axisName} colors`}
        onClick={() => setIsOpen((open) => !open)}
        className="theme-focus-ring flex h-11 w-full items-center gap-2.5 rounded-xl px-3 text-left transition-colors hover:bg-dose-surface-muted [@media(pointer:coarse)]:h-12"
      >
        <span
          aria-hidden="true"
          className="h-3.5 w-3.5 shrink-0 rounded-full ring-1 ring-inset ring-dose-ring"
          style={{ backgroundColor: dotColor }}
        />
        <span className="text-[0.8125rem] font-semibold">{axisName}</span>
        <span className="ml-auto tabular-nums text-[0.6875rem] font-medium text-dose-text-muted">
          {degrees}° · {percent}%
        </span>
        <Icon
          aria-hidden="true"
          icon="lucide:chevron-down"
          size={15}
          className={cn(
            "text-dose-text-muted transition-transform duration-200",
            isOpen && "rotate-180",
          )}
        />
      </button>
      {isOpen ? (
        <div
          id={contentId}
          role="group"
          aria-label={axisName}
          className="mt-2.5 flex flex-col gap-2.5"
        >
          {children}
        </div>
      ) : null}
    </div>
  );
}
export function ColorAxisSliders({
  name,
  swatch,
  degrees,
  level,
  tickDegrees,
  tickLevel,
  onHue,
  onChroma,
}: {
  name: string;
  swatch: string;
  degrees: number;
  level: number;
  tickDegrees: number;
  tickLevel: number;
  onHue: (degrees: number) => void;
  onChroma: (level: number) => void;
}) {
  const t = useT();
  return (
    <>
      <HueSlider
        label={t("{{name}} hue", { name })}
        swatch={swatch}
        degrees={degrees}
        tick={tickDegrees}
        onChange={onHue}
      />
      <ChromaSlider
        label={t("{{name}} saturation", { name })}
        swatch={swatch}
        hue={degrees}
        tick={tickLevel}
        level={level}
        onChange={onChroma}
      />
    </>
  );
}

export type AppearanceAxesRows = {
  showVisualStyle: boolean;
  showColorScheme: boolean;
  showSurface: boolean;
  showAccent: boolean;
  showFont: boolean;
};

export function AppearanceAxes({
  className,
  showVisualStyle,
  showColorScheme,
  showSurface,
  showAccent,
  showFont,
  discloseColorGroups = false,
  surfaceLabel = "Surface",
  footerAction,
}: AppearanceAxesRows & {
  className?: string;
  discloseColorGroups?: boolean;
  surfaceLabel?: string;
  footerAction?: ReactNode;
}) {
  const {
    colorScheme,
    visualStyle,
    surfaceChroma,
    setSurfaceChroma,
    accentChroma,
    setAccentChroma,
    surfaceHue,
    setSurfaceHue,
    accentHue,
    setAccentHue,
    hasCustomColors,
  } = useTheme();

  const defaultColors = getDefaultAppearanceColors(visualStyle, colorScheme);
  const effectiveSurfaceHue = surfaceHue ?? defaultColors.surfaceHue;
  const effectiveAccentHue = accentHue ?? defaultColors.accentHue;

  const surfaceSwatch =
    visualStyle === "pro"
      ? BASE_SURFACE_PRO_SEEDS[colorScheme]["--ei-paper"]!
      : BASE_SURFACE_TINT[colorScheme];
  const proAccentSeed =
    visualStyle === "pro"
      ? proAccentRepresentativeSeed(BASE_ACCENT_PRO_SEEDS, colorScheme)
      : null;
  const accentSwatch = proAccentSeed ?? BASE_ACCENT_SWATCH;

  const showColorAxes = showSurface || showAccent;
  const showReset = showColorAxes && hasCustomColors;
  const hasPreferenceControls = showVisualStyle || showColorScheme || showFont;
  return (
    <div className={cn("flex flex-col gap-3", className)}>
      {hasPreferenceControls ? (
        <div className="flex flex-col gap-2">
          {showColorScheme ? <ThemeToggle /> : null}
          {showVisualStyle ? <StylePicker /> : null}
          {showFont ? <FontPicker /> : null}
        </div>
      ) : null}

      {showColorAxes ? (
        <>
          {discloseColorGroups ? (
            <div className="flex flex-col gap-2">
              {showSurface ? (
                <ColorAxisDisclosure
                  axisName={surfaceLabel}
                  dotColor={axisDot(
                    surfaceSwatch,
                    effectiveSurfaceHue,
                    surfaceChroma,
                  )}
                  degrees={effectiveSurfaceHue}
                  percent={Math.round(surfaceChroma * 100)}
                >
                  <ColorAxisSliders
                    name={surfaceLabel}
                    swatch={surfaceSwatch}
                    degrees={effectiveSurfaceHue}
                    level={surfaceChroma}
                    tickDegrees={defaultColors.surfaceHue}
                    tickLevel={defaultColors.surfaceLevel}
                    onHue={setSurfaceHue}
                    onChroma={setSurfaceChroma}
                  />
                </ColorAxisDisclosure>
              ) : null}

              {showAccent ? (
                <ColorAxisDisclosure
                  axisName="Accent"
                  dotColor={axisDot(
                    accentSwatch,
                    effectiveAccentHue,
                    accentChroma,
                  )}
                  degrees={effectiveAccentHue}
                  percent={Math.round(accentChroma * 100)}
                >
                  <ColorAxisSliders
                    name="Accent"
                    swatch={accentSwatch}
                    degrees={effectiveAccentHue}
                    level={accentChroma}
                    tickDegrees={defaultColors.accentHue}
                    tickLevel={defaultColors.accentLevel}
                    onHue={setAccentHue}
                    onChroma={setAccentChroma}
                  />
                </ColorAxisDisclosure>
              ) : null}
            </div>
          ) : (
            <>
              {showSurface ? (
                <div
                  role="group"
                  aria-label={surfaceLabel}
                  className="flex flex-col gap-2.5"
                >
                  <span className="px-1 text-[0.6875rem] font-semibold uppercase tracking-[0.12em] text-dose-text-muted">
                    {surfaceLabel}
                  </span>
                  <ColorAxisSliders
                    name={surfaceLabel}
                    swatch={surfaceSwatch}
                    degrees={effectiveSurfaceHue}
                    level={surfaceChroma}
                    tickDegrees={defaultColors.surfaceHue}
                    tickLevel={defaultColors.surfaceLevel}
                    onHue={setSurfaceHue}
                    onChroma={setSurfaceChroma}
                  />
                </div>
              ) : null}

              {showAccent ? (
                <div
                  role="group"
                  aria-label="Accent"
                  className="flex flex-col gap-2.5"
                >
                  <span className="px-1 text-[0.6875rem] font-semibold uppercase tracking-[0.12em] text-dose-text-muted">
                    Accent
                  </span>
                  <ColorAxisSliders
                    name="Accent"
                    swatch={accentSwatch}
                    degrees={effectiveAccentHue}
                    level={accentChroma}
                    tickDegrees={defaultColors.accentHue}
                    tickLevel={defaultColors.accentLevel}
                    onHue={setAccentHue}
                    onChroma={setAccentChroma}
                  />
                </div>
              ) : null}
            </>
          )}
        </>
      ) : null}

      {showReset || footerAction ? (
        <div className="flex items-center gap-2">
          {showReset ? (
            <button
              type="button"
              onClick={() => {
                setSurfaceHue(null);
                setSurfaceChroma(null);
                setAccentHue(null);
                setAccentChroma(null);
              }}
              className="theme-focus-ring inline-flex h-9 items-center gap-2 rounded-lg px-3 text-xs font-medium text-dose-text-muted transition-colors hover:bg-dose-surface-muted hover:text-dose-text-secondary [@media(pointer:coarse)]:h-11"
            >
              <Icon icon="fluent:arrow-reset-24-filled" size={14} />
              <span>Reset colors</span>
            </button>
          ) : null}
          {footerAction ? <div className="ml-auto">{footerAction}</div> : null}
        </div>
      ) : null}
    </div>
  );
}
