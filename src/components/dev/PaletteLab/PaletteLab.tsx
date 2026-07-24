"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  applyThemeToDocument,
  persistTheme,
  readInitialTheme,
  type ThemeName,
} from "@/context/ThemeContext";
import { Icon } from "@/components/common/Icon";
import { ColorWheel } from "./ColorWheel";
import {
  ALL_TOKEN_IDS,
  ESSENTIALS,
  ESSENTIAL_IDS,
  PALETTE_GROUPS,
  getEssential,
  getToken,
  isInertInTheme,
  tokenThemeScope,
  type PaletteToken,
} from "./paletteTokens";
import {
  describeColor,
  formatChannels,
  formatColor,
  parseChannelsToRgba,
  parseColorToRgba,
  type Rgba,
} from "./colorUtils";
import {
  buildThemeRuleIndex,
  resolveTokensAt,
  type PickCandidate,
  type PickRole,
  type ThemeRuleIndex,
} from "./pickToken";
import {
  getPaletteLabOpener,
  setPaletteLabOpen,
  usePaletteLabOpen,
} from "./paletteLabStore";
import {
  DEFAULT_PRESET_ID,
  PALETTE_PRESETS,
  getPreset,
  isKnownPresetId,
  mergeOverrides,
  type PalettePresetId,
} from "./palettePresets";
import styles from "./PaletteLab.module.css";

type ThemeOverrides = Record<string, string>;
type Overrides = Record<ThemeName, ThemeOverrides>;
type ThemeDefaults = Record<ThemeName, Record<string, string>>;
type ViewMode = "essentials" | "sections" | "merged";

const VIEW_TABS: { mode: ViewMode; label: string; hint: string }[] = [
  { mode: "essentials", label: "Essentials", hint: "The key colors, plainly named" },
  { mode: "sections", label: "All colors", hint: "Every color, grouped" },
  {
    mode: "merged",
    label: "Identical",
    hint: "Colors identical right now — edit once to change them all",
  },
];

const RESET_UNDO_MS = 6000;

const ROLE_LABEL: Record<PickRole, string> = {
  fill: "Background",
  text: "Text",
  border: "Border",
};

interface PickMenuState {
  x: number;
  y: number;
  candidates: PickCandidate[];
}

interface ColorGroup {
  key: string;
  value: string;
  ids: string[];
  firstIndex: number;
}

const OVERRIDE_STYLE_ID = "palette-lab-overrides";
const STORAGE_KEY = "dosewiki-palette-lab";
const PERSIST_DELAY_MS = 300;

/** v2 localStorage envelope: active preset + the user's own edits on top.
 *  v1 blobs (bare `{dark, light}` maps) migrate losslessly as user edits on
 *  the default preset. */
interface StoredEnvelopeV2 {
  version: 2;
  presetId: string;
  overrides: Partial<Overrides>;
}

/** What an undo restores: the full pre-action state. `kind` picks the label
 *  ("reset N colors" vs "applied preset, replaced N edits"). */
interface UndoState {
  overrides: Overrides;
  presetId: PalettePresetId;
  count: number;
  kind: "reset" | "preset";
}
const THEMES: ThemeName[] = ["dark", "light"];
const FALLBACK: Rgba = { r: 0, g: 0, b: 0, a: 1 };

function emptyOverrides(): Overrides {
  return { dark: {}, light: {} };
}

function buildOverrideCss(overrides: Overrides): string {
  const block = (selector: string, map: ThemeOverrides) => {
    const entries = Object.entries(map);
    if (entries.length === 0) return "";
    return `${selector}{${entries.map(([key, value]) => `${key}:${value};`).join("")}}`;
  };
  return (
    block('html[data-theme="dark"]', overrides.dark) +
    block('html[data-theme="light"]', overrides.light)
  );
}

function writeOverrideStyle(overrides: Overrides) {
  if (typeof document === "undefined") return;
  let el = document.getElementById(OVERRIDE_STYLE_ID) as HTMLStyleElement | null;
  if (!el) {
    el = document.createElement("style");
    el.id = OVERRIDE_STYLE_ID;
    document.head.appendChild(el);
  }
  el.textContent = buildOverrideCss(overrides);
}

function persistOverrides(envelope: StoredEnvelopeV2) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(envelope));
  } catch {
    // Non-fatal: preview still works for the session.
  }
}

/** Read both themes' pristine authored token values straight from the CSS by
 *  briefly flipping `data-theme` — restored before paint, so no visible flash. */
function snapshotDefaults(): ThemeDefaults {
  const result: ThemeDefaults = { dark: {}, light: {} };
  if (typeof document === "undefined") return result;

  const root = document.documentElement;
  const hadTheme = root.hasAttribute("data-theme");
  const previous = root.getAttribute("data-theme");
  const overrideEl = document.getElementById(OVERRIDE_STYLE_ID);
  const overrideText = overrideEl?.textContent ?? "";
  if (overrideEl) overrideEl.textContent = "";

  for (const theme of THEMES) {
    root.dataset.theme = theme;
    const computed = getComputedStyle(root);
    for (const id of ALL_TOKEN_IDS) {
      result[theme][id] = computed.getPropertyValue(id).trim();
    }
  }

  if (hadTheme && previous) root.setAttribute("data-theme", previous);
  else root.removeAttribute("data-theme");
  if (overrideEl) overrideEl.textContent = overrideText;
  return result;
}

