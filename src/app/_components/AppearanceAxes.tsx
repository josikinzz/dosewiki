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

/**
 * The rails are *legends*, not swatches: they render at a fixed, legible
 * display lightness and a vivid chroma regardless of how dark or muted the
 * theme itself currently is. A dark surface at 14% saturation paints an
 * almost-black canvas — turning the rail that colour makes the control
 * invisible, and the reader is choosing a *direction* (which hue, how much
 * saturation), not previewing exact pixels. Only the hue is taken from the
 * theme, so the rails still point at the palette the reader is wearing.
 */
const RAIL_LIGHTNESS = 0.72;
const RAIL_CHROMA = 0.21;

/**
 * The saturation track's gradient: grey at the left sweeping to a vivid stop
 * at the right, under the reader's current hue rotation, at the fixed rail
 * lightness. The sweep shows what the thumb's positions *mean* — none to
 * maximum saturation — not the literal painted colour at each level.
 */
function trackGradient(swatch: string, hue: number): string {
  const stops = [0, 0.25, 0.5, 0.75, 1].map(
    // `h` is a <number> inside calc(): the shift must be a bare number too.
    (t) =>
      `oklch(from ${swatch} ${RAIL_LIGHTNESS} ${(RAIL_CHROMA * t).toFixed(4)} calc(h + ${hue}))`,
  );
  return `linear-gradient(90deg, ${stops.join(", ")})`;
}

/**
 * The hue track's gradient: the axis's base hue swept once around the hue
 * circle at the fixed rail lightness and chroma. Seven stops, 60° apart, with
 * 360° repeating 0° so the rail's right edge meets its left: the axis is
 * periodic and the rail should look it.
 */
function hueTrackGradient(swatch: string): string {
  const stops = [0, 60, 120, 180, 240, 300, 360].map(
    (degrees) =>
      `oklch(from ${swatch} ${RAIL_LIGHTNESS} ${RAIL_CHROMA} calc(h + ${degrees}))`,
  );
  return `linear-gradient(90deg, ${stops.join(", ")})`;
}

/**
 * Native range inputs are inconsistent on touch screens: some browsers use
 * the first contact only to focus or reposition the thumb, then require a
 * second gesture to drag it. Coarse pointers get direct manipulation instead:
 * the first contact sets the value, captures that pointer, and every move
 * continues the same drag. Mouse input stays entirely native.
 *
 * Exported because the reader panel's reading-type sliders run on the same
 * contract — one drag gesture, mouse input untouched — under different domains.
 */
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

/**
 * One axis's hue slider — the row above its saturation slider in the cog panel.
 *
 * `degrees` is the reader's effective rotation — their saved integer, or the
 * site default while they never moved this slider. `tick` is that default:
 * the exact rotation Reset restores for the active style/scheme variant, so
 * the mark moves when the reader switches Fun/Pro or light/dark.
 *
 */
