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

/**
 * Which way the panel is currently turned. Colour first: the look controls are what a
 * reader reaches for most, so the panel opens on them and the reading-type controls sit
 * one swap away. A publication that offers no colour axis at all opens on Font instead,
 * because an empty opening tab is worse than the wrong one.
 */
type AppearanceTab = "font" | "colour";

/**
 * An em value with its direction signed: `-0.01 em` tightens, `+0.03 em` loosens, and
 * zero stays unsigned. Spacing direction is the one thing a bare number hides, and it
 * is the one thing a reader tuning letterfit needs to see.
 */
function signedEm(value: number): string {
  return `${value > 0 ? "+" : ""}${Number(value.toFixed(2))} em`;
}

/**
 * Which rows this instance offers. Passed in rather than read here: the visibility
 * questions are publication and role policy, resolved once in `AppearanceControls`, and
 * keeping them as props is what lets a story or a test show a locked publication's
 * appearance without standing up a flavor config or a session.
 */
export type AppearancePanelRows = {
  /**
   * The Vivid/Clinical look picker. Absent where the publication's identity is one
   * style (the provider's setter is a no-op under that lock).
   */
  showVisualStyle: boolean;
  /** Dark/Light page scheme. */
  showColorScheme: boolean;
  /** The surface colour pair: hue and saturation. */
  showSurface: boolean;
  showAccent: boolean;
  /** The face picker and the reading-type sliders. Absent where the publication locks the axis. */
  showFont: boolean;
};

/**
 * The two halves of the reader's appearance menu: a Colour tab that opens on the look
 * picker and mode row, with Background and Accent collapsed on mobile, open on desktop,
 * and "Reset colors" beside the dev-only Theme Lab entry, then a Font tab behind one swap. One icon
 * swaps between them — the type glyph on the colour tab, the paintbrush on the font
 * tab — rendered as a bare control beside the tab's first row, with no card of its own.
 *
 * Everything is read from and written to `ThemeContext`; this component holds no
 * appearance state of its own beyond the tab and mobile disclosures. The range inputs write the
 * context per input tick — that is what keeps them controlled and the thumb, readout,
 * and rail gradients live — and per-tick writes are safe because the provider
 * rAF-throttles the document paint and debounces persistence: nothing here needs its
 * own throttle.
 *
 * The Theme Lab drawer keeps the fuller, always-open `AppearanceAxes` instead: it is an
 * authoring surface and still offers the Fun/Pro style axis and the System scheme
 * option that this reader panel leaves out.
 */