export function PaletteLab() {
  const [mounted, setMounted] = useState(false);
  // Open state lives in a shared store so the footer / homepage triggers can
  // drive this single globally-mounted panel.
  const open = usePaletteLabOpen();
  const [theme, setTheme] = useState<ThemeName>("dark");
  const [overrides, setOverrides] = useState<Overrides>(emptyOverrides);
  const [presetId, setPresetId] = useState<PalettePresetId>(DEFAULT_PRESET_ID);
  const [defaults, setDefaults] = useState<ThemeDefaults | null>(null);
  const [view, setView] = useState<ViewMode>("essentials");
  const [selectedToken, setSelectedToken] = useState<string | null>(null);
  // The merged selection is anchored to a stable representative token id, not a
  // color string — so a drag can't desync the selection through alpha rounding.
  const [selectedRepId, setSelectedRepId] = useState<string | null>(null);
  const [epoch, setEpoch] = useState(0);
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(
    () => new Set(PALETTE_GROUPS.filter((group) => group.major).map((group) => group.id)),
  );
  const [jsonDraft, setJsonDraft] = useState("");
  const [jsonDirty, setJsonDirty] = useState(false);
  const [jsonError, setJsonError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [jsonOpen, setJsonOpen] = useState(false);
  // Stash the state a reset / preset apply wiped so it can be undone within a window.
  const [resetUndo, setResetUndo] = useState<UndoState | null>(null);
  const resetUndoTimer = useRef<number | null>(null);

  // Eyedropper / click-to-edit.
  const [picking, setPicking] = useState(false);
  const [hoverRect, setHoverRect] = useState<DOMRect | null>(null);
  const [hoverLabel, setHoverLabel] = useState("");
  const [pickMenu, setPickMenu] = useState<PickMenuState | null>(null);
  const [pickToast, setPickToast] = useState<{ x: number; y: number } | null>(null);
  const ruleIndexRef = useRef<ThemeRuleIndex | null>(null);
  const lastPickTargetRef = useRef<Element | null>(null);
  const persistenceTimer = useRef<number | null>(null);
  const pendingPersistence = useRef<StoredEnvelopeV2 | null>(null);

  useEffect(() => {
    setMounted(true);
    setTheme(readInitialTheme());

    let stored: Overrides = emptyOverrides();
    let storedPresetId: PalettePresetId = DEFAULT_PRESET_ID;
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as StoredEnvelopeV2 | Partial<Overrides> | null;
        const maps: Partial<Overrides> | undefined =
          parsed && typeof parsed === "object" && "version" in parsed && parsed.version === 2
            ? (parsed as StoredEnvelopeV2).overrides
            : ((parsed ?? undefined) as Partial<Overrides> | undefined);
        if (parsed && typeof parsed === "object" && "version" in parsed && parsed.version === 2) {
          // Unknown ids (renamed / removed presets) degrade to the default.
          const rawId = (parsed as StoredEnvelopeV2).presetId;
          storedPresetId = isKnownPresetId(rawId) ? rawId : DEFAULT_PRESET_ID;
        }
        stored = {
          dark: maps?.dark && typeof maps.dark === "object" ? maps.dark : {},
          light: maps?.light && typeof maps.light === "object" ? maps.light : {},
        };
      }
    } catch {
      stored = emptyOverrides();
    }

    setDefaults(snapshotDefaults());
    setPresetId(storedPresetId);
    setOverrides(stored);
    writeOverrideStyle(mergeOverrides(getPreset(storedPresetId).overrides, stored));
  }, []);

  useEffect(() => {
    if (!mounted) return;
    const root = document.documentElement;
    const observer = new MutationObserver(() => {
      const next = root.dataset.theme;
      if (next === "dark" || next === "light") {
        setTheme((current) => (current === next ? current : next));
      }
    });
    observer.observe(root, { attributes: true, attributeFilter: ["data-theme"] });
    return () => observer.disconnect();
  }, [mounted]);

  // What actually renders: the active preset's overrides with the user's own
  // edits merged on top (user wins per token).
  const activePreset = getPreset(presetId);
  const effectiveOverrides = useMemo(
    () => mergeOverrides(activePreset.overrides, overrides),
    [activePreset, overrides],
  );

  useEffect(() => {
    if (!mounted) return;
    writeOverrideStyle(effectiveOverrides);
    pendingPersistence.current = { version: 2, presetId, overrides };
    if (persistenceTimer.current !== null) window.clearTimeout(persistenceTimer.current);
    persistenceTimer.current = window.setTimeout(() => {
      persistenceTimer.current = null;
      const envelope = pendingPersistence.current;
      pendingPersistence.current = null;
      if (envelope) persistOverrides(envelope);
    }, PERSIST_DELAY_MS);
  }, [effectiveOverrides, overrides, presetId, mounted]);

  // Flush the debounced write on unmount and on pagehide — unmount cleanup
  // never runs when the tab closes, and edits made within the debounce window
  // would otherwise be lost.
  useEffect(() => {
    const flush = () => {
      if (persistenceTimer.current !== null) {
        window.clearTimeout(persistenceTimer.current);
        persistenceTimer.current = null;
      }
      const envelope = pendingPersistence.current;
      pendingPersistence.current = null;
      if (envelope) persistOverrides(envelope);
    };
    window.addEventListener("pagehide", flush);
    return () => {
      window.removeEventListener("pagehide", flush);
      flush();
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setPaletteLabOpen(false);
        getPaletteLabOpener()?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  // Split the page when open: a class on <html> makes the layout reserve a right
  // gutter (desktop-only, via CSS) the panel fills, so content reflows beside it
  // like a real side menu instead of being covered.
  useEffect(() => {
    if (!mounted) return;
    document.documentElement.classList.toggle("pl-sidebar-open", open);
    return () => {
      document.documentElement.classList.remove("pl-sidebar-open");
    };
  }, [open, mounted]);

  // Clear any pending reset-undo timer when the lab unmounts.
  useEffect(
    () => () => {
      if (resetUndoTimer.current !== null) window.clearTimeout(resetUndoTimer.current);
    },
    [],
  );

  const currentValue = useCallback(
    (id: string): string => effectiveOverrides[theme][id] ?? defaults?.[theme]?.[id] ?? "",
    [effectiveOverrides, theme, defaults],
  );

  /** Tokens grouped by the sRGB color they currently resolve to. Editing one
   *  group writes every member at once, so identical colors stay in sync. */
  const colorGroups = useMemo<ColorGroup[]>(() => {
    if (!defaults) return [];
    const map = new Map<string, ColorGroup>();
    ALL_TOKEN_IDS.forEach((id, index) => {
      const token = getToken(id);
      if (!token || token.kind !== "color") return;
      // Primitive seeds live only in their own group, never the merged catalog.
      if (id.startsWith("--c-") || id.startsWith("--h-")) return;
      const value = effectiveOverrides[theme][id] ?? defaults[theme][id] ?? "";
      const parsed = parseColorToRgba(value);
      const canonical = parsed ? formatColor(parsed) : value.trim();
      if (!canonical) return;
      const key = `color:${canonical}`;
      const existing = map.get(key);
      if (existing) existing.ids.push(id);
      else map.set(key, { key, value: canonical, ids: [id], firstIndex: index });
    });
    return [...map.values()].sort(
      (a, b) => b.ids.length - a.ids.length || a.firstIndex - b.firstIndex,
    );
  }, [theme, effectiveOverrides, defaults]);

  const sharedCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const group of colorGroups) {
      for (const id of group.ids) counts.set(id, group.ids.length);
    }
    return counts;
  }, [colorGroups]);

  const setTokenValues = useCallback(
    (ids: string[], value: string) => {
      setOverrides((prev) => {
        const nextThemeMap = { ...prev[theme] };
        for (const id of ids) {
          // The revert baseline is what renders with no user edit: the active
          // preset's value when it supplies this token, else the authored default.
          const baseline = activePreset.overrides[theme][id] ?? defaults?.[theme]?.[id];
          if (baseline !== undefined && value.trim() === baseline.trim()) delete nextThemeMap[id];
          else nextThemeMap[id] = value;
        }
        return { ...prev, [theme]: nextThemeMap };
      });
    },
    [theme, defaults, activePreset],
  );

  const selectToken = useCallback((id: string) => {
    setSelectedToken(id);
    setEpoch((value) => value + 1);
  }, []);

  const selectColorRep = useCallback((repId: string) => {
    setSelectedRepId(repId);
    setEpoch((value) => value + 1);
  }, []);

  const setEditingTheme = useCallback((next: ThemeName) => {
    setTheme(next);
    applyThemeToDocument(next);
    persistTheme(next);
    setEpoch((value) => value + 1);
  }, []);

  const switchView = useCallback(
    (next: ViewMode) => {
      setView(next);
      if (next === "merged") {
        if (!selectedRepId) setSelectedRepId(colorGroups[0]?.ids[0] ?? null);
      } else if (next === "essentials") {
        // Essentials shares the single-token editor path with the sections
        // view, but its curated subset; anchor to a token actually shown here.
        if (!selectedToken || !getEssential(selectedToken)) {
          setSelectedToken(ESSENTIAL_IDS[0] ?? null);
        }
      } else if (!selectedToken) {
        setSelectedToken(ALL_TOKEN_IDS[0]);
      }
      setEpoch((value) => value + 1);
    },
    [selectedRepId, selectedToken, colorGroups],
  );

  // When the panel opens, make sure something is selected to edit. Mirrors the
  // per-view default the old open handler applied.
  useEffect(() => {
    if (!open) return;
    if (view === "merged") {
      if (!selectedRepId) {
        const firstRep = colorGroups[0]?.ids[0];
        if (firstRep) {
          setSelectedRepId(firstRep);
          setEpoch((value) => value + 1);
        }
      }
    } else if (view === "essentials") {
      if (!selectedToken || !getEssential(selectedToken)) {
        setSelectedToken(ESSENTIAL_IDS[0] ?? null);
        setEpoch((value) => value + 1);
      }
    } else if (!selectedToken) {
      setSelectedToken(ALL_TOKEN_IDS[0]);
      setEpoch((value) => value + 1);
    }
  }, [open, view, selectedToken, selectedRepId, colorGroups]);

  const changedCount = useMemo(
    () => Object.keys(overrides.dark).length + Object.keys(overrides.light).length,
    [overrides],
  );

  // Export the merged effective overrides so a copied blob reproduces the
  // current look standalone — preset layer included.
  const exportJson = useMemo(() => JSON.stringify(effectiveOverrides, null, 2), [effectiveOverrides]);
  const jsonValue = jsonDirty ? jsonDraft : exportJson;

  const copyJson = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(exportJson);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setJsonDraft(exportJson);
      setJsonDirty(true);
      setJsonError("Clipboard blocked — select the JSON above and copy it manually.");
    }
  }, [exportJson]);

  const applyJson = useCallback(() => {
    const text = jsonValue.trim();
    let parsed: Partial<Overrides>;
    try {
      parsed = JSON.parse(text) as Partial<Overrides>;
    } catch {
      setJsonError("That isn't valid JSON.");
      return;
    }
    const validDark = !!parsed?.dark && typeof parsed.dark === "object";
    const validLight = !!parsed?.light && typeof parsed.light === "object";
    // Refuse to apply when neither theme object is present, rather than wiping
    // both to empty. When only one is valid, merge — keep the other theme's work.
    if (!validDark && !validLight) {
      setJsonError('Needs a "dark" and/or "light" color object.');
      return;
    }
    // Pasted JSON describes the full look standalone, so it lands as user
    // overrides on the default preset. A theme the paste omits keeps what is
    // currently rendered (preset layer included) rather than losing it.
    setOverrides((prev) => {
      const effective = mergeOverrides(activePreset.overrides, prev);
      return {
        dark: validDark ? (parsed.dark as ThemeOverrides) : effective.dark,
        light: validLight ? (parsed.light as ThemeOverrides) : effective.light,
      };
    });
    setPresetId(DEFAULT_PRESET_ID);
    setEpoch((value) => value + 1);
    setJsonDirty(false);
    setJsonError(null);
  }, [jsonValue, activePreset]);

  // Arm an undo bar with the full state a reset / preset apply is about to
  // replace. The bar auto-dismisses after a window.
  const armResetUndo = useCallback((undo: UndoState) => {
    if (resetUndoTimer.current !== null) window.clearTimeout(resetUndoTimer.current);
    setResetUndo(undo);
    resetUndoTimer.current = window.setTimeout(() => {
      setResetUndo(null);
      resetUndoTimer.current = null;
    }, RESET_UNDO_MS);
  }, []);

  // Resets clear the user's edits back to the active preset (the preset layer
  // stays); returning to stock is choosing the default preset in Palettes.
  const resetTheme = useCallback(() => {
    setOverrides((prev) => {
      const count = Object.keys(prev[theme]).length;
      if (count > 0) armResetUndo({ overrides: prev, presetId, count, kind: "reset" });
      return { ...prev, [theme]: {} };
    });
    setEpoch((value) => value + 1);
  }, [theme, presetId, armResetUndo]);

  const resetAll = useCallback(() => {
    setOverrides((prev) => {
      const count = Object.keys(prev.dark).length + Object.keys(prev.light).length;
      if (count > 0) armResetUndo({ overrides: prev, presetId, count, kind: "reset" });
      return emptyOverrides();
    });
    setEpoch((value) => value + 1);
  }, [presetId, armResetUndo]);

  const undoReset = useCallback(() => {
    if (!resetUndo) return;
    if (resetUndoTimer.current !== null) {
      window.clearTimeout(resetUndoTimer.current);
      resetUndoTimer.current = null;
    }
    setOverrides(resetUndo.overrides);
    setPresetId(resetUndo.presetId);
    setResetUndo(null);
    setEpoch((value) => value + 1);
  }, [resetUndo]);

  // Apply a preset: both themes at once, user edits cleared (undoable).
  const applyPreset = useCallback(
    (next: PalettePresetId) => {
      setOverrides((prev) => {
        const count = Object.keys(prev.dark).length + Object.keys(prev.light).length;
        if (next === presetId && count === 0) return prev;
        armResetUndo({ overrides: prev, presetId, count, kind: "preset" });
        return emptyOverrides();
      });
      setPresetId(next);
      setEpoch((value) => value + 1);
    },
    [presetId, armResetUndo],
  );

  const openAdvanced = useCallback(() => setJsonOpen(true), []);

  const toggleGroup = useCallback((id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  // Bind the editor to a token picked from the page: jump to the view that
  // shows it (Essentials if curated, otherwise All colors with its group open),
  // select it, and leave pick mode.
  const applyPick = useCallback((candidate: PickCandidate) => {
    if (getEssential(candidate.id)) {
      setView("essentials");
    } else {
      setView("sections");
      const group = PALETTE_GROUPS.find((g) => g.tokens.some((t) => t.id === candidate.id));
      if (group) setExpanded((prev) => new Set(prev).add(group.id));
    }
    setSelectedToken(candidate.id);
    setEpoch((value) => value + 1);
    setPickMenu(null);
    setPicking(false);
  }, []);

  const togglePick = useCallback(() => {
    setPickMenu(null);
    setPickToast(null);
    setPicking((on) => !on);
  }, []);

  // Pick-mode listeners: outline the hovered element, intercept the next click
  // anywhere on the page, and resolve it to its editable token(s). Clicks inside
  // the lab or its overlays pass through so the panel and menu stay usable.
  useEffect(() => {
    if (!picking || !mounted) return;
    ruleIndexRef.current = buildThemeRuleIndex(theme);
    const previousCursor = document.body.style.cursor;
    document.body.style.cursor = "crosshair";

    const isOwn = (t: EventTarget | null) =>
      t instanceof Element && (!!t.closest("[data-palette-lab]") || !!t.closest("[data-pl-overlay]"));

    const targetsAtPoint = (event: MouseEvent) => {
      const elements =
        typeof document.elementsFromPoint === "function"
          ? document.elementsFromPoint(event.clientX, event.clientY)
          : [document.elementFromPoint(event.clientX, event.clientY)].filter(Boolean);
      return elements.filter((element) => !isOwn(element));
    };

    const pickCandidatesForElements = (elements: Element[]) => {
      const seen = new Set<string>();
      const candidates: PickCandidate[] = [];
      for (const element of elements) {
        const elementCandidates = ruleIndexRef.current
          ? resolveTokensAt(element, ruleIndexRef.current)
          : [];
        for (const candidate of elementCandidates) {
          const key = `${candidate.role}:${candidate.id}`;
          if (seen.has(key)) continue;
          seen.add(key);
          candidates.push(candidate);
        }
      }
      return candidates;
    };

    const onMove = (event: MouseEvent) => {
      const eventTarget = event.target;
      if (eventTarget instanceof Element && eventTarget === lastPickTargetRef.current) return;
      lastPickTargetRef.current = eventTarget instanceof Element ? eventTarget : null;
      const targets = targetsAtPoint(event);
      const target = targets[0] ?? null;
      if (!target || isOwn(target)) {
        setHoverRect(null);
        setHoverLabel("");
        return;
      }
      setHoverRect(target.getBoundingClientRect());
      const candidates = pickCandidatesForElements(targets);
      setHoverLabel(candidates.map((c) => c.label).join(" · "));
    };

    const onClick = (event: MouseEvent) => {
      if (isOwn(event.target)) return; // let the lab / menu handle their own clicks
      const targets = targetsAtPoint(event);
      const target = targets[0] ?? null;
      if (!target || isOwn(target)) return;
      event.preventDefault();
      event.stopPropagation();
      const candidates = pickCandidatesForElements(targets);
      if (candidates.length === 0) {
        setPickMenu(null);
        setPickToast({ x: event.clientX, y: event.clientY });
        window.setTimeout(() => setPickToast(null), 1800);
        return;
      }
      if (candidates.length === 1) {
        applyPick(candidates[0]);
        return;
      }
      setPickToast(null);
      setPickMenu({
        x: Math.min(event.clientX, window.innerWidth - 232),
        y: Math.min(event.clientY, window.innerHeight - 40 - candidates.length * 44),
        candidates,
      });
    };

    const onDown = (event: MouseEvent) => {
      const target = event.target as Element | null;
      if (target && !isOwn(target)) {
        event.preventDefault();
        event.stopPropagation();
      }
    };

    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        setPickMenu(null);
        setPicking(false);
      }
    };

    document.addEventListener("mouseover", onMove, true);
    document.addEventListener("mousedown", onDown, true);
    document.addEventListener("click", onClick, true);
    document.addEventListener("keydown", onKey, true);

    return () => {
      document.body.style.cursor = previousCursor;
      document.removeEventListener("mouseover", onMove, true);
      document.removeEventListener("mousedown", onDown, true);
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("keydown", onKey, true);
      setHoverRect(null);
      setHoverLabel("");
      lastPickTargetRef.current = null;
    };
  }, [picking, mounted, theme, applyPick]);

  const normalizedQuery = query.trim().toLowerCase();
  const matchesToken = useCallback(
    (token: PaletteToken) =>
      normalizedQuery.length === 0 ||
      token.label.toLowerCase().includes(normalizedQuery) ||
      token.id.toLowerCase().includes(normalizedQuery),
    [normalizedQuery],
  );
  const filteredEssentialGroups = useMemo(
    () =>
      ESSENTIALS.map((group) => ({
        ...group,
        items: group.items.filter(
          (item) =>
            normalizedQuery.length === 0 ||
            item.label.toLowerCase().includes(normalizedQuery) ||
            item.id.toLowerCase().includes(normalizedQuery),
        ),
      })).filter((group) => group.items.length > 0),
    [normalizedQuery],
  );
  const filteredPaletteGroups = useMemo(
    () =>
      PALETTE_GROUPS.map((group) => ({
        ...group,
        visibleTokens: group.tokens.filter(matchesToken),
      })).filter((group) => group.visibleTokens.length > 0),
    [matchesToken],
  );

  // Resolve what the editor is bound to (a single token, or a merged group).
  // Essentials and the sections catalog both edit one token at a time via
  // `selectedToken`; only the labels and the catalog list differ.
  const singleToken =
    (view === "sections" || view === "essentials") && selectedToken
      ? getToken(selectedToken)
      : undefined;
  const essentialItem = view === "essentials" && selectedToken ? getEssential(selectedToken) : undefined;
  const mergedGroup =
    view === "merged" && selectedRepId
      ? colorGroups.find((group) => group.ids.includes(selectedRepId))
      : undefined;
  const editIds = singleToken ? [singleToken.id] : (mergedGroup?.ids ?? []);
  const editKind = singleToken ? singleToken.kind : "color";
  const editValue = singleToken
    ? currentValue(singleToken.id)
    : (mergedGroup?.value ?? "");
  const editOverridden = editIds.some((id) => overrides[theme][id] !== undefined);
  // True when every token bound to the editor is scoped to the *other* theme,
  // so dragging the wheel won't change anything in the theme being edited.
  const editInert = editIds.length > 0 && editIds.every((id) => isInertInTheme(id, theme));
  const editInertScope = editInert ? tokenThemeScope(editIds[0]) : "both";
  // A translucent fill tints rather than floods — the page behind shows through,
  // which is why a "bright" edit can look like almost nothing. Surface that.
  const editAlpha = editKind === "color" ? (parseColorToRgba(editValue)?.a ?? 1) : 1;
  const editTranslucent = editKind === "color" && editAlpha < 0.6;

  const applyColor = useCallback(
    (rgba: Rgba) => {
      const value = editKind === "channels" ? formatChannels(rgba) : formatColor(rgba);
      setTokenValues(editIds, value);
      // No selection bookkeeping needed: the merged group is rediscovered each
      // render from the stable representative id, so it follows the edit.
    },
    [editIds, editKind, setTokenValues],
  );

  const resetEditTarget = useCallback(() => {
    setOverrides((prev) => {
      const nextThemeMap = { ...prev[theme] };
      for (const id of editIds) delete nextThemeMap[id];
      return { ...prev, [theme]: nextThemeMap };
    });
    setEpoch((value) => value + 1);
  }, [editIds, theme]);

  // The trigger lives elsewhere (footer / homepage); this component is only the
  // globally-mounted panel, so render nothing until mounted or while closed.
  if (!mounted) return null;

  // Shared undo affordance, shown both beside the preset cards and in the
  // Advanced drawer while the undo window is open.
  const undoBar = resetUndo && (
    <div className={styles.resetUndoBar} role="status">
      <span>
        {resetUndo.kind === "preset"
          ? `Applied ${activePreset.name}${
              resetUndo.count > 0
                ? ` — replaced ${resetUndo.count} edit${resetUndo.count === 1 ? "" : "s"}`
                : ""
            }`
          : `Reset ${resetUndo.count} color${resetUndo.count === 1 ? "" : "s"}`}
      </span>
      <button type="button" className={styles.resetUndoButton} onClick={undoReset}>
        <Icon icon="lucide:undo-2" size={13} />
        <span>Undo</span>
      </button>
    </div>
  );

  const panel = (
    <div
      className={`${styles.panel} ${open ? "" : styles.panelClosed}`.trim()}
      role="dialog"
      aria-modal="false"
      aria-label="Palette Lab"
      aria-hidden={open ? undefined : true}
      id="palette-lab-panel"
      data-palette-lab=""
    >
      <header className={styles.panelHeader}>
        <div className={styles.titleBlock}>
          <span className={styles.titleWheel} aria-hidden="true" />
          <div>
            <h2 className={styles.title}>Palette Lab</h2>
            <p className={styles.subtitle}>Live recolor · saved to this browser</p>
          </div>
        </div>
        <div className={styles.headerActions}>
          <button
            type="button"
            className={`${styles.closeButton} ${picking ? styles.pickToggleActive : ""}`}
            aria-pressed={picking}
            aria-label={picking ? "Cancel picking from the page" : "Pick a color from the page"}
            title="Pick a color from the page"
            onClick={togglePick}
          >
            <Icon icon="lucide:pipette" size={15} />
          </button>
          <button
            type="button"
            className={styles.closeButton}
            aria-label="Close Palette Lab"
            onClick={() => {
              setPaletteLabOpen(false);
              getPaletteLabOpener()?.focus();
            }}
          >
            <Icon icon="lucide:x" size={16} />
          </button>
        </div>
      </header>

      {picking && (
        <p className={styles.pickBanner} role="status">
          <Icon icon="lucide:pipette" size={13} />
          <span>
            Click anything on the page to edit its color. <kbd>Esc</kbd> to cancel.
          </span>
        </p>
      )}

      <div className={styles.themeSwitch} role="group" aria-label="Theme being edited">
        {THEMES.map((name) => (
          <button
            key={name}
            type="button"
            className={`${styles.themeChip} ${theme === name ? styles.themeChipActive : ""}`}
            aria-pressed={theme === name}
            aria-label={`Edit ${name} theme`}
            title={`Edit ${name} theme`}
            onClick={() => setEditingTheme(name)}
          >
            <Icon icon={name === "dark" ? "lucide:moon" : "lucide:sun"} size={15} />
          </button>
        ))}
        {changedCount === 0 ? (
          <span className={styles.changedBadge}>No changes</span>
        ) : (
          <button
            type="button"
            className={`${styles.changedBadge} ${styles.changedBadgeButton}`}
            title="Open Advanced to export or import these changes"
            onClick={openAdvanced}
          >
            {changedCount} changed
          </button>
        )}
      </div>

      <div className={styles.editor}>
        {editIds.length === 0 ? (
          <p className={styles.editorEmpty}>Pick a swatch below to start editing.</p>
        ) : (
          <>
            <div className={styles.editorMeta}>
              {singleToken ? (
                essentialItem ? (
                  <>
                    <span className={styles.editorTokenLabel}>{essentialItem.label}</span>
                    <p className={styles.editorHint}>{essentialItem.hint}</p>
                  </>
                ) : (
                  <>
                    <code className={styles.editorTokenId}>{singleToken.id}</code>
                    <span className={styles.editorTokenLabel}>{singleToken.label}</span>
                    {singleToken.hint && <p className={styles.editorHint}>{singleToken.hint}</p>}
                  </>
                )
              ) : (
                <>
                  <span className={styles.editorTokenLabel}>
                    {editIds.length} token{editIds.length > 1 ? "s" : ""} share this color
                  </span>
                  <ul className={styles.mergedMembers}>
                    {editIds.map((id) => (
                      <li key={id} className={styles.mergedMember}>
                        {getToken(id)?.label ?? id}
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </div>
            {editInert && (
              <p className={styles.editorScopeNote}>
                <Icon icon="lucide:info" size={13} />
                <span>
                  Only affects the <strong>{editInertScope}</strong> theme — switch the theme toggle
                  above to {editInertScope} to see this change.
                </span>
              </p>
            )}
            {editTranslucent && !editInert && (
              <p className={styles.editorAlphaNote}>
                <Icon icon="lucide:layers" size={13} />
                <span>
                  Translucent ({Math.round(editAlpha * 100)}%) — the color behind shows through, so
                  changes here look like a tint. Raise the opacity slider, or edit the surface under it.
                </span>
              </p>
            )}
            {editKind === "color" || editKind === "channels" ? (
              <ColorWheel
                key={`${theme}:${epoch}`}
                initial={
                  (editKind === "channels"
                    ? parseChannelsToRgba(editValue)
                    : parseColorToRgba(editValue)) ?? FALLBACK
                }
                onChange={applyColor}
              />
            ) : (
              <label className={styles.rawEditor}>
                <span className={styles.fieldCaption}>Raw CSS value (gradient / shadow)</span>
                <textarea
                  key={`${theme}:${epoch}`}
                  className={styles.rawTextarea}
                  spellCheck={false}
                  defaultValue={editValue}
                  onChange={(event) => setTokenValues(editIds, event.target.value)}
                />
                <span className={styles.rawPreview} style={{ background: editValue }} aria-hidden="true" />
              </label>
            )}
            <button
              type="button"
              className={styles.resetTokenButton}
              disabled={!editOverridden}
              onClick={resetEditTarget}
            >
              <Icon icon="lucide:rotate-ccw" size={13} />
              {editIds.length > 1 ? `Reset these ${editIds.length}` : "Reset this token"}
            </button>
          </>
        )}
      </div>

      <div className={styles.viewTabs} role="group" aria-label="Catalog view">
        {VIEW_TABS.map(({ mode, label, hint }) => (
          <button
            key={mode}
            type="button"
            className={`${styles.viewTab} ${mode === "essentials" ? styles.viewTabPrimary : styles.viewTabSecondary} ${view === mode ? styles.viewTabActive : ""}`}
            aria-pressed={view === mode}
            title={hint}
            onClick={() => switchView(mode)}
          >
            {label}
          </button>
        ))}
      </div>

      <div className={styles.toolbar}>
        <div className={styles.searchWrap}>
          <Icon icon="lucide:search" size={14} className={styles.searchIcon} />
          <input
            type="search"
            value={query}
            placeholder="Filter colors…"
            className={styles.searchInput}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
      </div>

      <div className={styles.scrollBody}>
        <div className={styles.catalog}>
        {normalizedQuery.length === 0 && (
          <section className={styles.group} aria-label="Palettes">
            <div className={styles.essentialHead}>
              <span className={styles.groupTitle}>Palettes</span>
            </div>
            <p className={styles.essentialBlurb}>
              Complete looks — dark and light together. Pick one as a starting point; every color
              stays editable on top.
            </p>
            {resetUndo?.kind === "preset" && undoBar}
            <ul className={styles.presetList}>
              {PALETTE_PRESETS.map((preset) => {
                const isActive = preset.id === presetId;
                const modified = isActive && changedCount > 0;
                return (
                  <li key={preset.id}>
                    <button
                      type="button"
                      className={`${styles.presetCard} ${isActive ? styles.presetCardActive : ""}`}
                      aria-pressed={isActive}
                      title={preset.tagline}
                      onClick={() => applyPreset(preset.id)}
                    >
                      <span className={styles.presetName}>
                        {preset.name}
                        {isActive && (
                          <span className={styles.presetActiveBadge}>
                            {modified ? "active · edited" : "active"}
                          </span>
                        )}
                      </span>
                      <span className={styles.presetStrips} aria-hidden="true">
                        {(["dark", "light"] as const).map((strip) => (
                          <span key={strip} className={styles.presetStrip}>
                            {preset.swatch[strip].map((hex, index) => (
                              <span key={`${strip}-${index}`} style={{ background: hex }} />
                            ))}
                          </span>
                        ))}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        )}
          {view === "essentials" ? (
            filteredEssentialGroups.length === 0 ? (
              <p className={styles.mergedHint}>No colors match your search.</p>
            ) : (
              filteredEssentialGroups.map((group) => {
                return (
                  <section key={group.id} className={styles.group}>
                    <div className={styles.essentialHead}>
                      <span className={styles.groupTitle}>{group.title}</span>
                    </div>
                    {group.blurb && <p className={styles.essentialBlurb}>{group.blurb}</p>}
                    <ul className={styles.tokenList}>
                      {group.items.map((item) => {
                        const token = getToken(item.id);
                        if (!token) return null;
                        const value = currentValue(item.id);
                        const parsed =
                          token.kind === "channels"
                            ? parseChannelsToRgba(value)
                            : parseColorToRgba(value);
                        const swatchBg = token.kind === "channels" ? `rgb(${value})` : value;
                        const isActive = selectedToken === item.id;
                        const isOverridden = overrides[theme][item.id] !== undefined;
                        const inert = isInertInTheme(item.id, theme);
                        return (
                          <li key={item.id}>
                            <button
                              type="button"
                              className={`${styles.tokenRow} ${isActive ? styles.tokenRowActive : ""} ${inert ? styles.tokenRowInert : ""}`}
                              onClick={() => selectToken(item.id)}
                            >
                              <span className={styles.tokenSwatch} aria-hidden="true">
                                <span
                                  className={styles.tokenSwatchFill}
                                  style={{ background: swatchBg }}
                                />
                              </span>
                              <span className={styles.tokenLabel}>
                                {item.label}
                                {inert && (
                                  <span
                                    className={styles.scopeBadge}
                                    title={`Only affects the ${tokenThemeScope(item.id)} theme`}
                                  >
                                    {tokenThemeScope(item.id)} only
                                  </span>
                                )}
                              </span>
                              <span className={styles.tokenValue}>
                                {parsed ? describeColor(parsed) : value}
                              </span>
                              {isOverridden && (
                                <span className={styles.tokenDot} aria-label="changed" />
                              )}
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  </section>
                );
              })
            )
          ) : view === "merged" ? (
            <MergedList
              groups={colorGroups}
              query={normalizedQuery}
              activeKey={mergedGroup?.key ?? null}
              theme={theme}
              onSelect={selectColorRep}
              isOverridden={(id) => overrides[theme][id] !== undefined}
            />
          ) : filteredPaletteGroups.length === 0 ? (
            <p className={styles.mergedHint}>No colors match your search.</p>
          ) : (
            filteredPaletteGroups.map((group) => {
              const visibleTokens = group.visibleTokens;
              const isOpen = normalizedQuery.length > 0 || expanded.has(group.id);
              return (
                <section key={group.id} className={styles.group}>
                  <button
                    type="button"
                    className={styles.groupHeader}
                    aria-expanded={isOpen}
                    onClick={() => toggleGroup(group.id)}
                  >
                    <span
                      className={`${styles.groupCaret} ${isOpen ? styles.groupCaretOpen : ""}`}
                      aria-hidden="true"
                    >
                      <Icon icon="lucide:chevron-right" size={16} />
                    </span>
                    <span className={styles.groupTitle}>{group.title}</span>
                    <span className={styles.groupCount}>{group.tokens.length}</span>
                  </button>
                  {isOpen && (
                    <>
                      {group.blurb && <p className={styles.groupBlurb}>{group.blurb}</p>}
                      <ul className={styles.tokenList}>
                        {visibleTokens.map((token) => {
                          const value = currentValue(token.id);
                          const parsed =
                            token.kind === "color"
                              ? parseColorToRgba(value)
                              : token.kind === "channels"
                                ? parseChannelsToRgba(value)
                                : null;
                          const swatchBg = token.kind === "channels" ? `rgb(${value})` : value;
                          const isActive = selectedToken === token.id;
                          const isOverridden = overrides[theme][token.id] !== undefined;
                          const shared = sharedCounts.get(token.id) ?? 1;
                          const inert = isInertInTheme(token.id, theme);
                          return (
                            <li key={token.id}>
                              <button
                                type="button"
                                className={`${styles.tokenRow} ${isActive ? styles.tokenRowActive : ""} ${inert ? styles.tokenRowInert : ""}`}
                                onClick={() => selectToken(token.id)}
                              >
                                <span className={styles.tokenSwatch} aria-hidden="true">
                                  <span
                                    className={styles.tokenSwatchFill}
                                    style={{ background: swatchBg }}
                                  />
                                </span>
                                <span className={styles.tokenLabel}>
                                  {token.label}
                                  {token.kind === "raw" && <span className={styles.rawTag}>raw</span>}
                                  {inert && (
                                    <span
                                      className={styles.scopeBadge}
                                      title={`Only affects the ${tokenThemeScope(token.id)} theme`}
                                    >
                                      {tokenThemeScope(token.id)} only
                                    </span>
                                  )}
                                  {shared > 1 && (
                                    <span
                                      className={styles.sharedBadge}
                                      title={`Shared by ${shared} tokens — open the Identical view to edit them together.`}
                                    >
                                      ×{shared}
                                    </span>
                                  )}
                                </span>
                                <span className={styles.tokenValue}>
                                  {parsed
                                    ? describeColor(parsed)
                                    : token.kind === "raw"
                                      ? "gradient"
                                      : value}
                                </span>
                                {isOverridden && (
                                  <span className={styles.tokenDot} aria-label="changed" />
                                )}
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    </>
                  )}
                </section>
              );
            })
          )}
        </div>
      </div>

      <div className={styles.jsonArea}>
        {/* Always-visible bar: a plain "copy" primary, a status badge, and the
            toggle that reveals the technical drawer (closed by default). */}
        <div className={styles.jsonBar}>
          <div className={styles.jsonBarTop}>
            <button
              type="button"
              className={styles.copyButton}
              aria-label="Copy colors"
              title="Copy these colors to the clipboard"
              onClick={copyJson}
            >
              <Icon icon={copied ? "lucide:check" : "lucide:copy"} size={14} />
              <span>{copied ? "Copied" : "Copy colors"}</span>
            </button>
          </div>
          <button
            type="button"
            className={`${styles.advancedToggle} ${jsonOpen ? styles.advancedToggleOpen : ""}`}
            aria-expanded={jsonOpen}
            aria-controls="palette-lab-advanced"
            onClick={() => setJsonOpen((value) => !value)}
          >
            <span className={styles.advancedToggleText}>
              <span className={styles.advancedToggleLabel}>Advanced</span>
              <span className={styles.advancedToggleHint}>export · import · reset</span>
            </span>
            <Icon
              icon="lucide:chevron-right"
              size={14}
              className={`${styles.advancedCaret} ${jsonOpen ? styles.advancedCaretOpen : ""}`}
            />
          </button>
        </div>

        {jsonOpen && (
          <div className={styles.advancedDrawer} id="palette-lab-advanced">
            {resetUndo?.kind === "reset" && undoBar}
            <span className={styles.fieldCaption}>JSON{jsonDirty ? " · edited" : ""}</span>
            <textarea
              className={styles.jsonTextarea}
              spellCheck={false}
              aria-label="Theme colors JSON"
              placeholder='{"dark":{…},"light":{…}}'
              value={jsonValue}
              onChange={(event) => {
                setJsonDraft(event.target.value);
                setJsonDirty(true);
                if (jsonError) setJsonError(null);
              }}
            />
            {jsonError && <p className={styles.importError}>{jsonError}</p>}
            <div className={styles.jsonActions}>
              <button
                type="button"
                className={styles.applyButton}
                disabled={!jsonDirty}
                aria-label="Apply JSON"
                title="Apply the JSON above"
                onClick={applyJson}
              >
                <Icon icon="lucide:check" size={14} />
                <span>Apply</span>
              </button>
              {jsonDirty && (
                <button
                  type="button"
                  className={styles.iconButton}
                  aria-label="Revert JSON edits"
                  title="Revert JSON edits"
                  onClick={() => {
                    setJsonDirty(false);
                    setJsonError(null);
                  }}
                >
                  <Icon icon="lucide:undo-2" size={15} />
                </button>
              )}
            </div>

            <div className={styles.dangerZone}>
              <span className={styles.dangerLabel}>Danger zone</span>
              <div className={styles.dangerActions}>
                <button
                  type="button"
                  className={styles.dangerButton}
                  aria-label={`Reset ${theme} theme`}
                  title={`Reset every color in the ${theme} theme`}
                  onClick={resetTheme}
                >
                  <Icon icon="lucide:rotate-ccw" size={14} />
                  <span>Reset this theme</span>
                </button>
                <button
                  type="button"
                  className={styles.dangerButton}
                  aria-label="Reset all themes"
                  title="Reset every color in both themes"
                  onClick={resetAll}
                >
                  <Icon icon="lucide:trash-2" size={14} />
                  <span>Reset everything</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );

  const pickLayer = (
    <>
      {picking && hoverRect && (
        <div
          data-pl-overlay=""
          className={styles.pickOverlay}
          style={{
            top: hoverRect.top,
            left: hoverRect.left,
            width: hoverRect.width,
            height: hoverRect.height,
          }}
          aria-hidden="true"
        >
          <span className={styles.pickOverlayLabel}>{hoverLabel || "Not themed yet"}</span>
        </div>
      )}
      {pickToast && (
        <div
          data-pl-overlay=""
          className={styles.pickToast}
          style={{ top: pickToast.y, left: pickToast.x }}
          role="status"
        >
          This part isn’t themed yet
        </div>
      )}
      {pickMenu && (
        <div
          data-pl-overlay=""
          className={styles.pickMenu}
          style={{ top: pickMenu.y, left: pickMenu.x }}
          role="menu"
          aria-label="Edit which color"
        >
          <p className={styles.pickMenuTitle}>Edit which color?</p>
          {pickMenu.candidates.map((candidate, index) => {
            const token = getToken(candidate.id);
            const value = currentValue(candidate.id);
            const swatchBg = token?.kind === "channels" ? `rgb(${value})` : value;
            return (
              <button
                key={`${candidate.role}:${candidate.id}`}
                type="button"
                role="menuitem"
                // eslint-disable-next-line jsx-a11y/no-autofocus
                autoFocus={index === 0}
                className={styles.pickMenuItem}
                onClick={() => applyPick(candidate)}
              >
                <span className={styles.tokenSwatch} aria-hidden="true">
                  <span className={styles.tokenSwatchFill} style={{ background: swatchBg }} />
                </span>
                <span className={styles.pickMenuRole}>{ROLE_LABEL[candidate.role]}</span>
                <span className={styles.pickMenuName}>{candidate.label}</span>
              </button>
            );
          })}
        </div>
      )}
    </>
  );

  return (
    <>
      {/* Always portaled (when mounted) so the panel can slide out on close in
          sync with the page reflow; the closed state hides it off-screen. */}
      {createPortal(panel, document.body)}
      {(picking || pickMenu || pickToast) && createPortal(pickLayer, document.body)}
    </>
  );
}

interface MergedListProps {
  groups: ColorGroup[];
  query: string;
  activeKey: string | null;
  theme: ThemeName;
  onSelect: (repId: string) => void;
  isOverridden: (id: string) => boolean;
}

function MergedList({ groups, query, activeKey, theme, onSelect, isOverridden }: MergedListProps) {
  const visible = groups.filter((group) => {
    if (!query) return true;
    if (group.value.toLowerCase().includes(query)) return true;
    return group.ids.some((id) => {
      const token = getToken(id);
      return (
        token?.label.toLowerCase().includes(query) || token?.id.toLowerCase().includes(query)
      );
    });
  });

  if (visible.length === 0) {
    return <p className={styles.mergedHint}>No colors match your search.</p>;
  }

  return (
    <ul className={styles.tokenList}>
      {visible.map((group) => {
        const parsed = parseColorToRgba(group.value);
        const first = getToken(group.ids[0]);
        const count = group.ids.length;
        const changed = group.ids.some(isOverridden);
        const inert = group.ids.every((id) => isInertInTheme(id, theme));
        return (
          <li key={group.key}>
            <button
              type="button"
              className={`${styles.tokenRow} ${activeKey === group.key ? styles.tokenRowActive : ""} ${inert ? styles.tokenRowInert : ""}`}
              onClick={() => onSelect(group.ids[0])}
            >
              <span className={styles.tokenSwatch} aria-hidden="true">
                <span className={styles.tokenSwatchFill} style={{ background: group.value }} />
              </span>
              <span className={styles.tokenLabel}>
                {first?.label ?? group.ids[0]}
                {inert && (
                  <span className={styles.scopeBadge} title={`Only affects the ${tokenThemeScope(group.ids[0])} theme`}>
                    {tokenThemeScope(group.ids[0])} only
                  </span>
                )}
                {count > 1 && (
                  <span
                    className={styles.sharedBadge}
                    title={`Editing all ${count} of these tokens together.`}
                  >
                    ×{count}
                  </span>
                )}
              </span>
              <span className={styles.tokenValue}>{parsed ? describeColor(parsed) : group.value}</span>
              {changed && <span className={styles.tokenDot} aria-label="changed" />}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
