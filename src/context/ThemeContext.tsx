"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { SITE_FLAVOR_CONFIG } from "@/config/siteFlavor";
import {
  ensureColorSchemeStylesheet,
  ensureVisualStyleStylesheet,
  whenStylesheetLoaded,
} from "@/theme/appearanceSheets";
import {
  applyChromaToDocument,
  getDefaultAppearanceColors,
  parseChromaLevel,
  parseHueDegrees,
} from "@/theme/appearanceChroma";
import { LEGACY_ACCENT_TO_HUE } from "@/theme/accents";
import { LEGACY_SURFACE_TO_HUE } from "@/theme/surfaces";
import {
  ACCENT_CHROMA_STORAGE_KEY,
  ACCENT_HUE_STORAGE_KEY,
  ACCENT_STORAGE_KEY,
  COLOR_SCHEME_STORAGE_KEY,
  FONT_STORAGE_KEY,
  LETTER_SPACING_STORAGE_KEY,
  LINE_HEIGHT_STORAGE_KEY,
  SURFACE_CHROMA_STORAGE_KEY,
  SURFACE_HUE_STORAGE_KEY,
  SURFACE_STORAGE_KEY,
  TEXT_SIZE_STORAGE_KEY,
  THEME_META_ID,
  VISUAL_STYLE_STORAGE_KEY,
  getAppearanceMetaColor,
  isColorScheme,
  isColorSchemePreference,
  isFontPreference,
  isVisualStyle,
  type Appearance,
  type ColorSchemePreference,
  type ColorScheme,
  type FontPreference,
  type VisualStyle,
} from "@/theme";
import {
  applyReaderTypeToDocument,
  clampAxisNumber,
  parseAxisNumber,
  DEFAULT_LETTER_SPACING_LEXEND,
  DEFAULT_LETTER_SPACING_STANDARD,
  DEFAULT_LINE_HEIGHT,
  DEFAULT_TEXT_SIZE,
  READER_LEADING_RANGE,
  READER_TRACKING_RANGE,
  TEXT_SIZE_RANGE,
} from "@/theme/appearanceTypography";

export type {
  Appearance,
  ColorScheme,
  ColorSchemePreference,
  FontPreference,
  VisualStyle,
} from "@/theme";
export {
  ACCENT_CHROMA_STORAGE_KEY,
  ACCENT_HUE_STORAGE_KEY,
  // The retired colourway keys: still exported because the migration below is
  // observable — tests and the bootstrap name them — not because anything may
  // write them again.
  ACCENT_STORAGE_KEY,
  COLOR_SCHEME_STORAGE_KEY,
  FONT_STORAGE_KEY,
  LETTER_SPACING_STORAGE_KEY,
  LINE_HEIGHT_STORAGE_KEY,
  TEXT_SIZE_STORAGE_KEY,
  THEME_META_ID,
  SURFACE_CHROMA_STORAGE_KEY,
  SURFACE_HUE_STORAGE_KEY,
  SURFACE_STORAGE_KEY,
  VISUAL_STYLE_STORAGE_KEY,
} from "@/theme";

/**
 * The reader's appearance preferences, one owner. Every appearance control consumes this
 * context; nothing else may write `data-theme`, `data-visual-style`, `color-scheme`, the
 * `--dw-*` appearance properties or the `theme-color` meta value, because two writers
 * cannot agree about what the reader chose.
 */