export function AppearancePanel({
  showVisualStyle,
  showColorScheme,
  showSurface,
  showAccent,
  showFont,
  surfaceLabel = "Background",
  footerAction,
}: AppearancePanelRows & {
  /** Reader-facing surface-axis name: "Background" for readers, "Surface" for authors. */
  surfaceLabel?: string;
  /**
   * A caller-owned action that shares the colour tab's footer row with Reset — the
   * cog's dev-only Theme Lab entry. Rendered right-aligned so the two never claim a
   * row each.
   */
  footerAction?: ReactNode;
}) {
  const t = useT();
  // Same reachability test `colourTabReachable` applies below, inlined because the
  // initial tab is resolved before those derivations run: open on Colour, and fall back
  // to Font only where this publication offers no colour axis to open onto.
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

  // Null is "never chose": resolve the current appearance combination's default hue.
  const defaultColors = getDefaultAppearanceColors(visualStyle, colorScheme);
  const effectiveSurfaceHue = surfaceHue ?? defaultColors.surfaceHue;
  const effectiveAccentHue = accentHue ?? defaultColors.accentHue;
  // The reading-type sliders park on the site defaults while the reader never saved a
  // value — the same resolve-the-effective-value rule the colour rails follow.
  const effectiveTextSize = textSize ?? DEFAULT_TEXT_SIZE;
  // Tracking's resting value follows the face: Lexend's letterfit is the default face's
  // whole point, so it rests at zero; the other faces carry the authored negative ramp.
  const effectiveLetterSpacing =
    letterSpacing ?? (fontPreference === "lexend" ? DEFAULT_LETTER_SPACING_LEXEND : DEFAULT_LETTER_SPACING_STANDARD);
  const effectiveLineHeight = lineHeight ?? DEFAULT_LINE_HEIGHT;

  // The rails must show the palette the reader is actually wearing, per axis — the same
  // fixed-legibility anchors AppearanceAxes paints (see that file for the reasoning).
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
            {/* The fractional axes run on integer slider domains — a value scaled by
                100 (tracking, leading) — because range inputs snap values to
                `min + n * step`, and a fractional step's float error parks a thumb off
                its default. The bounds are rounded for the same reason (2.2 * 100 is
                220.00000000000003), the read-out carries the unit, and `aria-valuetext`
                announces it. */}
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

        {/* The reset is a permanent fixture of the tab, not a reward for having tuned
            something: a reader scanning for the way back should always find it, and
            pressing it on an untouched panel is a harmless no-op. It restores the three
            reading-type sliders and never touches the colour axes — or the face choice,
            which the picker itself owns. */}
        {showFont ? (
          <div className="flex items-center">
            <button
              type="button"
              onClick={() => {
                // Null is the setters' "back to the site default": the keys are
                // removed and every slider axis disengages. The face stays as chosen.
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
      {/* First row: the look picker with the swap beside it, on the font tab's exact
          geometry (dropdown flex-1, bare swap control). Mode follows beneath. */}
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

      {/* The reset is a permanent fixture of the tab, on the font tab's terms: a reader
          scanning for the way back should always find it, and pressing it on an
          untouched palette is a harmless no-op. It restores only Background and
          Accent. */}
      {showColorAxes || footerAction ? (
        <div className="flex items-center gap-2">
          {showColorAxes ? (
            <button
              type="button"
              onClick={() => {
                // Null is the setters' "back to the site default": the storage
                // keys are removed, and every color axis returns to the authored look.
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

/**
 * The one control that turns the panel between its two halves. A bare icon beside the
 * tab's first row — deliberately not a card, not a segmented pair: the sketch's
 * correction removes the box that used to sit behind it. The glyph names the tab it
 * opens (paintbrush for colour, type for font), so the same control reads as a
 * destination, not a state.
 */
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

/**
 * One reading-type slider: its uppercase name and live value over a filled track. The
 * fill is data, not decoration — the track reads as a meter of where the reader's value
 * sits between the slider's domain ends, wearing the reader's accent (the scoped
 * `[data-appearance-type]` rule beside the chroma tracks), on the same "the rail shows
 * what the thumb means" terms as the colour rails. `tick` marks the axis's resting
 * default in the slider's own units — where Reset returns — mirroring the authored-
 * position mark the colour rails carry; on the tracking axis it moves with the face,
 * exactly as the colour ticks move with the style/scheme variant.
 */
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
  /** The effective value the thumb parks on: the reader's saved number or the site default. */
  value: number;
  /** The resting default in the slider's own (scaled) units. */
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
        {/* The live value is the state the reader is setting; it reads brighter than
            its static label for the same reason the rails' readouts do. */}
        <span className="text-[0.6875rem] font-medium tabular-nums text-dose-text-secondary">
          {display}
        </span>
      </div>
      <div className="px-1">
        <div
          className="theme-chroma-track"
          style={
            {
              // The fill is a meter, so it wears the reader's accent (CSS owns the
              // gradient — see the scoped rule beside the chroma tracks); this custom
              // property only carries where the fill ends. At accent saturation 0 the
              // accent token greys out and the fill follows honestly.
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

/**
 * The colour sliders' direct-touch contract, generalized past the hue rail's integer
 * domain: coarse pointers get first-contact positioning, pointer capture, and one
 * continuous drag, quantized to the slider's own step; mouse input stays native.
 */
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

/**
 * One colour axis with a compact mobile disclosure. Desktop always shows the sliders,
 * independently of the mobile expansion state.
 */
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