function HueSlider({
  label,
  swatch,
  degrees,
  tick,
  onChange,
}: {
  label: string;
  /** The axis's base colour at the current saturation level; the rail rotates it. */
  swatch: string;
  degrees: number;
  /** The active variant's default rotation in degrees — where Reset returns. */
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

/**
 * One axis's saturation slider.
 *
 * `level` is the reader's effective level — their saved decimal, or the site
 * default while they never moved this slider — so the thumb parks where the
 * page is actually painted. `tick` is that default: the exact level Reset
 * restores for the active style/scheme variant, so the mark moves when the
 * reader switches Fun/Pro or light/dark.
 *
 */
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
  /** The reader's effective hue rotation; the rail previews levels under it. */
  hue: number;
  /** The active variant's default level in 0..1 — where Reset returns. */
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

/**
 * A small legend dot for a collapsed axis, drawn on the same fixed-legibility
 * terms as the sliders' rails: the reader's hue and saturation level over the
 * axis's base swatch. Saturation 0 paints a neutral grey — the honest signal
 * that the palette is currently unmuted.
 */
export function axisDot(swatch: string, hue: number, level: number): string {
  return `oklch(from ${swatch} ${RAIL_LIGHTNESS} ${(RAIL_CHROMA * level).toFixed(4)} calc(h + ${hue}))`;
}

/**
 * A collapsed colour axis. The summary row — swatch dot, plain-language name,
 * and the live (degrees · percent) coordinate — is a button carrying
 * `aria-expanded` + `aria-controls`; tapping it reveals the Hue/Saturation
 * slider pair in place. Collapsed by default so the panel opens on the three
 * quick toggles and the sliders — the choice a reader reaches for least — stay
 * one tap away instead of four always-on rails. The expanded children sit
 * under the `role="group"` name the axis always carried, so its accessible
 * grouping is unchanged.
 */
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
/**
 * The Hue/Saturation slider pair for one colour axis, shared verbatim by the
 * reader's collapsed disclosure and the Theme Lab's always-open group, so the
 * two surfaces can never offer different tuning controls.
 */
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

/**
 * Which rows this instance offers. Passed in rather than read here: the visibility
 * questions are publication and role policy, resolved once in `AppearanceControls`, and
 * keeping them as props is what lets a story or a test show a locked publication's
 * appearance without standing up a flavor config or a session.
 */
export type AppearanceAxesRows = {
  /** Fun/Pro. Absent — never inert — where the publication's identity *is* one style. */
  showVisualStyle: boolean;
  /** Dark/Light page scheme. */
  showColorScheme: boolean;
  /** The surface colour pair: hue and saturation. */
  showSurface: boolean;
  showAccent: boolean;
  /** Dyslexic-friendly type (Lexend). Absent where the publication locks the axis. */
  showFont: boolean;
};

/**
 * The site's appearance axes as controls: visual style, colour scheme, and a
 * hue + saturation slider pair for each colour axis. There are no discrete
 * colourways anymore — the base Orchid surface and Default accent palettes are
 * the only authored ones, and every other look is a (hue, saturation)
 * coordinate over them; grey is simply saturation 0.
 *
 * Two places offer them — the header's settings button and the Theme Lab drawer — and this is
 * the single component both render, so the two can never disagree about what a reader
 * may choose or what a rail previews. Everything is read from and written to
 * `ThemeContext`; this component holds no appearance state of its own. The
 * range inputs write the context per input tick — that is what keeps them
 * controlled and the thumb, readout, and rail gradients live — and per-tick
 * writes are safe because the provider rAF-throttles the document paint and
 * debounces persistence: nothing here needs its own throttle.
 *
 * Both colour axes work on both visual styles. The accent pair rotates and
 * re-saturates the Pro `--ei-*` accent ramp on the same terms as the Fun
 * palette; the surface pair drives the additive Pro surface blocks — the
 * authored charcoal sits at saturation 0, and the level adds chroma to it —
 * so no slider is ever rendered disabled here.
 */
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
  /** Collapse the colour axes behind summary rows (the reader's compact panel). */
  discloseColorGroups?: boolean;
  /** Reader-facing surface-axis name: "Background" for readers, "Surface" for authors. */
  surfaceLabel?: string;
  /**
   * A caller-owned action that shares the footer row with Reset — the cog's dev-only
   * Theme Lab entry. Rendered right-aligned so the two never claim a row each.
   */
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

  // Null is "never chose": resolve the current appearance combination's default hue.
  const defaultColors = getDefaultAppearanceColors(visualStyle, colorScheme);
  const effectiveSurfaceHue = surfaceHue ?? defaultColors.surfaceHue;
  const effectiveAccentHue = accentHue ?? defaultColors.accentHue;

  // The rails must show the palette the reader is actually wearing, per axis:
  // on Pro the surface rail anchors on the authored charcoal canvas seed for
  // the current scheme — the same literal the additive Pro surface block
  // wraps — so the rail and the CSS can never disagree about what a
  // coordinate renders as.
  const surfaceSwatch =
    visualStyle === "pro"
      ? BASE_SURFACE_PRO_SEEDS[colorScheme]["--ei-paper"]!
      : BASE_SURFACE_TINT[colorScheme];
  // The accent rail, on the same rule: on Pro it anchors on the ramp's
  // representative seed for the current scheme — the
  // same pick the emitted gain denominator is computed from (see
  // proAccentRepresentativeSeed), so the rail and the CSS can never disagree
  // about what a coordinate renders as.
  const proAccentSeed =
    visualStyle === "pro"
      ? proAccentRepresentativeSeed(BASE_ACCENT_PRO_SEEDS, colorScheme)
      : null;
  const accentSwatch = proAccentSeed ?? BASE_ACCENT_SWATCH;

  // Dark/Light leads: it is the choice a reader makes first and changes most, and it
  // reads without any category label. Style and type follow; colors last, as named,
  // independently resettable axes.
  const showColorAxes = showSurface || showAccent;
  // Reset belongs to the colour axes, so it needs both a saved coordinate and an axis
  // on screen to undo.
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

      {/* Reset is gone until there is something to reset: an untouched panel is a row
          shorter, and the action cannot promise a change it would not make. It shares
          this row with the dev-only Theme Lab entry so neither costs its own. */}
      {showReset || footerAction ? (
        <div className="flex items-center gap-2">
          {showReset ? (
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
              // Quiet text, not a second pill: the panel already spends its button
              // weight on the segmented axes, and this is the one action a reader
              // reaches for only after a tuning mistake.
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
