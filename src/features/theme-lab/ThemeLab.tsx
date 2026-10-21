"use client";

import "./theme-lab.css";
import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTheme } from "@/context/ThemeContext";
import { Icon } from "@/components/common/Icon";
import { AppearanceAxes } from "@/features/appearance/AppearanceAxes";
import { AngleField } from "./AngleField";
import { ColorField } from "./ColorField";
import { FontField } from "./FontField";
import { LengthField } from "./LengthField";
import { FlatnessControls } from "./FlatnessControls";
import { BLUR_TOKEN_ID, blurDisabledIn } from "./themeLabStorage";
import { AdvancedDrawer } from "./AdvancedDrawer";
import { PickLayer, type PickMenuState } from "./PickLayer";
import {
  EssentialsView,
  MergedView,
  SectionsView,
  type ColorGroup,
} from "./CatalogViews";
import { PANEL_ICON, PanelBadge, PanelButton, PanelIconButton, PanelInput, PanelTab, PanelTextarea } from "./panelKit";
import { revealEditorElement } from "./revealEditor";
import {
  ALL_TOKEN_IDS,
  PALETTE_GROUPS,
  getEssential,
  getToken,
  isInertInTheme,
  tokenThemeScope,
} from "./paletteTokens";
import { getLengthSpec } from "./paletteTokensRadius";
import { getAngleSpec } from "./paletteTokensHues";
import {
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
  type ThemeRuleIndex,
} from "./pickToken";
import {
  getThemeLabOpener,
  setActiveEdits,
  setThemeLabOpen,
  useThemeLabOpen,
  useThemeLabTheme,
} from "./themeLabStore";
import { emptyOverrides } from "./themeLabStorage";
import { lookKey } from "./themeLabLook";
import { activeEditCount, activeEdits, effectiveOverrides } from "./themeLabTheme";
import {
  editsFromImport,
  parseThemeImport,
  serializeThemeExport,
} from "./themeLabExport";
import { getThemeBaselines, type ThemeDefaults } from "./presetBaselines";
import styles from "./ThemeLab.module.css";

type ViewMode = "essentials" | "sections" | "merged";

const VIEW_TABS: { mode: ViewMode; label: string; hint: string }[] = [
  { mode: "essentials", label: "Essentials", hint: "The key colors, plainly named" },
  { mode: "sections", label: "All colors", hint: "Every color, grouped" },
  {
    mode: "merged",
    label: "Identical",
    hint: "Colors identical right now; edit once to change them all",
  },
];

const FALLBACK: Rgba = { r: 0, g: 0, b: 0, a: 1 };

