"use client";

import {
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  useId,
  useRef,
  useState,
} from "react";

import { ExpandButton } from "@/components/common/ExpandButton";
import { Icon } from "@/components/common/Icon";
import { useTheme } from "@/context/ThemeContext";
import { useT } from "@/i18n/client";
import { BASE_ACCENT_PRO_SEEDS, BASE_ACCENT_SWATCH } from "@/theme/accents";
import { getDefaultAppearanceColors } from "@/theme/appearanceChroma";
import {
  DEFAULT_LETTER_SPACING_LEXEND,
  DEFAULT_LETTER_SPACING_STANDARD,
  DEFAULT_LINE_HEIGHT,
  DEFAULT_TEXT_SIZE,
  READER_LEADING_RANGE,
  READER_TRACKING_RANGE,
  TEXT_SIZE_RANGE,
} from "@/theme/appearanceTypography";
import { proAccentRepresentativeSeed } from "@/theme/chromaMath";
import { BASE_SURFACE_PRO_SEEDS, BASE_SURFACE_TINT } from "@/theme/surfaces";
import { FontPicker } from "./FontPicker";
import { SchemeToggle } from "./SchemeToggle";
import { StylePicker } from "./StylePicker";
import {
  ColorAxisSliders,
  axisDot,
} from "./AppearanceAxes";

type AppearanceTab = "font" | "colour";

function signedEm(value: number): string {
  return `${value > 0 ? "+" : ""}${Number(value.toFixed(2))} em`;
}

export type AppearancePanelRows = {
  showVisualStyle: boolean;
  showColorScheme: boolean;
  showSurface: boolean;
  showAccent: boolean;
  showFont: boolean;
};

