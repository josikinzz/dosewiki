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
  SURFACE_CHROMA_STORAGE_KEY,
  SURFACE_HUE_STORAGE_KEY,
  SURFACE_STORAGE_KEY,
  THEME_META_ID,
  VISUAL_STYLE_STORAGE_KEY,
  getAppearanceMetaColor,
  isColorScheme,
  isFontPreference,
  isVisualStyle,
  type Appearance,
  type ColorScheme,
  type FontPreference,
  type VisualStyle,
} from "@/theme";

export type { Appearance, ColorScheme, FontPreference, VisualStyle } from "@/theme";
export {
  ACCENT_CHROMA_STORAGE_KEY,
  ACCENT_HUE_STORAGE_KEY,
  // The retired colourway keys: still exported because the migration below is
  // observable — tests and the bootstrap name them — not because anything may
  // write them again.
  ACCENT_STORAGE_KEY,
  COLOR_SCHEME_STORAGE_KEY,
  FONT_STORAGE_KEY,
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
  colorScheme: ColorScheme;
  visualStyle: VisualStyle;
  setColorScheme: (value: ColorScheme) => void;
  setVisualStyle: (value: VisualStyle) => void;
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
   * The type axis: "default" is the current visual style's own face, "dyslexic" re-seats
   * both family tokens to Lexend (`data-font="dyslexic"` on the root). "default" is
   * expressed by *removing* the attribute and the storage key, so an untoggled reader
   * stores nothing and fetches no Lexend bytes.
   */
  fontPreference: FontPreference;
  setFontPreference: (value: FontPreference) => void;
  toggleColorScheme: () => void;
  toggleVisualStyle: () => void;
  toggleFontPreference: () => void;
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
 * Increments on every apply; an async flip only lands while it is still the
 * newest one. Without this, toggling pro → fun while the Pro sheet is mid-
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

  const root = document.documentElement;
  root.dataset.theme = colorScheme;
  root.dataset.visualStyle = visualStyle;
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
}) {
  const [colorScheme, setColorScheme] = useState<ColorScheme>(initialColorScheme);
  const [visualStyle, setVisualStyleState] = useState<VisualStyle>(initialVisualStyle);
  const [fontPreference, setFontPreferenceState] = useState<FontPreference>("default");
  /**
   * The reader's *saved* level and hue per axis, or null while they never
   * saved one. Null is the persistence state, not the display one: effective
   * values resolve through the appearance-default matrix, and the persist
   * effect removes the key on null so a default is never written into storage.
   * Hue remains exposed as null so consumers can distinguish "never chose"
   * from a saved coordinate.
   *
   * All four defaults depend on visual style and colour scheme, so a reader
   * with nothing saved follows either toggle. Effective values are derived
   * here, never captured. A saved value stays one knob for every combination.
   */
  const [savedSurfaceChroma, setSurfaceChromaState] = useState<number | null>(null);
  const [savedAccentChroma, setAccentChromaState] = useState<number | null>(null);
  const [savedSurfaceHue, setSurfaceHueState] = useState<number | null>(null);
  const [savedAccentHue, setAccentHueState] = useState<number | null>(null);
  const defaultColors = getDefaultAppearanceColors(visualStyle, colorScheme);
  const surfaceChroma = savedSurfaceChroma ?? defaultColors.surfaceLevel;
  const accentChroma = savedAccentChroma ?? defaultColors.accentLevel;
  const effectiveSurfaceHue = savedSurfaceHue ?? defaultColors.surfaceHue;
  const effectiveAccentHue = savedAccentHue ?? defaultColors.accentHue;
  // A locked axis stores nothing, so its saved slots stay null and it never
  // claims a customization the reader could not have made.
  const hasCustomColors =
    savedSurfaceChroma !== null ||
    savedAccentChroma !== null ||
    savedSurfaceHue !== null ||
    savedAccentHue !== null;
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
    const paintedColorScheme = resolvePaintedAxis(
      "theme",
      COLOR_SCHEME_STORAGE_KEY,
      isColorScheme,
    );

    if (paintedColorScheme) {
      setColorScheme(paintedColorScheme);
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

    // The type axis, on the style lock's exact terms. The bootstrap painted
    // `data-font="dyslexic"` (or nothing) from storage pre-paint; adopt what it resolved.
    if (!isFontLocked) {
      const paintedFont = resolvePaintedAxis("font", FONT_STORAGE_KEY, isFontPreference);

      if (paintedFont) {
        setFontPreferenceState(paintedFont);
      }
    }

    /**
     * Hue and chroma per colour axis, plus the one-time migration off the
     * discrete-swatch era. A reader who last chose a colourway id has it in the
     * legacy key and no hue key: the id's (hue, chroma) coordinates become
     * their saved values — the achromatic ids also pin chroma to 0, overriding
     * any stored level, because grey was the whole point of that pick. The
     * legacy key is then removed either way: with the hue key present or the id
     * translated, it answers nothing anymore. A locked axis touches none of its
     * keys, so an Effect Index visit cannot eat a dose.wiki reader's migration.
     */
    if (!isSurfaceLocked) {
      const storedHue = resolveStoredHue(SURFACE_HUE_STORAGE_KEY);
      let hue = storedHue;
      let chroma = resolveStoredChroma(SURFACE_CHROMA_STORAGE_KEY);
      if (storedHue === null) {
        const legacy = resolveLegacyColourway(LEGACY_SURFACE_TO_HUE, SURFACE_STORAGE_KEY);
        if (legacy) {
          hue = legacy.hue;
          if (legacy.chroma !== undefined) chroma = legacy.chroma;
        }
      }
      removeStoredKey(SURFACE_STORAGE_KEY);
      setSurfaceHueState(hue);
      setSurfaceChromaState(chroma);
    }
    if (!isAccentLocked) {
      const storedHue = resolveStoredHue(ACCENT_HUE_STORAGE_KEY);
      let hue = storedHue;
      let chroma = resolveStoredChroma(ACCENT_CHROMA_STORAGE_KEY);
      if (storedHue === null) {
        const legacy = resolveLegacyColourway(LEGACY_ACCENT_TO_HUE, ACCENT_STORAGE_KEY);
        if (legacy) {
          hue = legacy.hue;
          if (legacy.chroma !== undefined) chroma = legacy.chroma;
        }
      }
      removeStoredKey(ACCENT_STORAGE_KEY);
      setAccentHueState(hue);
      setAccentChromaState(chroma);
    }

    setHydrated(true);
  }, [isVisualStyleLocked, isSurfaceLocked, isAccentLocked, isFontLocked]);

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
    persistPreference(COLOR_SCHEME_STORAGE_KEY, colorScheme);

    if (!isVisualStyleLocked) {
      persistPreference(VISUAL_STYLE_STORAGE_KEY, visualStyle);
    }
  }, [hydrated, colorScheme, visualStyle, isVisualStyleLocked]);

  /**
   * The type axis: applied and persisted synchronously per change, like scheme and style.
   * "default" removes both the attribute and the key — the absent state, never a stored
   * value — so an untoggled reader's document and storage look exactly as if the axis did
   * not exist, and no Lexend `@font-face` ever matches a rendered element.
   */
  useEffect(() => {
    if (!hydrated || isFontLocked) {
      return;
    }

    const root = document.documentElement;

    if (fontPreference === "dyslexic") {
      root.dataset.font = "dyslexic";
      persistPreference(FONT_STORAGE_KEY, "dyslexic");
    } else {
      delete root.dataset.font;
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
  }, [hydrated, surfaceChroma, accentChroma, effectiveSurfaceHue, effectiveAccentHue, isSurfaceLocked, isAccentLocked]);

  /**
   * The colour axes' persistence, debounced past the drag. Null still removes
   * the key (see the saved-state comment above): the debounce moves *when*
   * `persistAxisNumber` runs, never what it writes. A fully locked pair
   * schedules nothing, so a locked publication still never touches these
   * keys; a single lock skips only its own axis, exactly as before.
   */
  useEffect(() => {
    if (!hydrated || (isSurfaceLocked && isAccentLocked)) {
      return;
    }

    const persist = () => {
      if (pendingAxisPersistRef.current === persist) {
        pendingAxisPersistRef.current = null;
      }
      if (!isSurfaceLocked) {
        persistAxisNumber(SURFACE_CHROMA_STORAGE_KEY, savedSurfaceChroma);
        persistAxisNumber(SURFACE_HUE_STORAGE_KEY, savedSurfaceHue);
      }
      if (!isAccentLocked) {
        persistAxisNumber(ACCENT_CHROMA_STORAGE_KEY, savedAccentChroma);
        persistAxisNumber(ACCENT_HUE_STORAGE_KEY, savedAccentHue);
      }
    };

    pendingAxisPersistRef.current = persist;
    const timer = setTimeout(persist, AXIS_PERSIST_DEBOUNCE_MS);
    // The timer dies with the change that scheduled it; the ref survives so
    // the flush below can settle a drag the timer never got to.
    return () => clearTimeout(timer);
  }, [hydrated, savedSurfaceChroma, savedAccentChroma, savedSurfaceHue, savedAccentHue, isSurfaceLocked, isAccentLocked]);

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

  const setSurfaceChroma = useCallback(
    (value: number | null) => {
      if (!isSurfaceLocked) {
        setSurfaceChromaState(value === null ? null : Math.min(Math.max(value, 0), 1));
      }
    },
    [isSurfaceLocked],
  );

  const setAccentChroma = useCallback(
    (value: number | null) => {
      if (!isAccentLocked) {
        setAccentChromaState(value === null ? null : Math.min(Math.max(value, 0), 1));
      }
    },
    [isAccentLocked],
  );

  const setSurfaceHue = useCallback(
    (value: number | null) => {
      if (!isSurfaceLocked) {
        setSurfaceHueState(value === null ? null : clampHueDegrees(value));
      }
    },
    [isSurfaceLocked],
  );

  const setAccentHue = useCallback(
    (value: number | null) => {
      if (!isAccentLocked) {
        setAccentHueState(value === null ? null : clampHueDegrees(value));
      }
    },
    [isAccentLocked],
  );

  const toggleColorScheme = useCallback(() => {
    setColorScheme((current) => (current === "dark" ? "light" : "dark"));
  }, []);

  const toggleVisualStyle = useCallback(() => {
    if (isVisualStyleLocked) {
      return;
    }

    setVisualStyleState((current) => (current === "pro" ? "fun" : "pro"));
  }, [isVisualStyleLocked]);

  const toggleFontPreference = useCallback(() => {
    if (isFontLocked) {
      return;
    }

    setFontPreferenceState((current) => (current === "dyslexic" ? "default" : "dyslexic"));
  }, [isFontLocked]);

  const value = useMemo(
    () => ({
      colorScheme,
      visualStyle,
      fontPreference,
      setColorScheme,
      setVisualStyle,
      setFontPreference,
      surfaceChroma,
      accentChroma,
      setSurfaceChroma,
      setAccentChroma,
      surfaceHue: savedSurfaceHue,
      accentHue: savedAccentHue,
      setSurfaceHue,
      setAccentHue,
      hasCustomColors,
      toggleColorScheme,
      toggleVisualStyle,
      toggleFontPreference,
      isVisualStyleLocked,
      isAccentLocked,
      isSurfaceLocked,
      isFontLocked,
    }),
    [
      colorScheme,
      visualStyle,
      fontPreference,
      setVisualStyle,
      setFontPreference,
      surfaceChroma,
      accentChroma,
      setSurfaceChroma,
      setAccentChroma,
      savedSurfaceHue,
      savedAccentHue,
      setSurfaceHue,
      setAccentHue,
      hasCustomColors,
      toggleColorScheme,
      toggleVisualStyle,
      toggleFontPreference,
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
