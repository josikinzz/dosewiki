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
import { ALL_TOKEN_IDS, PALETTE_GROUPS, getToken, type PaletteToken } from "./paletteTokens";
import { describeColor, formatColor, parseColorToRgba, type Rgba } from "./colorUtils";
import styles from "./PaletteLab.module.css";

type ThemeOverrides = Record<string, string>;
type Overrides = Record<ThemeName, ThemeOverrides>;
type ThemeDefaults = Record<ThemeName, Record<string, string>>;
type ViewMode = "sections" | "merged";

interface ColorGroup {
  key: string;
  value: string;
  ids: string[];
  firstIndex: number;
}

const OVERRIDE_STYLE_ID = "palette-lab-overrides";
const STORAGE_KEY = "dosewiki-palette-lab";
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
  const [open, setOpen] = useState(false);
  const [theme, setTheme] = useState<ThemeName>("dark");
  const [overrides, setOverrides] = useState<Overrides>(emptyOverrides);
  const [defaults, setDefaults] = useState<ThemeDefaults | null>(null);
  const [view, setView] = useState<ViewMode>("merged");
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

  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    setMounted(true);
    setTheme(readInitialTheme());

    let stored: Overrides = emptyOverrides();
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<Overrides>;
        stored = {
          dark: parsed?.dark && typeof parsed.dark === "object" ? parsed.dark : {},
          light: parsed?.light && typeof parsed.light === "object" ? parsed.light : {},
        };
      }
    } catch {
      stored = emptyOverrides();
    }

    setDefaults(snapshotDefaults());
    setOverrides(stored);
    writeOverrideStyle(stored);
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

  useEffect(() => {
    if (!mounted) return;
    writeOverrideStyle(overrides);
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(overrides));
    } catch {
      // Non-fatal: preview still works for the session.
    }
  }, [overrides, mounted]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const currentValue = useCallback(
    (id: string): string => overrides[theme][id] ?? defaults?.[theme]?.[id] ?? "",
    [overrides, theme, defaults],
  );

  /** Tokens grouped by the sRGB color they currently resolve to. Editing one
   *  group writes every member at once, so identical colors stay in sync. */
  const colorGroups = useMemo<ColorGroup[]>(() => {
    if (!defaults) return [];
    const map = new Map<string, ColorGroup>();
    ALL_TOKEN_IDS.forEach((id, index) => {
      const token = getToken(id);
      if (!token || token.kind !== "color") return;
      const value = overrides[theme][id] ?? defaults[theme][id] ?? "";
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
  }, [theme, overrides, defaults]);

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
          const original = defaults?.[theme]?.[id];
          if (original !== undefined && value.trim() === original.trim()) delete nextThemeMap[id];
          else nextThemeMap[id] = value;
        }
        return { ...prev, [theme]: nextThemeMap };
      });
    },
    [theme, defaults],
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
      if (next === "merged" && !selectedRepId) {
        setSelectedRepId(colorGroups[0]?.ids[0] ?? null);
      } else if (next === "sections" && !selectedToken) {
        setSelectedToken(ALL_TOKEN_IDS[0]);
      }
      setEpoch((value) => value + 1);
    },
    [selectedRepId, selectedToken, colorGroups],
  );

  const openPanel = useCallback(() => {
    setOpen((wasOpen) => {
      const next = !wasOpen;
      if (next && view === "merged" && !selectedRepId) {
        const firstRep = colorGroups[0]?.ids[0];
        if (firstRep) {
          setSelectedRepId(firstRep);
          setEpoch((value) => value + 1);
        }
      } else if (next && view === "sections" && !selectedToken) {
        setSelectedToken(ALL_TOKEN_IDS[0]);
        setEpoch((value) => value + 1);
      }
      return next;
    });
  }, [view, selectedToken, selectedRepId, colorGroups]);

  const changedCount = useMemo(
    () => Object.keys(overrides.dark).length + Object.keys(overrides.light).length,
    [overrides],
  );

  const exportJson = useMemo(() => JSON.stringify(overrides, null, 2), [overrides]);
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
    try {
      const parsed = JSON.parse(text) as Partial<Overrides>;
      setOverrides({
        dark: parsed?.dark && typeof parsed.dark === "object" ? (parsed.dark as ThemeOverrides) : {},
        light:
          parsed?.light && typeof parsed.light === "object" ? (parsed.light as ThemeOverrides) : {},
      });
      setEpoch((value) => value + 1);
      setJsonDirty(false);
      setJsonError(null);
    } catch {
      setJsonError("That isn't valid JSON.");
    }
  }, [jsonValue]);

  const resetTheme = useCallback(() => {
    setOverrides((prev) => ({ ...prev, [theme]: {} }));
    setEpoch((value) => value + 1);
  }, [theme]);

  const resetAll = useCallback(() => {
    setOverrides(emptyOverrides());
    setEpoch((value) => value + 1);
  }, []);

  const toggleGroup = useCallback((id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const normalizedQuery = query.trim().toLowerCase();
  const matchesToken = useCallback(
    (token: PaletteToken) =>
      normalizedQuery.length === 0 ||
      token.label.toLowerCase().includes(normalizedQuery) ||
      token.id.toLowerCase().includes(normalizedQuery),
    [normalizedQuery],
  );

  // Resolve what the editor is bound to (a single token, or a merged group).
  const sectionsToken = view === "sections" && selectedToken ? getToken(selectedToken) : undefined;
  const mergedGroup =
    view === "merged" && selectedRepId
      ? colorGroups.find((group) => group.ids.includes(selectedRepId))
      : undefined;
  const editIds = sectionsToken ? [sectionsToken.id] : (mergedGroup?.ids ?? []);
  const editKind = sectionsToken ? sectionsToken.kind : "color";
  const editValue = sectionsToken
    ? currentValue(sectionsToken.id)
    : (mergedGroup?.value ?? "");
  const editOverridden = editIds.some((id) => overrides[theme][id] !== undefined);

  const applyColor = useCallback(
    (rgba: Rgba) => {
      const value = formatColor(rgba);
      setTokenValues(editIds, value);
      // No selection bookkeeping needed: the merged group is rediscovered each
      // render from the stable representative id, so it follows the edit.
    },
    [editIds, setTokenValues],
  );

  const resetEditTarget = useCallback(() => {
    setOverrides((prev) => {
      const nextThemeMap = { ...prev[theme] };
      for (const id of editIds) delete nextThemeMap[id];
      return { ...prev, [theme]: nextThemeMap };
    });
    setEpoch((value) => value + 1);
  }, [editIds, theme]);

  if (!mounted) {
    return (
      <button
        type="button"
        ref={triggerRef}
        aria-label="Open Palette Lab"
        className={`theme-icon-button ${styles.trigger}`}
      >
        <span className={styles.triggerWheel} aria-hidden="true" />
      </button>
    );
  }

  const panel = (
    <div
      className={styles.panel}
      role="dialog"
      aria-modal="false"
      aria-label="Palette Lab"
      id="palette-lab-panel"
    >
      <header className={styles.panelHeader}>
        <div className={styles.titleBlock}>
          <span className={styles.titleWheel} aria-hidden="true" />
          <div>
            <h2 className={styles.title}>Palette Lab</h2>
            <p className={styles.subtitle}>Live recolor · saved to this browser</p>
          </div>
        </div>
        <button
          type="button"
          className={styles.closeButton}
          aria-label="Close Palette Lab"
          onClick={() => {
            setOpen(false);
            triggerRef.current?.focus();
          }}
        >
          <Icon icon="lucide:x" size={16} />
        </button>
      </header>

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
        <span className={styles.changedBadge}>
          {changedCount === 0 ? "No changes" : `${changedCount} changed`}
        </span>
      </div>

      <div className={styles.scrollBody}>
      <div className={styles.editor}>
        {editIds.length === 0 ? (
          <p className={styles.editorEmpty}>Pick a swatch below to start editing.</p>
        ) : (
          <>
            <div className={styles.editorMeta}>
              {sectionsToken ? (
                <>
                  <code className={styles.editorTokenId}>{sectionsToken.id}</code>
                  <span className={styles.editorTokenLabel}>{sectionsToken.label}</span>
                  {sectionsToken.hint && <p className={styles.editorHint}>{sectionsToken.hint}</p>}
                </>
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
            {editKind === "color" ? (
              <ColorWheel
                key={`${theme}:${epoch}`}
                initial={parseColorToRgba(editValue) ?? FALLBACK}
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
        <div className={styles.viewToggle} role="group" aria-label="Catalog view">
          {(["sections", "merged"] as ViewMode[]).map((mode) => (
            <button
              key={mode}
              type="button"
              className={`${styles.viewChip} ${view === mode ? styles.viewChipActive : ""}`}
              aria-pressed={view === mode}
              aria-label={mode === "sections" ? "Section view" : "Merged colors view"}
              title={mode === "sections" ? "Group by section" : "Merge identical colors"}
              onClick={() => switchView(mode)}
            >
              <Icon icon={mode === "sections" ? "lucide:list" : "lucide:git-merge"} size={15} />
            </button>
          ))}
        </div>
      </div>

      <div className={styles.catalog}>
        {view === "merged" ? (
          <MergedList
            groups={colorGroups}
            query={normalizedQuery}
            activeKey={mergedGroup?.key ?? null}
            onSelect={selectColorRep}
            isOverridden={(id) => overrides[theme][id] !== undefined}
          />
        ) : (
          PALETTE_GROUPS.map((group) => {
            const visibleTokens = group.tokens.filter(matchesToken);
            if (visibleTokens.length === 0) return null;
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
                        const parsed = token.kind === "color" ? parseColorToRgba(value) : null;
                        const isActive = selectedToken === token.id;
                        const isOverridden = overrides[theme][token.id] !== undefined;
                        const shared = sharedCounts.get(token.id) ?? 1;
                        return (
                          <li key={token.id}>
                            <button
                              type="button"
                              className={`${styles.tokenRow} ${isActive ? styles.tokenRowActive : ""}`}
                              onClick={() => selectToken(token.id)}
                            >
                              <span className={styles.tokenSwatch} aria-hidden="true">
                                <span className={styles.tokenSwatchFill} style={{ background: value }} />
                              </span>
                              <span className={styles.tokenLabel}>
                                {token.label}
                                {token.kind === "raw" && <span className={styles.rawTag}>raw</span>}
                                {shared > 1 && (
                                  <span className={styles.sharedBadge} title="Shared color — edit in Merged to sync">
                                    ×{shared}
                                  </span>
                                )}
                              </span>
                              <span className={styles.tokenValue}>
                                {parsed ? describeColor(parsed) : token.kind === "raw" ? "gradient" : value}
                              </span>
                              {isOverridden && <span className={styles.tokenDot} aria-label="changed" />}
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
        <div className={styles.jsonHead}>
          <span className={styles.fieldCaption}>JSON{jsonDirty ? " · edited" : ""}</span>
          <button
            type="button"
            className={styles.copyButton}
            aria-label="Copy JSON"
            title="Copy JSON to clipboard"
            onClick={copyJson}
          >
            <Icon icon={copied ? "lucide:check" : "lucide:copy"} size={14} />
            <span>{copied ? "Copied" : "Copy"}</span>
          </button>
        </div>
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
          <button
            type="button"
            className={`${styles.iconButton} ${styles.jsonActionsRight}`}
            aria-label={`Reset ${theme} theme`}
            title={`Reset ${theme} theme`}
            onClick={resetTheme}
          >
            <Icon icon="lucide:rotate-ccw" size={15} />
          </button>
          <button
            type="button"
            className={styles.iconButton}
            aria-label="Reset all themes"
            title="Reset all themes"
            onClick={resetAll}
          >
            <Icon icon="lucide:trash-2" size={15} />
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <>
      <button
        type="button"
        ref={triggerRef}
        aria-label={open ? "Close Palette Lab" : "Open Palette Lab"}
        aria-expanded={open}
        aria-controls="palette-lab-panel"
        title="Palette Lab — live color editor"
        className={`theme-icon-button ${styles.trigger} ${open ? styles.triggerActive : ""}`}
        onClick={openPanel}
      >
        <span className={styles.triggerWheel} aria-hidden="true" />
      </button>
      {open && createPortal(panel, document.body)}
    </>
  );
}

interface MergedListProps {
  groups: ColorGroup[];
  query: string;
  activeKey: string | null;
  onSelect: (repId: string) => void;
  isOverridden: (id: string) => boolean;
}

function MergedList({ groups, query, activeKey, onSelect, isOverridden }: MergedListProps) {
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
    return <p className={styles.mergedHint}>No colors detected on this page yet.</p>;
  }

  return (
    <ul className={styles.tokenList}>
      {visible.map((group) => {
        const parsed = parseColorToRgba(group.value);
        const first = getToken(group.ids[0]);
        const count = group.ids.length;
        const changed = group.ids.some(isOverridden);
        return (
          <li key={group.key}>
            <button
              type="button"
              className={`${styles.tokenRow} ${activeKey === group.key ? styles.tokenRowActive : ""}`}
              onClick={() => onSelect(group.ids[0])}
            >
              <span className={styles.tokenSwatch} aria-hidden="true">
                <span className={styles.tokenSwatchFill} style={{ background: group.value }} />
              </span>
              <span className={styles.tokenLabel}>
                {first?.label ?? group.ids[0]}
                {count > 1 && <span className={styles.sharedBadge}>×{count}</span>}
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