type ThemeContextValue = {
  /** The resolved scheme the document is painted with — never "system". */
  colorScheme: ColorScheme;
  /**
   * What the reader chose: an explicit scheme, or "system" — follow the OS
   * `prefers-color-scheme` live. This is what the Mode control renders and
   * what the storage key holds; `colorScheme` is its resolution.
   */
  colorSchemePreference: ColorSchemePreference;
  visualStyle: VisualStyle;
  setColorScheme: (value: ColorScheme) => void;
  setColorSchemePreference: (value: ColorSchemePreference) => void;
  setVisualStyle: (value: VisualStyle) => void;
  toggleColorScheme: () => void;
  toggleVisualStyle: () => void;
  /**
   * The effective saturation levels — always a decimal in 0..1: the reader's
   * saved level, or the current appearance combination's default while they
   * have never moved that slider. The setters take null to mean "back to the
   * default level": the storage key is removed — a default is never written —
   * and the exposed level returns to the current combination's default. Each
   * level rides its parent axis's lock.
   */
  surfaceChroma: number;
  accentChroma: number;
  setSurfaceChroma: (value: number | null) => void;
  setAccentChroma: (value: number | null) => void;
  /**
   * The hue axes: the reader's saved rotation in integer degrees 0..359, or
   * null while they never moved that slider — null means the current
   * visual-style and colour-scheme combination's default. Consumers resolve
   * the effective hue. The setters take null on the chroma setters' terms: key
   * removed, back to the default.
   */
  surfaceHue: number | null;
  accentHue: number | null;
  setSurfaceHue: (value: number | null) => void;
  setAccentHue: (value: number | null) => void;
  /**
   * Whether any colour axis is currently carrying a saved value rather than the
   * appearance combination's default. Derived here because the hues are exposed
   * as saved but the levels are exposed resolved, so a consumer cannot tell the
   * two apart: it is what lets the reader's panel offer a reset only once there
   * is something to reset.
   */
  hasCustomColors: boolean;
  /**
   * The type axis: the face the two `--font-family-*` tokens resolve to. "lexend" is the
   * site default every dose.wiki reader opens on and is expressed by *removing* the root
   * attribute and the storage key, so a reader on the default face stores nothing; each
   * other face re-seats both tokens via `data-font="<face>"` on the root. An untoggled
   * reader fetches no face beyond the ones every page already paints.
   */
  fontPreference: FontPreference;
  setFontPreference: (value: FontPreference) => void;
  /**
   * The reading-type axes: the reader's *saved* value, or null while they never moved
   * that slider — null is the persistence state, and the site default is the absence of
   * the root write, never a stored number. Text size is a unitless font scale on its
   * slider domain (it multiplies the text tokens, never the layout); letter spacing is
   * em, line height unitless. The setters take null to mean
   * "back to the default": the storage key is removed and the axis disengages. All
   * three ride the font axis's lock: under a lock the setters are no-ops and the keys
   * are never read or written. Paragraph spacing is not an axis: that rhythm is a
   * fixed site value (2x the font size).
   */
  textSize: number | null;
  letterSpacing: number | null;
  lineHeight: number | null;
  setTextSize: (value: number | null) => void;
  setLetterSpacing: (value: number | null) => void;
  setLineHeight: (value: number | null) => void;
  /**
   * Whether the type axis is currently carrying any saved value — the face choice or
   * any of the three reading-type numbers. It is what lets the panel offer "Reset to
   * defaults", on the colour axes' terms.
   */
  hasCustomType: boolean;
  /**
   * Whether this build pins the visual style. Part of the interface because it changes what
   * the setters do: under a lock `setVisualStyle` and `toggleVisualStyle` are no-ops and the
   * style storage key is never touched, so a control bound to them would do nothing. Hide
   * the Fun/Pro control on this rather than re-deriving the policy from the flavor config.
   */
  isVisualStyleLocked: boolean;
  /** Same contract for the accent axes: under a lock the hue and chroma setters are no-ops. */
  isAccentLocked: boolean;
  isSurfaceLocked: boolean;
  /** Same contract for the type axis: under a lock the font setters are no-ops. */
  isFontLocked: boolean;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

/**
 * The colour axes' saved coordinates for ONE appearance combination. Each slot is
 * null while the reader never moved that slider under this combination — the
 * persistence state, not the display one.
 */
type ChromaSlots = {
  surfaceChroma: number | null;
  accentChroma: number | null;
  surfaceHue: number | null;
  accentHue: number | null;
};

const EMPTY_CHROMA_SLOTS: ChromaSlots = {
  surfaceChroma: null,
  accentChroma: null,
  surfaceHue: null,
  accentHue: null,
};

/**
 * The record key for one look: the hue and saturation axes are independent per
 * visual style — tuning Clinical never moves Vivid — while light and dark SHARE
 * a look's coordinates (the Mode toggle changes the palette's lightness world,
 * not its hue direction), so each look owns one set of storage keys and slots.
 */
function chromaSlotsId(visualStyle: VisualStyle): string {
  return visualStyle;
}

type AppearanceGuard<T extends string> = (value: string | null | undefined) => value is T;

/**
 * What the pre-paint bootstrap already resolved for one axis.
 *
 * The document attribute is the first source, not the storage key: the bootstrap has already
 * validated storage and painted the result, so reading the document is how this provider ends
 * up agreeing with the frame the reader is looking at. Storage is consulted only for a
 * document carrying no valid attribute — a nested provider, or a bare test render.
 */
function resolvePaintedAxis<T extends string>(
  datasetKey: "theme" | "visualStyle" | "font",
  storageKey: string,
  isSupported: AppearanceGuard<T>,
): T | null {
  if (typeof document !== "undefined") {
    const painted = document.documentElement.dataset[datasetKey];

    if (isSupported(painted)) {
      return painted;
    }
  }

  if (typeof window === "undefined") {
    return null;
  }

  try {
    const stored = window.localStorage.getItem(storageKey);
    return isSupported(stored) ? stored : null;
  } catch {
    return null;
  }
}

function persistPreference(storageKey: string, value: string) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(storageKey, value);
  } catch {
    // Ignore storage failures and keep the in-memory appearance active.
  }
}

/**
 * How long an axis slider must rest before its value is persisted. A drag
 * emits dozens of state changes per second and every localStorage write is
 * synchronous main-thread IO, so storage hears the settled value — the
 * decision — rather than the path the thumb took to it.
 */
const AXIS_PERSIST_DEBOUNCE_MS = 200;

/**
 * When one document-wide chroma paint costs more than this (~1.5 frames at
 * 60Hz), further paints during the same drag are spaced out instead of issued
 * every frame. Writing the axis properties on `<html>` invalidates the whole
 * generated custom-property graph, so each write forces a full-document style
 * recalculation; on weak hardware a single recalculation can run hundreds of
 * milliseconds, and issuing one per frame freezes the page for the entire
 * drag. Spacing is proportional to the *measured* cost — a device that
 * restyles inside the budget keeps its fully live per-frame preview.
 */
const CHROMA_PAINT_BUDGET_MS = 24;

/**
 * The spacing ceiling. It must stay well above the worst plausible single
 * recalculation: spacing only creates paint-free frames while it exceeds the
 * cost it is spacing out (a ceiling at or below the cost degenerates back to
 * a paint every frame). Even at the ceiling the page repaints ~1×/second
 * mid-drag, and the trailing paint always lands the settled value.
 */
const CHROMA_PAINT_MAX_DELAY_MS = 1000;

/**
 * A saved axis number — a chroma level's decimal or a hue's integer degrees —
 * persists as its string, and null removes the key: a missing key is what "the
 * site default" means to the pre-paint bootstrap, so removal — not writing the
 * default's current value — is what keeps a reader on the default as it
 * evolves.
 */
function persistAxisNumber(storageKey: string, value: number | null) {
  if (typeof window === "undefined") return;
  try {
    if (value === null) window.localStorage.removeItem(storageKey);
    else window.localStorage.setItem(storageKey, String(value));
  } catch {
    // Ignore storage failures and keep the in-memory value active.
  }
}

/**
 * The reader's saved level or hue, or null when they never saved one. Storage,
 * not the painted custom property: the bootstrap paints stored ?? default, so
 * the property alone cannot say whether the reader chose the value it carries —
 * and adopting a painted default as "saved" would persist it, freezing the
 * reader on a default they never picked.
 */
