"use client";

import { useId, type CSSProperties, type ReactNode } from "react";

import { useTheme } from "@/context/ThemeContext";
import { cn } from "@/lib/utils";
import { BASE_ACCENT_ID, BASE_ACCENT_PRO_SEEDS, BASE_ACCENT_SWATCH } from "@/theme/accents";
import {
  CHROMA_LEVELS,
  DEFAULT_ACCENT_HUE,
  DEFAULT_SURFACE_HUE,
} from "@/theme/appearanceChroma";
import { authoredLevel, proAccentRepresentativeSeed } from "@/theme/chromaMath";
import { BASE_SURFACE_ID, BASE_SURFACE_TINT } from "@/theme/surfaces";
import { ThemeToggle } from "./ThemeToggle";
import { VisualStyleToggle } from "./VisualStyleToggle";

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
    (t) => `oklch(from ${swatch} ${RAIL_LIGHTNESS} ${(RAIL_CHROMA * t).toFixed(4)} calc(h + ${hue}))`,
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
    (degrees) => `oklch(from ${swatch} ${RAIL_LIGHTNESS} ${RAIL_CHROMA} calc(h + ${degrees}))`,
  );
  return `linear-gradient(90deg, ${stops.join(", ")})`;
}

/**
 * One axis's hue slider — the row above its saturation slider in the cog panel.
 *
 * `degrees` is the reader's effective rotation — their saved integer, or the
 * site default 0 while they never moved this slider. The tick sits at 0°, the
 * left edge: that is where the authored palette lives, and unlike the
 * saturation axis it is the same place for every reader.
 */
function HueSlider({
  label,
  swatch,
  degrees,
  disabled,
  disabledReason,
  onChange,
}: {
  label: string;
  /** The axis's base colour at the current saturation level; the rail rotates it. */
  swatch: string;
  degrees: number;
  disabled: boolean;
  disabledReason?: string;
  onChange: (degrees: number) => void;
}) {
  return (
    <div
      data-appearance-hue=""
      className={cn(
        "flex items-center gap-2 px-1 transition-opacity duration-200 motion-reduce:transition-none",
        disabled && "opacity-40",
      )}
    >
      <div
        className="theme-chroma-track"
        style={{ "--theme-chroma-track-gradient": hueTrackGradient(swatch) } as CSSProperties}
      >
        <span
          aria-hidden="true"
          className="theme-chroma-tick"
          style={{ "--theme-chroma-tick": 0 } as CSSProperties}
        />
        <input
          type="range"
          className="theme-chroma-slider"
          min={0}
          max={359}
          step={1}
          value={degrees}
          disabled={disabled}
          aria-label={label}
          title={disabled && disabledReason ? `${label} · ${disabledReason}` : label}
          onChange={(event) => onChange(Number(event.currentTarget.value))}
        />
      </div>
      <span className="w-8 text-right text-[0.625rem] font-medium tabular-nums text-dose-text-muted">
        {degrees}°
      </span>
    </div>
  );
}

/**
 * One axis's saturation slider.
 *
 * `level` is the reader's effective level — their saved decimal, or the site
 * default while they never moved this slider — so the thumb parks where the
 * page is actually painted. The tick marks the base palette's authored level.
 * On Pro the surface pair is disabled (Pro keeps its one restrained charcoal
 * family); the accent pair works on both visual styles.
 */