export function ThemeLab() {
  const [mounted, setMounted] = useState(false);
  const rawFieldId = useId();
  const open = useThemeLabOpen();
  const themeState = useThemeLabTheme();
  const { look, storageOk } = themeState;
  const overrides = useMemo(() => activeEdits(themeState), [themeState]);
  const baselineKey = lookKey(look);
  const { colorScheme: theme, visualStyle } = useTheme();
  const [defaults, setDefaults] = useState<ThemeDefaults | null>(null);
  const [view, setView] = useState<ViewMode>("essentials");
  const [selectedToken, setSelectedToken] = useState<string | null>(null);
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

  const [picking, setPicking] = useState(false);
  const [hoverRect, setHoverRect] = useState<DOMRect | null>(null);
  const [hoverLabel, setHoverLabel] = useState("");
  const [pickMenu, setPickMenu] = useState<PickMenuState | null>(null);
  const [pickToast, setPickToast] = useState<{ x: number; y: number } | null>(null);
  const editorRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const ruleIndexRef = useRef<ThemeRuleIndex | null>(null);
  const lastPickTargetRef = useRef<Element | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useLayoutEffect(() => {
    if (!mounted) return;
    setDefaults(getThemeBaselines(baselineKey, visualStyle, emptyOverrides()));
  }, [mounted, baselineKey, visualStyle]);

  const effective = useMemo(() => effectiveOverrides(themeState), [themeState]);

  const closePanel = useCallback(() => {
    setThemeLabOpen(false);
    getThemeLabOpener()?.focus();
  }, []);

  const onPanelKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      closePanel();
    },
    [closePanel],
  );

  useEffect(() => {
    if (!open || !mounted) return;
    const panel = panelRef.current;
    if (!panel || panel.contains(document.activeElement)) return;
    panel.focus({ preventScroll: true });
  }, [open, mounted]);

  useEffect(() => {
    if (!mounted) return;
    document.documentElement.classList.toggle("pl-sidebar-open", open);
    return () => {
      document.documentElement.classList.remove("pl-sidebar-open");
    };
  }, [open, mounted]);

  const currentValue = useCallback(
    (id: string): string => effective[theme][id] ?? defaults?.[theme]?.[id] ?? "",
    [effective, theme, defaults],
  );

  const colorGroups = useMemo<ColorGroup[]>(() => {
    if (!defaults) return [];
    const map = new Map<string, ColorGroup>();
    ALL_TOKEN_IDS.forEach((id, index) => {
      const token = getToken(id);
      if (!token || token.kind !== "color") return;
      if (id.startsWith("--c-") || id.startsWith("--h-")) return;
      const value = effective[theme][id] ?? defaults[theme][id] ?? "";
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
  }, [theme, effective, defaults]);

  const sharedCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const group of colorGroups) {
      for (const id of group.ids) counts.set(id, group.ids.length);
    }
    return counts;
  }, [colorGroups]);

  const setTokenValues = useCallback(
    (ids: string[], value: string) => {
      setActiveEdits((prev) => {
        const nextThemeMap = { ...prev[theme] };
        for (const id of ids) {
          const baseline = defaults?.[theme]?.[id];
          if (baseline !== undefined && value.trim() === baseline.trim()) delete nextThemeMap[id];
          else nextThemeMap[id] = value;
        }
        return { ...prev, [theme]: nextThemeMap };
      });
    },
    [theme, defaults],
  );

  const setTokenValueMap = useCallback(
    (map: Record<string, string>) => {
      setActiveEdits((prev) => {
        const nextThemeMap = { ...prev[theme] };
        for (const [id, value] of Object.entries(map)) {
          const baseline = defaults?.[theme]?.[id];
          if (baseline !== undefined && value.trim() === baseline.trim()) delete nextThemeMap[id];
          else nextThemeMap[id] = value;
        }
        return { ...prev, [theme]: nextThemeMap };
      });
    },
    [theme, defaults],
  );

  const resetTokenIds = useCallback(
    (ids: string[]) => {
      setActiveEdits((prev) => {
        const nextThemeMap = { ...prev[theme] };
        for (const id of ids) delete nextThemeMap[id];
        return { ...prev, [theme]: nextThemeMap };
      });
    },
    [theme],
  );

  const setBlur = useCallback((off: boolean) => {
    setActiveEdits((prev) => {
      const next = { dark: { ...prev.dark }, light: { ...prev.light } };
      for (const themeName of ["dark", "light"] as const) {
        if (off) next[themeName][BLUR_TOKEN_ID] = "off";
        else delete next[themeName][BLUR_TOKEN_ID];
      }
      return next;
    });
  }, []);

  const revealEditor = useCallback(() => {
    revealEditorElement(editorRef.current);
  }, []);

  const selectToken = useCallback(
    (id: string) => {
      setSelectedToken(id);
      setEpoch((value) => value + 1);
      revealEditor();
    },
    [revealEditor],
  );

  const selectColorRep = useCallback(
    (repId: string) => {
      setSelectedRepId(repId);
      setEpoch((value) => value + 1);
      revealEditor();
    },
    [revealEditor],
  );

  const switchView = useCallback((next: ViewMode) => {
    setView(next);
    setEpoch((value) => value + 1);
  }, []);

  const changedCount = useMemo(() => activeEditCount(themeState), [themeState]);

  const exportJson = useMemo(() => serializeThemeExport(look, effective), [look, effective]);
  const jsonValue = jsonDirty ? jsonDraft : exportJson;

  const copyJson = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(exportJson);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setJsonDraft(exportJson);
      setJsonDirty(true);
      setJsonError("Clipboard blocked. Select the JSON above and copy it manually.");
    }
  }, [exportJson]);

  const applyJson = useCallback(() => {
    const { value: payload, error } = parseThemeImport(jsonValue);
    if (!payload) {
      setJsonError(error);
      return;
    }
    setActiveEdits(editsFromImport(payload, { baselines: defaults, currentEdits: overrides }));
    setEpoch((value) => value + 1);
    setJsonDirty(false);
    setJsonError(null);
  }, [jsonValue, defaults, overrides]);

  const resetTheme = useCallback(() => {
    setActiveEdits((prev) => ({ ...prev, [theme]: {} }));
    setEpoch((value) => value + 1);
  }, [theme]);

  const resetAll = useCallback(() => {
    setActiveEdits(emptyOverrides());
    setEpoch((value) => value + 1);
  }, []);

  const openAdvanced = useCallback(() => setJsonOpen(true), []);

  const toggleGroup = useCallback((id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const applyPick = useCallback(
    (candidate: PickCandidate) => {
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
      revealEditor();
    },
    [revealEditor],
  );

  const togglePick = useCallback(() => {
    setPickMenu(null);
    setPickToast(null);
    setPicking((on) => !on);
  }, []);

  useEffect(() => {
    if (!picking || !mounted) return;
    ruleIndexRef.current = buildThemeRuleIndex(theme);
    const previousCursor = document.body.style.cursor;
    document.body.style.cursor = "crosshair";

    const isOwn = (t: EventTarget | null) =>
      t instanceof Element && (!!t.closest("[data-theme-lab]") || !!t.closest("[data-pl-overlay]"));

    const targetsAtPoint = (event: MouseEvent) => {
      const elements =
        typeof document.elementsFromPoint === "function"
          ? document.elementsFromPoint(event.clientX, event.clientY)
          : [document.elementFromPoint(event.clientX, event.clientY)].filter((element) => element !== null);
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
      if (isOwn(event.target)) return;
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
  const isOverridden = useCallback(
    (id: string) => overrides[theme][id] !== undefined,
    [overrides, theme],
  );

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
  const editInert = editIds.length > 0 && editIds.every((id) => isInertInTheme(id, theme));
  const editInertScope = editInert ? tokenThemeScope(editIds[0]) : "both";
  const editAlpha = editKind === "color" ? (parseColorToRgba(editValue)?.a ?? 1) : 1;
  const editTranslucent = editKind === "color" && editAlpha < 0.6;
  const editLengthSpec = editKind === "length" ? getLengthSpec(editIds[0]) : undefined;
  const editAngleSpec = editKind === "angle" ? getAngleSpec(editIds[0]) : undefined;

  const applyColor = useCallback(
    (rgba: Rgba) => {
      const value = editKind === "channels" ? formatChannels(rgba) : formatColor(rgba);
      setTokenValues(editIds, value);
    },
    [editIds, editKind, setTokenValues],
  );

  const resetEditTarget = useCallback(() => {
    setActiveEdits((prev) => {
      const nextThemeMap = { ...prev[theme] };
      for (const id of editIds) delete nextThemeMap[id];
      return { ...prev, [theme]: nextThemeMap };
    });
    setEpoch((value) => value + 1);
  }, [editIds, theme]);

  if (!mounted) return null;

  const panel = (
    // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions
    <div
      ref={panelRef}
      tabIndex={-1}
      onKeyDown={onPanelKeyDown}
      className={[styles.panel, picking ? styles.panelPicking : "", open ? "" : styles.panelClosed]
        .filter(Boolean)
        .join(" ")}
      role="dialog"
      aria-modal="false"
      aria-label="Theme Lab"
      aria-hidden={open ? undefined : true}
      id="theme-lab-panel"
      data-theme-lab=""
    >
      <header className={styles.panelHeader}>
        <div className={styles.titleBlock}>
          <Icon icon="lucide:palette" size={22} className={styles.titleMark} />
          <div>
            <h2 className={styles.title}>Theme Lab</h2>
            <p className={styles.subtitle}>
              {storageOk
                ? "Live recolor · saved to this browser"
                : "Live recolor · not saved, because this browser is blocking storage"}
            </p>
          </div>
        </div>
        <div className={styles.headerActions}>
          <PanelIconButton
            active={picking}
            aria-pressed={picking}
            aria-label={picking ? "Cancel picking from the page" : "Pick a color from the page"}
            title="Pick a color from the page"
            onClick={togglePick}
          >
            <Icon icon="lucide:pipette" size={15} />
          </PanelIconButton>
          <PanelIconButton
            aria-label="Close Theme Lab"
            className={PANEL_ICON[16]}
            onClick={closePanel}
          >
            <Icon icon="lucide:x" size={16} />
          </PanelIconButton>
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

      <AppearanceAxes
        className={styles.appearanceAxes}
        showVisualStyle
        showColorScheme
        showSurface
        showAccent
        showFont
      />

      <div className={styles.changedRow}>
        {changedCount === 0 ? (
          <span className={styles.changedBadge}>No changes</span>
        ) : (
          <PanelButton
            className="ml-auto"
            title="Open Advanced to export or import these changes"
            onClick={openAdvanced}
          >
            {changedCount} changed
          </PanelButton>
        )}
      </div>

      <div
        className={`${styles.editor} ${editIds.length === 0 ? styles.editorCollapsed : ""}`}
        ref={editorRef}
      >
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
                      <li key={id}>
                        <PanelBadge variant="secondary">{getToken(id)?.label ?? id}</PanelBadge>
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
                  Only affects the <strong>{editInertScope}</strong> theme. Switch Day/Night
                  above to {editInertScope} to see this change.
                </span>
              </p>
            )}
            {editTranslucent && !editInert && (
              <p className={styles.editorAlphaNote}>
                <Icon icon="lucide:layers" size={13} />
                <span>
                  Translucent ({Math.round(editAlpha * 100)}%): the color behind shows through, so
                  changes here look like a tint. Raise the opacity slider, or edit the surface under it.
                </span>
              </p>
            )}
            {editKind === "color" || editKind === "channels" ? (
              <ColorField
                key={`${theme}:${epoch}`}
                initial={
                  (editKind === "channels"
                    ? parseChannelsToRgba(editValue)
                    : parseColorToRgba(editValue)) ?? FALLBACK
                }
                onChange={applyColor}
              />
            ) : editLengthSpec ? (
              <LengthField
                key={`${theme}:${epoch}`}
                initial={editValue}
                spec={editLengthSpec}
                onChange={(value) => setTokenValues(editIds, value)}
              />
            ) : editAngleSpec ? (
              <AngleField
                key={`${theme}:${epoch}`}
                initial={editValue}
                spec={editAngleSpec}
                onChange={(value) => setTokenValues(editIds, value)}
              />
            ) : editKind === "font" ? (
              <FontField
                key={`${theme}:${epoch}`}
                initial={editValue}
                label={essentialItem?.label ?? singleToken?.label ?? "Font"}
                onChange={(value) =>
                  value ? setTokenValues(editIds, value) : resetEditTarget()
                }
              />
            ) : (
              <div className={styles.rawEditor}>
                <label className={styles.fieldCaption} htmlFor={rawFieldId}>
                  Raw CSS value (gradient / shadow)
                </label>
                <PanelTextarea
                  id={rawFieldId}
                  key={`${theme}:${epoch}`}
                  className="min-h-22"
                  defaultValue={editValue}
                  onChange={(event) => setTokenValues(editIds, event.target.value)}
                />
                <span className={styles.rawPreview} style={{ background: editValue }} aria-hidden="true" />
              </div>
            )}
            <PanelButton
              variant="outline"
              className={`mt-1.5 w-full justify-center ${PANEL_ICON[13]}`}
              disabled={!editOverridden}
              onClick={resetEditTarget}
            >
              <Icon icon="lucide:rotate-ccw" size={13} />
              {editIds.length > 1 ? `Reset these ${editIds.length}` : "Reset this token"}
            </PanelButton>
          </>
        )}
      </div>

      <div className={styles.viewTabs} role="group" aria-label="Theme Lab view">
        {VIEW_TABS.map(({ mode, label, hint }) => (
          <PanelTab
            key={mode}
            active={view === mode}
            title={hint}
            onClick={() => switchView(mode)}
          >
            {label}
          </PanelTab>
        ))}
      </div>

      <div className={styles.toolbar}>
        <div className={styles.searchWrap}>
          <Icon icon="lucide:search" size={14} className={styles.searchIcon} />
          <PanelInput
            type="search"
            value={query}
            placeholder="Filter colors…"
            className="rounded-full pl-7"
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key !== "Escape" || query.length === 0) return;
              event.stopPropagation();
              setQuery("");
            }}
          />
        </div>
      </div>

      <div className={styles.scrollBody}>
        <div className={styles.catalog}>
          {view === "essentials" ? (
            <>
              <EssentialsView
                theme={theme}
                query={normalizedQuery}
                selectedToken={selectedToken}
                currentValue={currentValue}
                isOverridden={isOverridden}
                onSelect={selectToken}
              />
              <FlatnessControls
                baselineValue={(id) => defaults?.[theme]?.[id] ?? ""}
                overrideValue={(id) => overrides[theme]?.[id]}
                onApplyMap={setTokenValueMap}
                onResetIds={resetTokenIds}
                onSetBlur={setBlur}
                blurOff={blurDisabledIn(effective)}
              />
            </>
          ) : view === "merged" ? (
            <MergedView
              groups={colorGroups}
              query={normalizedQuery}
              activeKey={mergedGroup?.key ?? null}
              theme={theme}
              onSelect={selectColorRep}
              isOverridden={isOverridden}
            />
          ) : (
            <SectionsView
              theme={theme}
              query={normalizedQuery}
              selectedToken={selectedToken}
              currentValue={currentValue}
              isOverridden={isOverridden}
              onSelect={selectToken}
              expanded={expanded}
              sharedCounts={sharedCounts}
              onToggleGroup={toggleGroup}
            />
          )}
        </div>
      </div>

      <AdvancedDrawer
        theme={theme}
        open={jsonOpen}
        onToggle={() => setJsonOpen((value) => !value)}
        copied={copied}
        onCopy={copyJson}
        jsonValue={jsonValue}
        jsonDirty={jsonDirty}
        jsonError={jsonError}
        onJsonChange={(value) => {
          setJsonDraft(value);
          setJsonDirty(true);
          if (jsonError) setJsonError(null);
        }}
        onApply={applyJson}
        onRevert={() => {
          setJsonDirty(false);
          setJsonError(null);
        }}
        onResetTheme={resetTheme}
        onResetAll={resetAll}
      />
    </div>
  );

  const pickLayer = (
    <PickLayer
      picking={picking}
      hoverRect={hoverRect}
      hoverLabel={hoverLabel}
      toast={pickToast}
      menu={pickMenu}
      currentValue={currentValue}
      onApply={applyPick}
    />
  );

  return (
    <>
      {createPortal(panel, document.body)}
      {(picking || pickMenu || pickToast) && createPortal(pickLayer, document.body)}
    </>
  );
}