function resolveStoredChroma(storageKey: string): number | null {
  if (typeof window === "undefined") return null;
  try {
    return parseChromaLevel(window.localStorage.getItem(storageKey));
  } catch {
    return null;
  }
}

function resolveStoredHue(storageKey: string): number | null {
  if (typeof window === "undefined") return null;
  try {
    return parseHueDegrees(window.localStorage.getItem(storageKey));
  } catch {
    return null;
  }
}

/**
 * One retired colourway id and its (hue, chroma) coordinates, or null. Raw
 * string in: the legacy keys hold ids from the discrete-swatch era, and an
 * unknown or retired id maps to nothing rather than to a guess.
 */
function resolveLegacyColourway<K extends string>(
  map: Readonly<Record<K, { readonly hue: number; readonly chroma?: 0 }>>,
  storageKey: string,
): { readonly hue: number; readonly chroma?: 0 } | null {
  if (typeof window === "undefined") return null;
  try {
    const stored = window.localStorage.getItem(storageKey);
    if (stored === null) return null;
    // `hasOwnProperty` rather than `Object.hasOwn`, which this project's `lib`
    // target does not carry.
    return Object.prototype.hasOwnProperty.call(map, stored) ? map[stored as K] : null;
  } catch {
    return null;
  }
}

function removeStoredKey(storageKey: string) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(storageKey);
  } catch {
    // A key that cannot be removed is a key that also could not be read later.
  }
}

/** Integer degrees on the hue circle; the slider's own domain. */
function clampHueDegrees(value: number): number {
  return Math.min(Math.max(Math.round(value), 0), 359);
}

/**
 * Increments per flip; only the newest flip's scheduled unlock may remove the
 * attribute, so rapid successive toggles keep the lock held until the last
 * flip's frame has painted.
 */
let transitionLockSequence = 0;

/**
 * Runs a root appearance mutation under `data-appearance-transition-lock`
 * (styles/theme-overrides.css): every `transition` is disabled while the
 * attribute is present, so a whole-document restyle lands as one clean
 * recalculation instead of fanning out into ~300ms of per-frame transition
 * repaints and thousands of transition events. The attribute is removed two
 * animation frames later — the frame *after* the one that painted the new
 * appearance — which keeps the removal's own restyle off the interaction's
 * critical path and guarantees no transition ever observes the flip.
 */
function withTransitionsSuppressed(mutate: () => void) {
  if (typeof document === "undefined" || typeof requestAnimationFrame !== "function") {
    mutate();
    return;
  }

  const root = document.documentElement;
  const sequence = ++transitionLockSequence;
  root.setAttribute("data-appearance-transition-lock", "");
  mutate();
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      if (sequence === transitionLockSequence) {
        root.removeAttribute("data-appearance-transition-lock");
      }
    });
  });
}

/**
 * Increments on every apply; an async flip only lands while it is still the
 * newest one. Without this, toggling pro â†’ fun while the Pro sheet is mid-
 * download would let the stale flip overwrite the newer appearance when the
 * fetch settles.
 */
let applyAppearanceSequence = 0;

function applyAppearanceToDocument({
  colorScheme,
  visualStyle,
}: Pick<Appearance, "colorScheme" | "visualStyle">) {
  if (typeof document === "undefined") {
    return;
  }

  // The Pro and light-mode sheets are static assets attached on demand, not
  // bundled CSS. Ensure the one(s) this appearance needs BEFORE flipping the
  // attributes they key on: flipping first would paint a frame of Pro (or
  // light) markup with no Pro (or light) rules on the reader's first toggle.
  // Both ensure calls are idempotent — for a reader whose sheet was server-
  // rendered or bootstrap-injected, `sheet` is already populated and the flip
  // below stays synchronous.
  const sequence = ++applyAppearanceSequence;
  const pendingSheets = [
    ensureColorSchemeStylesheet(colorScheme),
    ensureVisualStyleStylesheet(visualStyle),
  ].filter((link): link is HTMLLinkElement => link !== null && link.sheet === null);
  if (pendingSheets.length > 0) {
    void Promise.all(pendingSheets.map(whenStylesheetLoaded)).then(() => {
      if (sequence === applyAppearanceSequence) {
        flipAppearanceAttributes({ colorScheme, visualStyle });
      }
    });
    return;
  }

  flipAppearanceAttributes({ colorScheme, visualStyle });
}

function flipAppearanceAttributes({
  colorScheme,
  visualStyle,
}: Pick<Appearance, "colorScheme" | "visualStyle">) {
  if (typeof document === "undefined") {
    return;
  }

  // No-op applies (hydration confirming the bootstrap's paint) skip the lock:
  // pinning it costs two full-document restyles of its own, which is only a
  // price worth paying when an attribute below actually changes.
  const root = document.documentElement;
  if (root.dataset.theme !== colorScheme || root.dataset.visualStyle !== visualStyle) {
    withTransitionsSuppressed(() => {
      root.dataset.theme = colorScheme;
      root.dataset.visualStyle = visualStyle;
    });
  }
  root.style.colorScheme = colorScheme;

  const meta =
    document.getElementById(THEME_META_ID) ??
    document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');

  if (meta instanceof HTMLMetaElement) {
    meta.content = getAppearanceMetaColor({ colorScheme, visualStyle });
  }
}