export function AppearancePanel({
  showVisualStyle,
  showColorScheme,
  showSurface,
  showAccent,
  showFont,
  surfaceLabel = "Background",
  footerAction,
}: AppearancePanelRows & {
  surfaceLabel?: string;
  footerAction?: ReactNode;
}) {
  const t = useT();
  const [tab, setTab] = useState<AppearanceTab>(
    showSurface || showAccent || showColorScheme ? "colour" : "font",
  );
  const {
    colorScheme,
    visualStyle,
    fontPreference,
    textSize,
    setTextSize,
    letterSpacing,
    setLetterSpacing,
    lineHeight,
    setLineHeight,
    surfaceChroma,
    setSurfaceChroma,
    accentChroma,
    setAccentChroma,
    surfaceHue,
    setSurfaceHue,
    accentHue,
    setAccentHue,
  } = useTheme();

  const defaultColors = getDefaultAppearanceColors(visualStyle, colorScheme);
  const effectiveSurfaceHue = surfaceHue ?? defaultColors.surfaceHue;
  const effectiveAccentHue = accentHue ?? defaultColors.accentHue;
  const effectiveTextSize = textSize ?? DEFAULT_TEXT_SIZE;
  const effectiveLetterSpacing =
    letterSpacing ?? (fontPreference === "lexend" ? DEFAULT_LETTER_SPACING_LEXEND : DEFAULT_LETTER_SPACING_STANDARD);
  const effectiveLineHeight = lineHeight ?? DEFAULT_LINE_HEIGHT;

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
  const colourTabReachable = showColorAxes || showColorScheme;
  const swapTarget: AppearanceTab | null =
    tab === "font" ? (colourTabReachable ? "colour" : null) : showFont ? "font" : null;

  if (tab === "font") {
    return (
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-1">
          {showFont ? <FontPicker className="min-w-0 flex-1" /> : null}
          {swapTarget ? <TabSwapButton target={swapTarget} onSwap={setTab} /> : null}
        </div>

        {showFont ? (
          <div className="theme-feedback-enter flex flex-col gap-3">
            <TypeSliderRow
              label={t("Text size")}
              min={Math.round(TEXT_SIZE_RANGE[0] * 100)}
              max={Math.round(TEXT_SIZE_RANGE[1] * 100)}
              step={5}
              value={Math.round(effectiveTextSize * 100)}
              tick={DEFAULT_TEXT_SIZE * 100}
              display={`${Math.round(effectiveTextSize * 100)}%`}
              onChange={(value) => setTextSize(value / 100)}
            />
            <TypeSliderRow
              label={t("Letter spacing")}
              min={Math.round(READER_TRACKING_RANGE[0] * 100)}
              max={Math.round(READER_TRACKING_RANGE[1] * 100)}
              step={1}
              value={Math.round(effectiveLetterSpacing * 100)}
              tick={
                (fontPreference === "lexend"
                  ? DEFAULT_LETTER_SPACING_LEXEND
                  : DEFAULT_LETTER_SPACING_STANDARD) * 100
              }
              display={signedEm(effectiveLetterSpacing)}
              onChange={(value) => setLetterSpacing(value / 100)}
            />
            <TypeSliderRow
              label={t("Line height")}
              min={Math.round(READER_LEADING_RANGE[0] * 100)}
              max={Math.round(READER_LEADING_RANGE[1] * 100)}
              step={5}
              value={Math.round(effectiveLineHeight * 100)}
              tick={DEFAULT_LINE_HEIGHT * 100}
              display={String(Number(effectiveLineHeight.toFixed(2)))}
              onChange={(value) => setLineHeight(value / 100)}
            />
          </div>
        ) : null}

        {showFont ? (
          <div className="flex items-center">
            <button
              type="button"
              onClick={() => {
                setTextSize(null);
                setLetterSpacing(null);
                setLineHeight(null);
              }}
              className="theme-focus-ring inline-flex h-9 items-center gap-2 rounded-lg px-3 text-xs font-medium text-dose-text-muted transition-colors hover:bg-dose-surface-muted hover:text-dose-text-secondary [@media(pointer:coarse)]:h-11"
            >
              <Icon icon="fluent:arrow-reset-24-filled" size={14} />
              <span>{t("Reset to defaults")}</span>
            </button>
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {showVisualStyle || swapTarget ? (
        <div className="flex items-center gap-1">
          {showVisualStyle ? <StylePicker className="min-w-0 flex-1" /> : null}
          {swapTarget ? <TabSwapButton target={swapTarget} onSwap={setTab} /> : null}
        </div>
      ) : null}

      {showColorScheme ? (
        <SchemeToggle />
      ) : null}

      {showSurface ? (
        <ColorAxisGroup
          axisName={surfaceLabel}
          dotColor={axisDot(surfaceSwatch, effectiveSurfaceHue, surfaceChroma)}
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
        </ColorAxisGroup>
      ) : null}

      {showAccent ? (
        <ColorAxisGroup
          axisName={t("Accent")}
          dotColor={axisDot(accentSwatch, effectiveAccentHue, accentChroma)}
          degrees={effectiveAccentHue}
          percent={Math.round(accentChroma * 100)}
        >
          <ColorAxisSliders
            name={t("Accent")}
            swatch={accentSwatch}
            degrees={effectiveAccentHue}
            level={accentChroma}
            tickDegrees={defaultColors.accentHue}
            tickLevel={defaultColors.accentLevel}
            onHue={setAccentHue}
            onChroma={setAccentChroma}
          />
        </ColorAxisGroup>
      ) : null}

      {showColorAxes || footerAction ? (
        <div className="flex items-center gap-2">
          {showColorAxes ? (
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
              <span>{t("Reset colors")}</span>
            </button>
          ) : null}
          {footerAction ? <div className="ml-auto">{footerAction}</div> : null}
        </div>
      ) : null}
    </div>
  );
}

function TabSwapButton({
  target,
  onSwap,
}: {
  target: AppearanceTab;
  onSwap: (tab: AppearanceTab) => void;
}) {
  const t = useT();
  const swapLabel =
    target === "colour" ? t("Show colour controls") : t("Show font controls");
  return (
    <button
      type="button"
      aria-label={swapLabel}
      title={swapLabel}
      onClick={() => onSwap(target)}
      className="theme-focus-ring inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-dose-text-muted transition-colors hover:bg-dose-surface-muted hover:text-dose-text-primary [@media(pointer:coarse)]:h-11"
    >
      <Icon icon={target === "colour" ? "lucide:paintbrush" : "lucide:type"} size={18} />
    </button>
  );
}

function TypeSliderRow({
  label,
  min,
  max,
  step,
  value,
  tick,
  display,
  onChange,
}: {
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  tick: number;
  display: string;
  onChange: (value: number) => void;
}) {
  const directTouch = useDirectTypeRange(min, max, step, onChange);
  const percent = ((value - min) / (max - min)) * 100;
  const tickFraction = Math.min(1, Math.max(0, (tick - min) / (max - min)));
  return (
    <div data-appearance-type="" className="flex flex-col gap-1">
      <div className="flex items-center justify-between gap-3 px-1">
        <span className="text-[0.6875rem] font-medium uppercase tracking-[0.08em] text-dose-text-muted">
          {label}
        </span>
        <span className="text-[0.6875rem] font-medium tabular-nums text-dose-text-secondary">
          {display}
        </span>
      </div>
      <div className="px-1">
        <div
          className="theme-chroma-track"
          style={
            {
              "--dw-type-fill": `${percent}%`,
            } as CSSProperties
          }
        >
          <span
            aria-hidden="true"
            className="theme-chroma-tick"
            style={{ "--theme-chroma-tick": tickFraction } as CSSProperties}
          />
          <input
            type="range"
            className="theme-chroma-slider"
            min={min}
            max={max}
            step={step}
            value={value}
            aria-label={label}
            aria-valuetext={display}
            title={label}
            onChange={(event) => onChange(Number(event.currentTarget.value))}
            {...directTouch}
          />
        </div>
      </div>
    </div>
  );
}

function useDirectTypeRange(
  min: number,
  max: number,
  step: number,
  onChange: (value: number) => void,
) {
  const activePointerRef = useRef<number | null>(null);

  const updateFromPointer = (event: ReactPointerEvent<HTMLInputElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    if (bounds.width <= 0) return;

    const position = Math.min(
      1,
      Math.max(0, (event.clientX - bounds.left) / bounds.width),
    );
    const raw = min + position * (max - min);
    const quantized = Math.round((raw - min) / step) * step + min;
    onChange(Number(quantized.toFixed(2)));
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

function ColorAxisGroup({
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
  const [isExpanded, setIsExpanded] = useState(false);
  const contentId = useId();
  return (
    <div role="group" aria-label={axisName} className="flex flex-col gap-2.5">
      <div className="flex items-center gap-2.5 px-1">
        <span
          aria-hidden="true"
          className="h-3.5 w-3.5 shrink-0 rounded-full ring-1 ring-inset ring-dose-ring"
          style={{ backgroundColor: dotColor }}
        />
        <span className="text-[0.8125rem] font-semibold">{axisName}</span>
        <span className="ml-auto tabular-nums text-[0.6875rem] font-medium text-dose-text-muted">
          {degrees}° · {percent}%
        </span>
        <ExpandButton
          variant="inline"
          className="md:hidden"
          isExpanded={isExpanded}
          onToggle={() => setIsExpanded((expanded) => !expanded)}
          ariaLabel={axisName}
          ariaControls={contentId}
        />
      </div>
      <div
        id={contentId}
        className={`${isExpanded ? "flex theme-feedback-enter" : "hidden"} flex-col gap-2.5 md:flex`}
      >
        {children}
      </div>
    </div>
  );
}