function ChromaSlider({
  label,
  swatch,
  hue,
  authored,
  level,
  disabled,
  disabledReason,
  onChange,
}: {
  label: string;
  swatch: string;
  /** The reader's effective hue rotation; the rail previews levels under it. */
  hue: number;
  /** The base palette's authored level, or null when it has none to mark. */
  authored: number | null;
  level: number;
  disabled: boolean;
  disabledReason?: string;
  onChange: (level: number) => void;
}) {
  const percent = Math.round(level * 100);
  return (
    <div
      data-appearance-chroma=""
      className={cn(
        "flex items-center gap-2 px-1 transition-opacity duration-200 motion-reduce:transition-none",
        disabled && "opacity-40",
      )}
    >
      <div
        className="theme-chroma-track"
        style={
          { "--theme-chroma-track-gradient": trackGradient(swatch, hue) } as CSSProperties
        }
      >
        {authored !== null ? (
          <span
            aria-hidden="true"
            className="theme-chroma-tick"
            style={{ "--theme-chroma-tick": authored } as CSSProperties}
          />
        ) : null}
        <input
          type="range"
          className="theme-chroma-slider"
          min={0}
          max={100}
          step={1}
          value={percent}
          disabled={disabled}
          aria-label={label}
          title={disabled && disabledReason ? `${label} · ${disabledReason}` : label}
          onChange={(event) => onChange(Number(event.currentTarget.value) / 100)}
        />
      </div>
      <span className="w-8 text-right text-[0.625rem] font-medium tabular-nums text-dose-text-muted">
        {percent}%
      </span>
    </div>
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
  /** Day/Night. */
  showColorScheme: boolean;
  /** The surface colour pair: hue and saturation. */
  showSurface: boolean;
  showAccent: boolean;
};

/**
 * The site's appearance axes as controls: visual style, colour scheme, and a
 * hue + saturation slider pair for each colour axis. There are no discrete
 * colourways anymore — the base Orchid surface and Default accent palettes are
 * the only authored ones, and every other look is a (hue, saturation)
 * coordinate over them; grey is simply saturation 0.
 *
 * Two places offer them — the header/footer cog and the Theme Lab drawer — and this is
 * the single component both render, so the two can never disagree about what a reader
 * may choose or what a rail previews. Everything is read from and written to
 * `ThemeContext`; this component holds no appearance state of its own.
 *
 * Pro keeps its restrained fixed materials, so the Surface pair remains visible
 * for context but is disabled and explicitly marked "Fun only". The accent pair
 * works on both styles: the generated stylesheet rotates and re-saturates the
 * Pro `--ei-*` ramp on the same terms as the Fun palette.
 */
export function AppearanceAxes({
  className,
  showVisualStyle,
  showColorScheme,
  showSurface,
  showAccent,
  endSlot,
}: AppearanceAxesRows & {
  className?: string;
  /**
   * Rendered at the end of the binary-control row — the cog parks its compact
   * Theme Lab entry here. The row renders when it has either a toggle or this.
   */
  endSlot?: ReactNode;
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
  } = useTheme();
  const surfaceAvailabilityId = useId();
  const surfaceDisabled = visualStyle === "pro";

  // Null is "never chose": the site default hue, which is the authored palette itself.
  const effectiveSurfaceHue = surfaceHue ?? DEFAULT_SURFACE_HUE;
  const effectiveAccentHue = accentHue ?? DEFAULT_ACCENT_HUE;

  const surfaceSwatch = BASE_SURFACE_TINT[colorScheme];
  // The accent rails must show the palette the reader is actually wearing: on
  // Pro that is the ramp's representative seed for the current scheme — the
  // same pick the emitted gain denominator is computed from (see
  // proAccentRepresentativeSeed), so the rail and the CSS can never disagree
  // about what a coordinate renders as.
  const proAccentSeed =
    visualStyle === "pro"
      ? proAccentRepresentativeSeed(BASE_ACCENT_PRO_SEEDS, colorScheme)
      : null;
  const accentSwatch = proAccentSeed ?? BASE_ACCENT_SWATCH;

  // The first row holds the two compact binary controls and the cog's end slot.
  const hasControlRow = showVisualStyle || showColorScheme || endSlot != null;
  return (
    <div className={cn("flex flex-col gap-3", className)}>
      {hasControlRow ? (
        <div className="flex items-center gap-2">
          {showVisualStyle ? <VisualStyleToggle /> : null}
          {showColorScheme ? <ThemeToggle /> : null}
          {endSlot != null ? <div className="ml-auto">{endSlot}</div> : null}
        </div>
      ) : null}

      {showSurface ? (
        <div
          role="group"
          aria-label="Surface"
          aria-describedby={surfaceDisabled ? surfaceAvailabilityId : undefined}
          className="flex flex-col gap-1.5"
        >
          <div className="flex items-center justify-between gap-3 px-1">
            <span className="text-[0.6875rem] font-semibold uppercase tracking-[0.12em] text-dose-text-muted">
              Surface
            </span>
            {surfaceDisabled ? (
              <span
                id={surfaceAvailabilityId}
                className="text-[0.625rem] font-medium uppercase tracking-[0.1em] text-dose-text-muted"
              >
                Fun only
              </span>
            ) : null}
          </div>
          <HueSlider
            label="Surface hue"
            swatch={surfaceSwatch}
            degrees={effectiveSurfaceHue}
            disabled={surfaceDisabled}
            disabledReason="switch to Fun to change surfaces"
            onChange={setSurfaceHue}
          />
          <ChromaSlider
            label="Surface saturation"
            swatch={surfaceSwatch}
            hue={effectiveSurfaceHue}
            authored={CHROMA_LEVELS.surfaces[BASE_SURFACE_ID]?.[colorScheme] ?? null}
            level={surfaceChroma}
            disabled={surfaceDisabled}
            disabledReason="switch to Fun to change surfaces"
            onChange={setSurfaceChroma}
          />
        </div>
      ) : null}

      {showAccent ? (
        <div role="group" aria-label="Accent" className="flex flex-col gap-1.5">
          <span className="px-1 text-[0.6875rem] font-semibold uppercase tracking-[0.12em] text-dose-text-muted">
            Accent
          </span>
          <HueSlider
            label="Accent hue"
            swatch={accentSwatch}
            degrees={effectiveAccentHue}
            disabled={false}
            onChange={setAccentHue}
          />
          <ChromaSlider
            label="Accent saturation"
            swatch={accentSwatch}
            hue={effectiveAccentHue}
            authored={
              visualStyle === "pro"
                ? proAccentSeed !== null
                  ? authoredLevel(proAccentSeed)
                  : null
                : (CHROMA_LEVELS.accents[BASE_ACCENT_ID] ?? null)
            }
            level={accentChroma}
            disabled={false}
            onChange={setAccentChroma}
          />
        </div>
      ) : null}
    </div>
  );
}