export function ThemeProvider({
  children,
  initialColorScheme = SITE_FLAVOR_CONFIG.defaultColorScheme,
  initialVisualStyle = SITE_FLAVOR_CONFIG.defaultVisualStyle,
  isVisualStyleLocked = !SITE_FLAVOR_CONFIG.showVisualStyleToggle,
  isAccentLocked = !SITE_FLAVOR_CONFIG.showAccentPicker,
  isSurfaceLocked = !SITE_FLAVOR_CONFIG.showSurfacePicker,
  isFontLocked = !SITE_FLAVOR_CONFIG.showFontToggle,
  isColorSchemePersistent = true,
}: {
  children: ReactNode;
  /** What the server rendered, so the first client render matches the painted markup. */
  initialColorScheme?: ColorScheme;
  initialVisualStyle?: VisualStyle;
  /** Pins the style axis: setters become no-ops and the style key is never read or written. */
  isVisualStyleLocked?: boolean;
  /** Pins the accent hue and saturation axes, on the same terms. */
  isAccentLocked?: boolean;
  isSurfaceLocked?: boolean;
  /** Pins the type axis: the font setters become no-ops and its key is never read or written. */
  isFontLocked?: boolean;
  /** Embedded hosts may adapt their document without changing the reader's saved scheme. */
  isColorSchemePersistent?: boolean;
}) {
  /**
   * The saved axis value — possibly "system" — and the OS scheme it resolves
   * through. The painted scheme is derived, never stored: while the
   * preference is "system" it tracks `prefers-color-scheme` live, so an OS
   * day/night flip restyles the page with no reload. The OS scheme opens on
   * the server's guess and is corrected by the matchMedia effect on mount,
   * before `hydrated` lets anything paint or persist.
   */
  const [colorSchemePreference, setColorSchemePreferenceState] =
    useState<ColorSchemePreference>(initialColorScheme);
  const [systemColorScheme, setSystemColorScheme] = useState<ColorScheme>(initialColorScheme);
  const colorScheme =
    colorSchemePreference === "system" ? systemColorScheme : colorSchemePreference;
  const [visualStyle, setVisualStyleState] = useState<VisualStyle>(initialVisualStyle);
  const [fontPreference, setFontPreferenceState] = useState<FontPreference>("lexend");
  /**
   * The reading-type axes' saved slots, on the saved-colour-coordinates' exact terms:
   * null while the reader never moved that slider, effective values resolved by the
   * consumers, persistence removes the key on null so a default is never written.
   * All three ride the font axis's lock.
   */
  const [savedTextSize, setTextSizeState] = useState<number | null>(null);
  const [savedLetterSpacing, setLetterSpacingState] = useState<number | null>(null);
  const [savedLineHeight, setLineHeightState] = useState<number | null>(null);
  /**
   * The colour axes' saved coordinates per look, or null per slot while the reader
   * never moved that slider under that look. Null is the persistence state, not the
   * display one: effective values resolve through the appearance-default matrix, and
   * the persist effect removes the key on null so a default is never written into
   * storage. Hue remains exposed as null so consumers can distinguish "never chose"
   * from a saved coordinate.
   *
   * The axes are independent per look and SHARED across light/dark: a saved
   * coordinate rides only the style it was tuned under — Clinical keeps its hue
   * while Vivid keeps hers — but flipping the Mode toggle never moves it, because
   * light and dark are one hue world at two lightness worlds. A reader with nothing
   * saved for a look follows the authored defaults. Effective values are derived
   * here, never captured.
   */
  const [savedChroma, setSavedChromaState] = useState<Record<string, ChromaSlots>>({});
  const chromaSlots = savedChroma[chromaSlotsId(visualStyle)] ?? EMPTY_CHROMA_SLOTS;
  const defaultColors = getDefaultAppearanceColors(visualStyle, colorScheme);
  const surfaceChroma = chromaSlots.surfaceChroma ?? defaultColors.surfaceLevel;
  const accentChroma = chromaSlots.accentChroma ?? defaultColors.accentLevel;
  const effectiveSurfaceHue = chromaSlots.surfaceHue ?? defaultColors.surfaceHue;
  const effectiveAccentHue = chromaSlots.accentHue ?? defaultColors.accentHue;
  // A locked axis stores nothing, so its saved slots stay null and it never
  // claims a customization the reader could not have made.
  const hasCustomColors =
    chromaSlots.surfaceChroma !== null ||
    chromaSlots.accentChroma !== null ||
    chromaSlots.surfaceHue !== null ||
    chromaSlots.accentHue !== null;
  const hasCustomType =
    fontPreference !== "lexend" ||
    savedTextSize !== null ||
    savedLetterSpacing !== null ||
    savedLineHeight !== null;
  /**
   * Until the mount effect has read back what the bootstrap resolved, this provider is still
   * holding the server's opening guess. Applying it would be harmless — the document already
   * says so — but *persisting* it would overwrite a saved preference with a default the reader
   * never chose, so both effects wait for this.
   */
  const [hydrated, setHydrated] = useState(false);
  /**
   * The rAF handle for the next chroma paint, and the pending debounced axis
   * persist. Both exist because a slider drag emits state changes far faster
   * than either sink wants them: the document restyles at most once per
   * frame, and storage hears only the settled value. The persist lives in a
   * ref so the flush effect below can settle a drag its timer never got to.
   */
  const chromaFrameRef = useRef<number | null>(null);
  const pendingAxisPersistRef = useRef<(() => void) | null>(null);
  /**
   * The pacing state for the document-wide chroma paint: the timestamp of the
   * last write, its measured cost (the gap from the writing frame to the
   * frame after it, which cannot start until the forced full-document
   * restyle finishes), and the timer holding back the next write while the
   * spacing window is open. All refs: pacing must never itself cause a
   * render.
   */
  const chromaPaintAtRef = useRef(0);
  const chromaPaintCostRef = useRef(0);
  const chromaDelayTimerRef = useRef<number | null>(null);

  useEffect(() => {
    // The scheme axis stores a *preference* — possibly "system" — while the
    // painted attribute only ever carries its resolution, so storage is the
    // first source here, not the document: adopting a system reader's painted
    // attribute as their preference would silently pin them to one scheme.
    let storedPreference: ColorSchemePreference | null = null;
    try {
      const stored = isColorSchemePersistent ? window.localStorage.getItem(COLOR_SCHEME_STORAGE_KEY) : null;
      if (isColorSchemePreference(stored)) {
        storedPreference = stored;
      }
    } catch {
      // Ignore storage failures; the painted attribute below still applies.
    }

    if (storedPreference) {
      setColorSchemePreferenceState(storedPreference);
    } else if (isColorSchemePersistent) {
      const paintedColorScheme = resolvePaintedAxis(
        "theme",
        COLOR_SCHEME_STORAGE_KEY,
        isColorScheme,
      );

      if (paintedColorScheme) {
        setColorSchemePreferenceState(paintedColorScheme);
      }
    }

    // A locked style resolves from the build alone: neither the document nor the storage key
    // is consulted, so a dose.wiki reader's Fun/Pro choice cannot follow them into a
    // publication whose identity is one of those styles.
    if (!isVisualStyleLocked) {
      const paintedVisualStyle = resolvePaintedAxis(
        "visualStyle",
        VISUAL_STYLE_STORAGE_KEY,
        isVisualStyle,
      );

      if (paintedVisualStyle) {
        setVisualStyleState(paintedVisualStyle);
      }
    }

    // The type axes, on the style lock's exact terms. The bootstrap painted
    // `data-font` (or nothing — the default Lexend) from storage pre-paint; adopt what
    // it resolved. A saved value from the binary-toggle era ("dyslexic") maps onto the
    // default face — which is what that pick reproduces now — and its key is removed so
    // the retired value never answers again.
    if (!isFontLocked) {
      const paintedFont = resolvePaintedAxis("font", FONT_STORAGE_KEY, isFontPreference);

      if (paintedFont) {
        setFontPreferenceState(paintedFont);
      }

      try {
        if (window.localStorage.getItem(FONT_STORAGE_KEY) === "dyslexic") {
          removeStoredKey(FONT_STORAGE_KEY);
        }
      } catch {
        // A blocked read also cannot be cleared; the painted attribute still applies.
      }

      const readAxis = (storageKey: string, min: number, max: number) => {
        try {
          return parseAxisNumber(window.localStorage.getItem(storageKey), min, max);
        } catch {
          return null;
        }
      };
      // A stored value equal to its axis's resting default reads as null: the default is
      // the absence of the key, so a reader who dragged a thumb back to where it started
      // lands in exactly the never-touched state, not a saved copy of it. Tracking is the
      // exception — its resting value follows the face, which is only known after the
      // adoption above, so it keeps whatever was stored and lets the setter normalize it.
      const storedTextSize = readAxis(TEXT_SIZE_STORAGE_KEY, ...TEXT_SIZE_RANGE);
      setTextSizeState(storedTextSize === DEFAULT_TEXT_SIZE ? null : storedTextSize);
      setLetterSpacingState(readAxis(LETTER_SPACING_STORAGE_KEY, ...READER_TRACKING_RANGE));
      const storedLineHeight = readAxis(LINE_HEIGHT_STORAGE_KEY, ...READER_LEADING_RANGE);
      setLineHeightState(storedLineHeight === DEFAULT_LINE_HEIGHT ? null : storedLineHeight);
    }

    /**
     * Hue and chroma per look, plus the one-time migrations. Two eras of legacy keys
     * feed the migration, both into the FUN slots — the default look, the one the
     * reader was almost certainly wearing when they tuned:
     *
     * 1. The pre-look-global hue/chroma keys (un-suffixed). They predate per-look
     *    storage; the provider removes them on hydration, so the bootstrap's
     *    fun-only fallback answers for one page load.
     * 2. The discrete-swatch era. A reader who last chose a colourway id has it in
     *    the legacy key and no hue key: the id's (hue, chroma) coordinates become
     *    their saved values — the achromatic ids also pin chroma to 0, overriding
     *    any stored level, because grey was the whole point of that pick.
     *
     * Every migrated or removed key answers nothing afterwards. A locked axis
     * touches none of its keys, so an Effect Index visit cannot eat a dose.wiki
     * reader's migration.
     */
    if (!isSurfaceLocked || !isAccentLocked) {
      const migrated: Record<string, ChromaSlots> = {
        fun: { ...EMPTY_CHROMA_SLOTS },
        pro: { ...EMPTY_CHROMA_SLOTS },
      };

      if (!isSurfaceLocked) {
        let hue = resolveStoredHue(`${SURFACE_HUE_STORAGE_KEY}-fun`);
        let chroma = resolveStoredChroma(`${SURFACE_CHROMA_STORAGE_KEY}-fun`);
        if (hue === null && chroma === null) {
          hue = resolveStoredHue(SURFACE_HUE_STORAGE_KEY);
          chroma = resolveStoredChroma(SURFACE_CHROMA_STORAGE_KEY);
        }
        if (hue === null) {
          const legacy = resolveLegacyColourway(LEGACY_SURFACE_TO_HUE, SURFACE_STORAGE_KEY);
          if (legacy) {
            hue = legacy.hue;
            if (legacy.chroma !== undefined) chroma = legacy.chroma;
          }
        }
        migrated.fun.surfaceChroma = chroma;
        migrated.fun.surfaceHue = hue;
        removeStoredKey(SURFACE_HUE_STORAGE_KEY);
        removeStoredKey(SURFACE_CHROMA_STORAGE_KEY);
        removeStoredKey(SURFACE_STORAGE_KEY);
      }
      if (!isAccentLocked) {
        let hue = resolveStoredHue(`${ACCENT_HUE_STORAGE_KEY}-fun`);
        let chroma = resolveStoredChroma(`${ACCENT_CHROMA_STORAGE_KEY}-fun`);
        if (hue === null && chroma === null) {
          hue = resolveStoredHue(ACCENT_HUE_STORAGE_KEY);
          chroma = resolveStoredChroma(ACCENT_CHROMA_STORAGE_KEY);
        }
        if (hue === null) {
          const legacy = resolveLegacyColourway(LEGACY_ACCENT_TO_HUE, ACCENT_STORAGE_KEY);
          if (legacy) {
            hue = legacy.hue;
            if (legacy.chroma !== undefined) chroma = legacy.chroma;
          }
        }
        migrated.fun.accentChroma = chroma;
        migrated.fun.accentHue = hue;
        removeStoredKey(ACCENT_HUE_STORAGE_KEY);
        removeStoredKey(ACCENT_CHROMA_STORAGE_KEY);
        removeStoredKey(ACCENT_STORAGE_KEY);
      }

      setSavedChromaState((current) => ({
        ...current,
        fun: {
          surfaceChroma: isSurfaceLocked ? current.fun?.surfaceChroma ?? null : migrated.fun.surfaceChroma,
          accentChroma: isAccentLocked ? current.fun?.accentChroma ?? null : migrated.fun.accentChroma,
          surfaceHue: isSurfaceLocked ? current.fun?.surfaceHue ?? null : migrated.fun.surfaceHue,
          accentHue: isAccentLocked ? current.fun?.accentHue ?? null : migrated.fun.accentHue,
        },
        pro: current.pro ?? { ...EMPTY_CHROMA_SLOTS },
      }));
    }

    setHydrated(true);
  }, [isVisualStyleLocked, isSurfaceLocked, isAccentLocked, isFontLocked, isColorSchemePersistent]);

  /**
   * The OS scheme, tracked for as long as the provider lives. One media query
   * and one listener — subscribing unconditionally instead of only under a
   * "system" preference keeps the resolution race-free: the preference can
   * arrive from hydration or a toggle at any time and the resolved scheme is
   * already current. The listener only fires on actual OS flips, so the idle
   * cost is nothing.
   */
  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return;
    }

    const query = window.matchMedia("(prefers-color-scheme: light)");
    const sync = () => setSystemColorScheme(query.matches ? "light" : "dark");
    sync();
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, []);

  /**
   * Scheme and style: applied and persisted synchronously per change. These
   * are toggle paths — one event per reader intention — so there is nothing
   * to throttle, and a flip must reach storage before any navigation.
   */
  useEffect(() => {
    if (!hydrated) {
      return;
    }

    applyAppearanceToDocument({ colorScheme, visualStyle });
    if (isColorSchemePersistent) persistPreference(COLOR_SCHEME_STORAGE_KEY, colorSchemePreference);

    if (!isVisualStyleLocked) {
      persistPreference(VISUAL_STYLE_STORAGE_KEY, visualStyle);
    }
  }, [hydrated, colorScheme, colorSchemePreference, visualStyle, isVisualStyleLocked, isColorSchemePersistent]);

  /**
   * The type axes: applied and persisted synchronously per change, like scheme and style.
   * The default face removes both the attribute and the key — the absent state, never a
   * stored value — so a reader on Lexend's document and storage look exactly as if the
   * axis did not exist.
   */
  useEffect(() => {
    if (!hydrated || isFontLocked) {
      return;
    }

    const root = document.documentElement;
    const nextFont = fontPreference === "lexend" ? undefined : fontPreference;

    if (root.dataset.font !== nextFont) {
      // A family swap restyles and reflows the whole document; run it under
      // the same transition lock as the colour axes so it lands in one pass.
      withTransitionsSuppressed(() => {
        if (nextFont) {
          root.dataset.font = nextFont;
        } else {
          delete root.dataset.font;
        }
      });
    }

    if (nextFont) {
      persistPreference(FONT_STORAGE_KEY, nextFont);
    } else {
      removeStoredKey(FONT_STORAGE_KEY);
    }
  }, [hydrated, fontPreference, isFontLocked]);

  /**
   * The colour axes' document paint, coalesced per animation frame and paced
   * by its own measured cost. The four root properties feed the generated
   * stylesheet's whole custom-property graph, so every write forces a
   * full-document style recalculation; on hardware where one recalculation
   * outruns the frame budget, issuing one per frame would freeze the page
   * for the whole drag. Each paint therefore probes what it actually cost,
   * and while that cost exceeds CHROMA_PAINT_BUDGET_MS further paints keep a
   * proportional distance (capped at CHROMA_PAINT_MAX_DELAY_MS). React state
   * — and so the sliders' thumbs and rails — still tracks every tick, and
   * the trailing paint always lands the settled value.
   *
   * Painted values are the effective ones on unlocked axes — the saved number
   * or the default — and null under a lock, which is how the runtime knows to
   * leave that axis's properties off the root (all four null disengages the
   * axis attribute entirely: Effect Index renders its authored palette).
   */
  useEffect(() => {
    if (!hydrated) {
      return;
    }

    const write = () => {
      applyChromaToDocument(
        isSurfaceLocked ? null : surfaceChroma,
        isAccentLocked ? null : accentChroma,
        isSurfaceLocked ? null : effectiveSurfaceHue,
        isAccentLocked ? null : effectiveAccentHue,
      );
      // The reading-type axes share this paint: their writes are also whole-document
      // custom-property batches (the text size's is a full reflow), so they belong
      // behind the same measured pacing as the chroma axes rather than beside it.
      applyReaderTypeToDocument({
        textSize: isFontLocked ? null : savedTextSize,
        letterSpacing: isFontLocked ? null : savedLetterSpacing,
        lineHeight: isFontLocked ? null : savedLineHeight,
      });
    };

    if (typeof requestAnimationFrame !== "function") {
      write();
      return;
    }

    const paint = () => {
      chromaFrameRef.current = null;
      const start = performance.now();
      write();
      chromaPaintAtRef.current = start;
      // Probe the write's true cost: the browser must restyle the whole
      // document before the next frame can begin, so that frame's delay IS
      // the cost. The probe only records a number, so it is deliberately
      // left running across cleanups and unmount.
      requestAnimationFrame(() => {
        chromaPaintCostRef.current = performance.now() - start;
      });
    };

    // Paints within the spacing window wait out its remainder; a change that
    // arrives after a quiet spell (a toggle, a fresh drag) paints on the next
    // frame regardless of how slow the previous drag proved the device to be.
    const cost = chromaPaintCostRef.current;
    const spacing =
      cost > CHROMA_PAINT_BUDGET_MS ? Math.min(cost * 2, CHROMA_PAINT_MAX_DELAY_MS) : 0;
    const waitLeft = chromaPaintAtRef.current + spacing - performance.now();

    if (waitLeft > 0) {
      chromaDelayTimerRef.current = window.setTimeout(() => {
        chromaDelayTimerRef.current = null;
        chromaFrameRef.current = requestAnimationFrame(paint);
      }, waitLeft);
    } else {
      chromaFrameRef.current = requestAnimationFrame(paint);
    }
    return () => {
      if (chromaDelayTimerRef.current !== null) {
        window.clearTimeout(chromaDelayTimerRef.current);
        chromaDelayTimerRef.current = null;
      }
      if (chromaFrameRef.current !== null) {
        cancelAnimationFrame(chromaFrameRef.current);
        chromaFrameRef.current = null;
      }
    };
  }, [hydrated, surfaceChroma, accentChroma, effectiveSurfaceHue, effectiveAccentHue, savedTextSize, savedLetterSpacing, savedLineHeight, isSurfaceLocked, isAccentLocked, isFontLocked]);

  /**
   * The colour axes' persistence, debounced past the drag. Null still removes
   * the key (see the saved-state comment above): the debounce moves *when*
   * `persistAxisNumber` runs, never what it writes. A fully locked pair
   * schedules nothing, so a locked publication still never touches these
   * keys; a single lock skips only its own axis, exactly as before.
   */
  useEffect(() => {
    if (!hydrated || (isSurfaceLocked && isAccentLocked && isFontLocked)) {
      return;
    }

    const persist = () => {
      if (pendingAxisPersistRef.current === persist) {
        pendingAxisPersistRef.current = null;
      }
      // Every look's slots persist to their own suffixed keys, not just the current
      // look's: a drag on Vivid followed by an immediate flip to Clinical must not
      // lose the settled value to the debounce cleanup. Untouched looks hold null
      // slots, whose writes are removes of absent keys — harmless no-ops.
      if (!isSurfaceLocked) {
        for (const look of ["fun", "pro"] as const) {
          const slots = savedChroma[look] ?? EMPTY_CHROMA_SLOTS;
          persistAxisNumber(`${SURFACE_CHROMA_STORAGE_KEY}-${look}`, slots.surfaceChroma);
          persistAxisNumber(`${SURFACE_HUE_STORAGE_KEY}-${look}`, slots.surfaceHue);
        }
      }
      if (!isAccentLocked) {
        for (const look of ["fun", "pro"] as const) {
          const slots = savedChroma[look] ?? EMPTY_CHROMA_SLOTS;
          persistAxisNumber(`${ACCENT_CHROMA_STORAGE_KEY}-${look}`, slots.accentChroma);
          persistAxisNumber(`${ACCENT_HUE_STORAGE_KEY}-${look}`, slots.accentHue);
        }
      }
      if (!isFontLocked) {
        persistAxisNumber(TEXT_SIZE_STORAGE_KEY, savedTextSize);
        persistAxisNumber(LETTER_SPACING_STORAGE_KEY, savedLetterSpacing);
        persistAxisNumber(LINE_HEIGHT_STORAGE_KEY, savedLineHeight);
      }
    };

    pendingAxisPersistRef.current = persist;
    const timer = setTimeout(persist, AXIS_PERSIST_DEBOUNCE_MS);
    // The timer dies with the change that scheduled it; the ref survives so
    // the flush below can settle a drag the timer never got to.
    return () => clearTimeout(timer);
  }, [hydrated, savedChroma, savedTextSize, savedLetterSpacing, savedLineHeight, isSurfaceLocked, isAccentLocked, isFontLocked]);

  /**
   * The debounce's safety net: a drag followed by an immediate exit —
   * provider unmount, or a hard navigation's pagehide (which also covers
   * entering the bfcache) — flushes the pending persist so the settled value
   * is never lost to the debounce window.
   */
  useEffect(() => {
    const flush = () => {
      pendingAxisPersistRef.current?.();
    };
    window.addEventListener("pagehide", flush);
    return () => {
      window.removeEventListener("pagehide", flush);
      flush();
    };
  }, []);

  const setVisualStyle = useCallback(
    (value: VisualStyle) => {
      if (isVisualStyleLocked) {
        return;
      }

      setVisualStyleState(value);
    },
    [isVisualStyleLocked],
  );

  const setFontPreference = useCallback(
    (value: FontPreference) => {
      if (isFontLocked) {
        return;
      }

      setFontPreferenceState(value);
    },
    [isFontLocked],
  );

  // Null is the setters' "back to the site default": the storage key is removed and the
  // axis's root write disengages. Every clamp is the slider's own domain, so a value can
  // only arrive here through the control that owns that domain — and a value equal to the
  // resting default IS the default, so it stores nothing: dragging the thumb back to
  // where it started must land the document in exactly the never-touched state, not a
  // saved copy of it. That is the never-write-a-default rule every other axis follows.
  const setTextSize = useCallback(
    (value: number | null) => {
      if (!isFontLocked) {
        if (value === null) {
          setTextSizeState(null);
          return;
        }
        const next = Number(
          clampAxisNumber(value, TEXT_SIZE_RANGE[0], TEXT_SIZE_RANGE[1]).toFixed(2),
        );
        setTextSizeState(next === DEFAULT_TEXT_SIZE ? null : next);
      }
    },
    [isFontLocked],
  );

  const setLetterSpacing = useCallback(
    (value: number | null) => {
      if (!isFontLocked) {
        if (value === null) {
          setLetterSpacingState(null);
          return;
        }
        const next = Number(
          clampAxisNumber(value, READER_TRACKING_RANGE[0], READER_TRACKING_RANGE[1]).toFixed(2),
        );
        // The resting tracking follows the face: Lexend's letterfit is the default
        // face's whole point (0), the authored faces carry the negative body ramp.
        const resting =
          fontPreference === "lexend" ? DEFAULT_LETTER_SPACING_LEXEND : DEFAULT_LETTER_SPACING_STANDARD;
        setLetterSpacingState(next === resting ? null : next);
      }
    },
    [isFontLocked, fontPreference],
  );

  const setLineHeight = useCallback(
    (value: number | null) => {
      if (!isFontLocked) {
        if (value === null) {
          setLineHeightState(null);
          return;
        }
        const next = Number(
          clampAxisNumber(value, READER_LEADING_RANGE[0], READER_LEADING_RANGE[1]).toFixed(2),
        );
        setLineHeightState(next === DEFAULT_LINE_HEIGHT ? null : next);
      }
    },
    [isFontLocked],
  );

  // The colour setters write the CURRENT look's slots only: Vivid and Clinical keep
  // independent coordinates, while light and dark share them (the Mode toggle is a
  // lightness world, not a hue world). Null is the "back to the site default" state:
  // the storage key is removed and the slot disengages.
  const setSurfaceChroma = useCallback(
    (value: number | null) => {
      if (!isSurfaceLocked) {
        setSavedChromaState((current) => ({
          ...current,
          [visualStyle]: {
            ...(current[visualStyle] ?? EMPTY_CHROMA_SLOTS),
            surfaceChroma: value === null ? null : Math.min(Math.max(value, 0), 1),
          },
        }));
      }
    },
    [isSurfaceLocked, visualStyle],
  );

  const setAccentChroma = useCallback(
    (value: number | null) => {
      if (!isAccentLocked) {
        setSavedChromaState((current) => ({
          ...current,
          [visualStyle]: {
            ...(current[visualStyle] ?? EMPTY_CHROMA_SLOTS),
            accentChroma: value === null ? null : Math.min(Math.max(value, 0), 1),
          },
        }));
      }
    },
    [isAccentLocked, visualStyle],
  );

  const setSurfaceHue = useCallback(
    (value: number | null) => {
      if (!isSurfaceLocked) {
        setSavedChromaState((current) => ({
          ...current,
          [visualStyle]: {
            ...(current[visualStyle] ?? EMPTY_CHROMA_SLOTS),
            surfaceHue: value === null ? null : clampHueDegrees(value),
          },
        }));
      }
    },
    [isSurfaceLocked, visualStyle],
  );

  const setAccentHue = useCallback(
    (value: number | null) => {
      if (!isAccentLocked) {
        setSavedChromaState((current) => ({
          ...current,
          [visualStyle]: {
            ...(current[visualStyle] ?? EMPTY_CHROMA_SLOTS),
            accentHue: value === null ? null : clampHueDegrees(value),
          },
        }));
      }
    },
    [isAccentLocked, visualStyle],
  );

  const setColorSchemePreference = useCallback((value: ColorSchemePreference) => {
    setColorSchemePreferenceState(value);
  }, []);

  const setColorScheme = useCallback((value: ColorScheme) => {
    setColorSchemePreferenceState(value);
  }, []);

  /**
   * Flips to the explicit opposite of the *resolved* scheme, so a system
   * reader who reaches for the toggle gets the scheme they were looking at,
   * inverted and pinned — never a no-op relative to what they see.
   */
  const toggleColorScheme = useCallback(() => {
    setColorSchemePreferenceState(colorScheme === "dark" ? "light" : "dark");
  }, [colorScheme]);

  const toggleVisualStyle = useCallback(() => {
    if (isVisualStyleLocked) {
      return;
    }

    setVisualStyleState((current) => (current === "pro" ? "fun" : "pro"));
  }, [isVisualStyleLocked]);

  const value = useMemo(
    () => ({
      colorScheme,
      colorSchemePreference,
      visualStyle,
      fontPreference,
      setColorScheme,
      setColorSchemePreference,
      setVisualStyle,
      setFontPreference,
      textSize: savedTextSize,
      letterSpacing: savedLetterSpacing,
      lineHeight: savedLineHeight,
      setTextSize,
      setLetterSpacing,
      setLineHeight,
      hasCustomType,
      surfaceChroma,
      accentChroma,
      setSurfaceChroma,
      setAccentChroma,
      surfaceHue: chromaSlots.surfaceHue,
      accentHue: chromaSlots.accentHue,
      setSurfaceHue,
      setAccentHue,
      hasCustomColors,
      toggleColorScheme,
      toggleVisualStyle,
      isVisualStyleLocked,
      isAccentLocked,
      isSurfaceLocked,
      isFontLocked,
    }),
    [
      colorScheme,
      colorSchemePreference,
      visualStyle,
      fontPreference,
      setColorScheme,
      setColorSchemePreference,
      setVisualStyle,
      setFontPreference,
      savedTextSize,
      savedLetterSpacing,
      savedLineHeight,
      setTextSize,
      setLetterSpacing,
      setLineHeight,
      hasCustomType,
      surfaceChroma,
      accentChroma,
      setSurfaceChroma,
      setAccentChroma,
      chromaSlots.surfaceHue,
      chromaSlots.accentHue,
      setSurfaceHue,
      setAccentHue,
      hasCustomColors,
      toggleColorScheme,
      toggleVisualStyle,
      isVisualStyleLocked,
      isSurfaceLocked,
      isAccentLocked,
      isFontLocked,
    ],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const value = useContext(ThemeContext);

  if (!value) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }

  return value;
}
