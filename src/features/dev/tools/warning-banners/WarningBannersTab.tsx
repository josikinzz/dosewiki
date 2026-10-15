"use client";

import { DevToolSection } from "@/features/dev/pages/DevToolSection";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Icon } from "@/components/common/Icon";
import { Button } from "@/components/ui/button";
import {
  compareWarningBanners,
  clampSafetyBannerIconSize,
  MAX_BANNERS_PER_ARTICLE,
  isWarningBannerTone,
  normalizeEnabledSlugs,
  SAFETY_BANNER_ICON_SIZE_DEFAULT,
  type WarningBannerPreset,
  type WarningBannerTarget,
} from "@/data/substanceWarningBanners";
import {
  LoadErrorState,
  useConfirm,
  useDevShortcuts,
  useDirtyGuard,
  useScrollToDetail,
  useUnsavedWork,
  type EditorActionStatusState,
  type NoticeMessage,
} from "@/features/dev/components";
import { useWriteFreeze } from "@/features/dev/components/writeFreeze";
import { useEditorReadState, useInvalidateEditorReads } from "@/hooks/useEditorRead";
import { useModifierKeyLabel } from "../../pages/DevCommandPalette";
import { RowSkeletons } from "../home/homeParts";
import { WarningBannersBoundary } from "./WarningBannersBoundary";
import {
  WarningBannersStudioView,
  type WarningBannersStudioViewMode,
} from "./WarningBannersStudioView";
import { slugsHiddenByCap, summarizeBannerCoverage, summarizeCapSuppression } from "./bannerCoverage";
import { planEnablementChange, type EnablementChange } from "./enablement";
import {
  applyDraftChange,
  composeDraft,
  describeCopyChanges,
  editorFor,
  isCopyDirty,
  isScopeDirty,
  substanceTitles,
  type PresetEditor,
} from "./presetDrafts";
import {
  bannerPresetFromSlug,
  cachedWarningBannerTargets,
  fetchWarningBannerTargets,
} from "./warningBannerTargets";
import {
  pendingWarning,
  publishWarning,
  readWarningJson,
  readWarningState,
  retryPendingWarning,
  WarningRequestError,
  writeWarning,
} from "./warningEditing";
import type { EditableWarningPreset } from "./warningEditing";

const WARNING_BANNER_DISPLAY_API = "/api/dev/warning-banner/display";

type WarningBannerPresetDoc = {
  key: string;
  tone: string;
  icon: string;
  severityLabel: string;
  headline: string;
  points: string[];
  enabled: boolean;
  allSubstances?: boolean;
  enabledSlugs: string[];
  baseHash: string;
};

type StudioView = WarningBannersStudioViewMode;

type SaveState = EditorActionStatusState | "idle";

type BannerNotice = NoticeMessage & { writeFailed?: boolean };

function isRevisionConflict(error: unknown): boolean {
  return (error instanceof WarningRequestError && error.status === 409)
    || (error instanceof Error && /changed since it was opened/i.test(error.message));
}

const FREEZE_TITLE = "Writes are paused, so your changes were not published.";

const EDITOR_SHORTCUTS = [
  { keys: "Cmd+S", label: "Publish the open preset (asks first)" },
  { keys: "/", label: "Find a substance" },
] as const;
const VIEW_SHORTCUTS = [{ keys: "/", label: "Find a substance" }] as const;

const BLANK_PRESET: WarningBannerPreset = {
  key: "",
  tone: "danger",
  icon: "",
  severityLabel: "",
  headline: "",
  points: [""],
  enabled: false,
  allSubstances: false,
  enabledSlugs: [],
};

export type WarningBannersTabProps = {
  initialSubstanceSlug?: string;
};

export function WarningBannersTab(props: WarningBannersTabProps) {
  return (
    <WarningBannersBoundary>
      <WarningBannersStudio {...props} />
    </WarningBannersBoundary>
  );
}

function WarningBannersStudio({ initialSubstanceSlug: initialSlug }: WarningBannersTabProps) {
  const initialPresetKey = bannerPresetFromSlug(initialSlug);
  const initialSubstanceSlug = initialPresetKey === null ? initialSlug : undefined;
  const [rows, setRows] = useState<WarningBannerPresetDoc[] | undefined>(undefined);
  const [rowsError, setRowsError] = useState<string | null>(null);
  const [rowsLoading, setRowsLoading] = useState(false);
  const [rowsToken, setRowsToken] = useState(0);

  useEffect(() => {
    let active = true;
    setRowsError(null);
    setRowsLoading(true);
    readWarningJson<{ presets: WarningBannerPresetDoc[] }>("/api/dev/warning-banner").then(
      (result) => { if (active) { setRows(result.presets); setRowsLoading(false); } },
      (error: unknown) => {
        if (active) {
          setRowsError(error instanceof Error ? error.message : "The warning presets could not be loaded.");
          setRowsLoading(false);
        }
      },
    );
    return () => { active = false; };
  }, [rowsToken]);

  const presets = useMemo(() => {
    const mapped = (rows ?? []).map((row): EditableWarningPreset => ({
      key: row.key,
      tone: isWarningBannerTone(row.tone) ? row.tone : "caution",
      icon: row.icon,
      severityLabel: row.severityLabel,
      headline: row.headline,
      points: row.points,
      enabled: row.enabled,
      allSubstances: row.allSubstances === true,
      enabledSlugs: row.enabledSlugs,
      baseHash: row.baseHash,
    }));
    return mapped.sort(compareWarningBanners);
  }, [rows]);

  const [targets, setTargets] = useState<WarningBannerTarget[]>(
    () => cachedWarningBannerTargets ?? [],
  );
  const [targetsLoaded, setTargetsLoaded] = useState(() => cachedWarningBannerTargets !== null);
  const [targetsError, setTargetsError] = useState<string | null>(null);
  const [targetsToken, setTargetsToken] = useState(0);
  const [view, setView] = useState<StudioView>(
    initialSubstanceSlug ? "coverage" : "presets",
  );
  const [coverageSlug, setCoverageSlug] = useState(initialSubstanceSlug ?? "");
  const [editor, setEditor] = useState<PresetEditor | null>(null);
  const [iconValid, setIconValid] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [notice, setNotice] = useState<BannerNotice | null>(null);
  const { confirm, dialog: confirmDialog } = useConfirm();
  const freeze = useWriteFreeze();
  const saveKeyLabel = useModifierKeyLabel("S");
  const listRef = useRef<HTMLElement>(null);
  const paneRef = useRef<HTMLElement>(null);
  const paneTitleRef = useRef<HTMLHeadingElement>(null);
  const focusPaneOnOpen = useRef(false);

  const isDirty = editor ? isCopyDirty(editor) || isScopeDirty(editor) : false;
  const draft = useMemo(() => (editor ? composeDraft(editor) : null), [editor]);
  const { guard: guardDraft, dialog: dirtyGuardDialog } = useDirtyGuard(isDirty, { warnOnUnload: false });

  const openIdentity = editor ? (editor.origin?.key ?? "new") : null;
  useScrollToDetail(paneRef, view === "presets" ? openIdentity : null);
  useEffect(() => {
    if (openIdentity === null || !focusPaneOnOpen.current) return;
    focusPaneOnOpen.current = false;
    paneTitleRef.current?.focus({ preventScroll: true });
  }, [openIdentity]);

  const displayRead = useEditorReadState("siteConfig:getBannerDisplay", {}, "list");
  const display = displayRead.data;
  const invalidateEditorReads = useInvalidateEditorReads();
  const storedIconSize = display
    ? clampSafetyBannerIconSize(display.iconSize)
    : SAFETY_BANNER_ICON_SIZE_DEFAULT;
  const [iconSizeDraft, setIconSizeDraft] = useState<string | null>(null);
  const [iconSizeSaveState, setIconSizeSaveState] = useState<SaveState>("idle");
  const [iconSizeNotice, setIconSizeNotice] = useState<NoticeMessage | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchWarningBannerTargets({ refresh: targetsToken > 0 }).then(
      (items) => {
        if (!cancelled) {
          setTargets(items);
          setTargetsError(null);
          setTargetsLoaded(true);
        }
      },
      (error: unknown) => {
        if (!cancelled) {
          setTargetsError(
            error instanceof Error ? error.message : "The substance list could not be loaded.",
          );
          setTargetsLoaded(true);
        }
      },
    );
    return () => {
      cancelled = true;
    };
  }, [targetsToken]);

  useEffect(() => {
    if (initialSubstanceSlug) {
      setCoverageSlug(initialSubstanceSlug);
      setView("coverage");
    }
  }, [initialSubstanceSlug]);

  const coverage = useMemo(() => summarizeBannerCoverage(presets), [presets]);
  const capped = useMemo(
    () => summarizeCapSuppression(presets, targets.map((target) => target.slug)),
    [presets, targets],
  );

  const loadLatest = useCallback(async (key: string) => {
    const state = await readWarningState(key);
    const latest = state.preset ? { ...state.preset, baseHash: state.baseHash } : null;
    setRows((current) => [...(current ?? []).filter((row) => row.key !== key), ...(latest ? [latest] : [])]);
    setEditor((current) =>
      current?.origin?.key === key ? (latest ? editorFor(latest, BLANK_PRESET) : null) : current,
    );
    setSaveState("idle");
    setNotice({
      tone: "info",
      message: latest
        ? `Loaded the latest version of ${key}. Apply your edits again, then publish.`
        : `${key} was deleted after you opened it. Nothing renders it now.`,
    });
  }, []);

  const askLoadLatest = useCallback((key: string) => {
    confirm({
      title: "Load the latest version?",
      description: `Your unsaved edits to ${key} are dropped and the editor shows it as it is live now. Copy anything you want to keep first.`,
      confirmLabel: "Load latest",
      destructive: true,
      onConfirm: () => loadLatest(key),
    });
  }, [confirm, loadLatest]);

  const failureNotice = useCallback((key: string, error: unknown, fallback: string): BannerNotice => {
    const retry = pendingWarning(key) ? (
      <Button variant="outline" size="sm" onClick={() => recoverPending(key)}>Retry original change</Button>
    ) : undefined;
    if (isRevisionConflict(error)) {
      return {
        tone: "danger",
        title: "Someone published this preset after you opened it.",
        message: "Nothing was published, and your edits are still here. Copy anything you want to keep, then load the latest version.",
        actions: (
          <Button type="button" variant="outline" size="sm" onClick={() => askLoadLatest(key)}>
            Load the latest version
          </Button>
        ),
      };
    }
    return {
      tone: "danger",
      title: fallback,
      message: error instanceof Error ? error.message : "The change could not be saved.",
      actions: retry,
      writeFailed: true,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [askLoadLatest]);

  const submitPreset = useCallback(
    async (preset: EditableWarningPreset): Promise<EditableWarningPreset | null> => {
      const submitted = normalizeEnabledSlugs(preset.enabledSlugs);
      setSaveState("saving");
      setNotice(null);

      try {
        const result = await publishWarning({ ...preset, enabledSlugs: submitted });
        if (!result.preset) throw new Error("The saved warning could not be confirmed.");
        const echoed = result.enabledSlugs;
        const adopted = { ...result.preset, baseHash: result.baseHash };
        setRows((current) => [...(current ?? []).filter((row) => row.key !== adopted.key), adopted]);

        setSaveState("saved");

        const dropped = submitted.filter((slug) => !echoed.includes(slug));
        if (dropped.length > 0) {
          setNotice({
            tone: "warning",
            title: `${dropped.length} slug${dropped.length === 1 ? "" : "s"} dropped on save`,
            message: (
              <>
                {"Saved, but these do not resolve to an article and were removed: "}
                <span className="font-mono">{dropped.join(", ")}</span>
                {". Everything else is stored as submitted."}
              </>
            ),
          });
        }

        return { ...result.preset, baseHash: result.baseHash };
      } catch (error) {
        setSaveState("error");
        setNotice(failureNotice(preset.key, error, "Couldn't save that preset"));
        return null;
      }
    },
    [failureNotice],
  );

  async function commitEnabledSlugs(
    preset: WarningBannerPreset,
    nextSlugs: string[],
    summary: string,
  ) {
    const previous = preset.enabledSlugs;
    const adopted = await submitPreset({ ...preset, enabledSlugs: nextSlugs });
    if (!adopted) return;
    setEditor((current) =>
      current?.origin?.key === adopted.key
        ? {
            origin: adopted,
            copyDraft: current.copyDraft,
            scopeDraft: { ...current.scopeDraft, enabledSlugs: adopted.enabledSlugs },
          }
        : current,
    );

    setNotice({
      tone: "info",
      message: summary,
      actions: (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => {
            void commitEnabledSlugs(
              adopted,
              previous,
              `Restored the previous list for ${preset.key}.`,
            );
          }}
        >
          <Icon icon="lucide:undo-2" size={15} />
          Undo
        </Button>
      ),
    });
  }

  function requestEnablement(preset: WarningBannerPreset, change: EnablementChange) {
    if (editor && editor.origin === null) {
      const { nextSlugs } = planEnablementChange(
        { ...preset, enabledSlugs: editor.scopeDraft.enabledSlugs },
        change,
        targets,
        { dirty: false },
      );
      setEditor({ ...editor, scopeDraft: { ...editor.scopeDraft, enabledSlugs: nextSlugs } });
      return;
    }
    const open = editor?.origin?.key === preset.key ? editor : null;
    const saved = open?.origin ?? preset;
    const dirty = open !== null && isCopyDirty(open);
    const plan = planEnablementChange(saved, change, targets, { dirty });
    const hidden = change.action === "enable" && saved.enabled
      ? slugsHiddenByCap(presets, saved, plan.nextSlugs, change.slugs)
      : [];
    const capNote = hidden.length === 0
      ? ""
      : change.slugs.length === 1
        ? ` ${substanceTitles(hidden, targets)[0]} already shows ${MAX_BANNERS_PER_ARTICLE} banners that come first, so this one will not render there.`
        : ` It will not render on ${hidden.length} of them (${substanceTitles(hidden, targets).join(", ")}): they already show ${MAX_BANNERS_PER_ARTICLE} banners that come first.`;
    confirm({
      ...plan.request,
      description: `${plan.request.description}${capNote}`,
      onConfirm: () => commitEnabledSlugs(saved, plan.nextSlugs, plan.summary),
    });
  }

  function recoverPending(key: string) {
    const operation = pendingWarning(key);
    if (!operation) return;
    confirm({
      title: `Resolve the unconfirmed change to ${key}?`,
      description: <><p>Retry sends the original change again. If it already went through, nothing publishes twice. Different local edits are not sent.</p><pre className="max-h-48 overflow-auto whitespace-pre-wrap break-words text-xs">{JSON.stringify(operation.body, null, 2)}</pre></>,
      confirmLabel: "Retry original change",
      onConfirm: async () => {
        setSaveState("saving");
        try {
          const result = await retryPendingWarning(key);
          const adopted = result.preset ? { ...result.preset, baseHash: result.baseHash } : null;
          setRows((current) => [...(current ?? []).filter((row) => row.key !== key), ...(adopted ? [adopted] : [])]);
          setEditor(adopted ? editorFor(adopted, BLANK_PRESET) : null);
          setSaveState("saved");
          setNotice({ tone: "info", message: `Confirmed the original change for ${key}.` });
        } catch (error) {
          setSaveState("error");
          setNotice(failureNotice(key, error, "Original warning change unresolved"));
        }
      },
    });
  }

  const openPreset = useCallback((preset: WarningBannerPreset | null) => {
    focusPaneOnOpen.current = preset !== null;
    setEditor(preset ? editorFor(preset, BLANK_PRESET) : null);
    setSaveState("idle");
    setNotice(preset && pendingWarning(preset.key) ? {
      tone: "warning", message: "An earlier change to this preset is still unconfirmed. Retry the original change before making another.",
      actions: <Button variant="outline" size="sm" onClick={() => recoverPending(preset.key)}>Retry original change</Button>,
    } : null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const openedPresetRef = useRef<string | null>(null);
  useEffect(() => {
    if (!initialPresetKey || rows === undefined || openedPresetRef.current === initialPresetKey) return;
    const preset = presets.find((candidate) => candidate.key === initialPresetKey);
    if (!preset) return;
    openedPresetRef.current = initialPresetKey;
    setView("presets");
    guardDraft(() => openPreset(preset));
  }, [guardDraft, initialPresetKey, openPreset, presets, rows]);

  const handleSave = useCallback(() => {
    if (!editor) return;
    const submitted = composeDraft(editor);
    const changes = describeCopyChanges(editor.origin, editor.copyDraft);
    const titles = substanceTitles(submitted.enabledSlugs, targets);
    const reach = submitted.allSubstances
      ? "It shows on every substance article, including ones published later."
      : titles.length === 0
        ? "It is on no substance's list yet."
        : `It shows on ${titles.length} substance article${titles.length === 1 ? "" : "s"}.`;
    const switches = editor.origin
      ? [
          editor.origin.enabled !== submitted.enabled
            ? submitted.enabled ? "You switch it on." : "You switch it off."
            : null,
          (editor.origin.allSubstances === true) !== submitted.allSubstances
            ? submitted.allSubstances ? "It becomes sitewide." : "It stops being sitewide and follows its list."
            : null,
        ].filter(Boolean).join(" ")
      : "";
    confirm({
      title: editor.origin ? `Publish ${submitted.key}?` : `Publish the new preset ${submitted.key}?`,
      description: (
        <>
          <span className="block">
            This changes shared warning copy on dose.wiki and Effect Index. {reach}
            {submitted.enabled ? "" : " The preset stays switched off."}
            {switches ? ` ${switches}` : ""}
          </span>
          {changes.length > 0 ? (
            <span className="mt-3 block space-y-2">
              {changes.map((change) => (
                <span key={change.label} className="block">
                  <span className="theme-text-primary block font-medium">{change.label}</span>
                  <span className="block whitespace-pre-line">
                    Before: {change.before || "(empty)"}
                  </span>
                  <span className="theme-text-primary block whitespace-pre-line">
                    After: {change.after || "(empty)"}
                  </span>
                </span>
              ))}
            </span>
          ) : (
            <span className="mt-2 block">The words are unchanged; only where it shows changes.</span>
          )}
        </>
      ),
      affected: submitted.allSubstances ? undefined : titles,
      affectedLabel: `Shows on ${titles.length} substance${titles.length === 1 ? "" : "s"}`,
      confirmLabel: "Publish preset",
      onConfirm: async () => {
        const adopted = await submitPreset(submitted);
        if (adopted) {
          setEditor(editorFor(adopted, BLANK_PRESET));
          setNotice((current) => current ?? { tone: "success", message: `Published ${adopted.key}. Readers see it now wherever it renders.` });
        }
      },
    });
  }, [editor, submitPreset, confirm, targets]);

  const deletePreset = useCallback(async (preset: EditableWarningPreset) => {
    setSaveState("saving");
    setNotice(null);

    try {
      if (!preset.baseHash) throw new Error("Reload this warning before deleting it.");
      await writeWarning("DELETE", { key: preset.key, baseHash: preset.baseHash, scope: "preset" });
      setRows((current) => current?.filter((row) => row.key !== preset.key));
      setSaveState("saved");
      setEditor(null);
      setNotice({
        tone: "info",
        message: `Deleted ${preset.key}. Nothing renders it now.`,
      });
    } catch (error) {
      setSaveState("error");
      setNotice(failureNotice(preset.key, error, "Couldn't delete that preset"));
    }
  }, [failureNotice]);

  const requestDelete = useCallback(
    (preset: WarningBannerPreset) => {
      const reach = preset.allSubstances
        ? "every substance article"
        : `${preset.enabledSlugs.length} substance${preset.enabledSlugs.length === 1 ? "" : "s"}`;
      confirm({
        title: `Delete ${preset.key}?`,
        description: `${preset.key} is enabled on ${reach}. Deleting destroys its headline and points, and it stops rendering everywhere. To stop it showing but keep the words, cancel, untick Enabled and publish instead.`,
        confirmLabel: "Delete preset",
        destructive: true,
        onConfirm: () => deletePreset(preset),
      });
    },
    [confirm, deletePreset],
  );

  const iconSizeText = iconSizeDraft ?? String(storedIconSize);
  const iconSize = clampSafetyBannerIconSize(Number.parseInt(iconSizeText, 10));
  const iconSizeDirty = iconSizeDraft !== null && iconSize !== storedIconSize;

  const saveIconSize = useCallback(async () => {
    setIconSizeSaveState("saving");
    setIconSizeNotice(null);

    try {
      const response = await fetch(WARNING_BANNER_DISPLAY_API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ iconSize }),
      });
      const payload = (await response.json()) as { error?: string; code?: string; iconSize?: number };
      if (!response.ok || typeof payload.iconSize !== "number") {
        throw new Error(
          response.status === 503 && payload.code === "DATA_WRITES_FROZEN"
            ? "Writes are paused, so the size was not saved. It is still in the field; save again once writes resume."
            : (payload.error ?? "The icon size could not be saved."),
        );
      }

      const stored = clampSafetyBannerIconSize(payload.iconSize);
      setIconSizeDraft(String(stored));
      void invalidateEditorReads(["siteConfig:getBannerDisplay"]);
      setIconSizeSaveState("saved");
      setIconSizeNotice({
        tone: "success",
        title: "Icon size saved for every banner",
        message: `Every safety banner now renders its glyph at ${stored}px, on every article that shows one.`,
      });
    } catch (error) {
      setIconSizeSaveState("error");
      setIconSizeNotice({
        tone: "danger",
        title: "Couldn't save the icon size",
        message: error instanceof Error ? error.message : "The icon size could not be saved.",
      });
    }
  }, [iconSize, invalidateEditorReads]);

  const handleSaveIconSize = useCallback(() => {
    confirm({
      title: `Change the icon size on every banner to ${iconSize}px?`,
      description: `Every safety banner on every article that shows one renders its glyph at ${iconSize}px instead of ${storedIconSize}px, as soon as you confirm.`,
      confirmLabel: "Save size",
      onConfirm: saveIconSize,
    });
  }, [confirm, iconSize, saveIconSize, storedIconSize]);

  useUnsavedWork({
    kind: "discard-only",
    because: "This change would go live. Publish it from the tool; leaving here never publishes.",
    id: "banners:preset",
    tab: "banners",
    label: `Banners: ${draft?.headline.trim() || draft?.key || "new preset"}`,
    dirty: isDirty,
    discard: () =>
      setEditor((current) => (current?.origin ? editorFor(current.origin, BLANK_PRESET) : null)),
  });
  useUnsavedWork({
    kind: "discard-only",
    because: "This change would go live. Publish it from the tool; leaving here never publishes.",
    id: "banners:icon-size",
    tab: "banners",
    label: "Banners: icon size for every banner",
    dirty: iconSizeDirty,
    discard: () => {
      setIconSizeDraft(null);
      setIconSizeSaveState("idle");
    },
  });

  const paneOpen = editor !== null && view === "presets";
  useDevShortcuts(paneOpen ? EDITOR_SHORTCUTS : VIEW_SHORTCUTS, rows !== undefined);
  const handleSaveRef = useRef(handleSave);
  handleSaveRef.current = handleSave;
  const canPublish = paneOpen && isDirty && saveState !== "saving";
  useEffect(() => {
    if (rows === undefined) return;
    const onKey = (event: KeyboardEvent) => {
      const dialogOpen = Boolean(document.querySelector('[role="dialog"], [role="alertdialog"]'));
      if ((event.metaKey || event.ctrlKey) && !event.altKey && event.key.toLowerCase() === "s") {
        if (!paneOpen) return;
        event.preventDefault();
        if (canPublish && !dialogOpen) handleSaveRef.current();
        return;
      }
      if (event.key !== "/" || event.metaKey || event.ctrlKey || event.altKey || event.defaultPrevented || dialogOpen) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, [contenteditable='true']")) return;
      const search = [...document.querySelectorAll<HTMLInputElement>("input[data-banner-search]")]
        .find((input) => !input.disabled && input.offsetParent !== null);
      if (!search) return;
      event.preventDefault();
      search.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [rows, paneOpen, canPublish]);

  const closeEditor = () =>
    guardDraft(() => {
      const key = editor?.origin?.key;
      setEditor(null);
      setSaveState("idle");
      setNotice(null);
      requestAnimationFrame(() => {
        listRef.current
          ?.querySelector<HTMLElement>(key ? `[data-preset="${CSS.escape(key)}"] button` : "button")
          ?.focus({ preventScroll: true });
      });
    });

  const backToList = () => {
    listRef.current?.scrollIntoView?.({ behavior: "smooth", block: "start" });
    const key = editor?.origin?.key;
    listRef.current
      ?.querySelector<HTMLElement>(key ? `[data-preset="${CSS.escape(key)}"] button` : "ul button")
      ?.focus({ preventScroll: true });
  };

  if (rows === undefined) {
    return (
      <div>
        <DevToolSection tool="banners">
          {rowsError ? (
            <LoadErrorState
              what="the banner presets"
              message={rowsError}
              busy={rowsLoading}
              onRetry={() => setRowsToken((value) => value + 1)}
            />
          ) : (
            <div className="max-w-md">
              <RowSkeletons rows={4} label="banner presets" />
            </div>
          )}
        </DevToolSection>
      </div>
    );
  }

  const { writeFailed, ...plainNotice } = notice ?? { writeFailed: false };
  const shownNotice: NoticeMessage | null = notice
    ? writeFailed && freeze.frozen
      ? {
          ...plainNotice,
          title: FREEZE_TITLE,
          message: "They are still here. Try again once writes resume.",
        }
      : (plainNotice as NoticeMessage)
    : null;
  const dismissNotice = () => setNotice(null);

  return (
    <WarningBannersStudioView
      confirmDialog={
        <>
          {confirmDialog}
          {dirtyGuardDialog}
        </>
      }
      presetCount={presets.length}
      capped={capped}
      targets={targets}
      targetsError={targetsError}
      coverage={coverage}
      view={view}
      onRetryTargets={() => {
        setTargetsError(null);
        setTargetsToken((token) => token + 1);
      }}
      onViewChange={setView}
      presetsProps={{
        presets,
        targets,
        capped,
        iconSizeNotice,
        onDismissIconSizeNotice: () => setIconSizeNotice(null),
        iconSizeControl: {
          size: iconSize,
          text: iconSizeText,
          dirty: iconSizeDirty,
          saveState: iconSizeSaveState,
          loadError: displayRead.error,
          retrying: displayRead.fetching,
          onRetryLoad: displayRead.retry,
          onTextChange: (text) => {
            setIconSizeSaveState("idle");
            setIconSizeDraft(text);
          },
          onSave: handleSaveIconSize,
          onReset: () => {
            setIconSizeDraft(null);
            setIconSizeSaveState("idle");
            setIconSizeNotice(null);
          },
        },
        draft,
        saved: editor?.origin ?? null,
        isDirty,
        saveState,
        iconValid,
        notice: shownNotice,
        onDismissNotice: dismissNotice,
        saveKeyLabel,
        listRef,
        paneRef,
        titleRef: paneTitleRef,
        onIconValidityChange: setIconValid,
        onDraftChange: (next) => {
          setSaveState("idle");
          setEditor((current) => (current ? applyDraftChange(current, next) : current));
        },
        onOpen: (preset) => guardDraft(() => openPreset(preset)),
        onCreate: () =>
          guardDraft(() => {
            focusPaneOnOpen.current = true;
            setEditor(editorFor(null, BLANK_PRESET));
            setSaveState("idle");
            setNotice(null);
          }),
        onSave: handleSave,
        onDiscard: () =>
          setEditor((current) =>
            current?.origin ? editorFor(current.origin, BLANK_PRESET) : null,
          ),
        onClose: closeEditor,
        onBackToList: backToList,
        onRequestEnablement: requestEnablement,
        onRequestDelete: requestDelete,
        onInspectCoverage: (slug) => {
          setCoverageSlug(slug);
          setView("coverage");
        },
      }}
      coverageProps={{
        presets,
        targets,
        targetsLoaded,
        iconSize,
        activeSlug: coverageSlug,
        linkedSlug: initialSubstanceSlug,
        onActiveSlugChange: setCoverageSlug,
        saveState,
        notice: shownNotice,
        onDismissNotice: dismissNotice,
        onRequestEnablement: requestEnablement,
        onEditPreset: (preset) =>
          guardDraft(() => {
            openPreset(preset);
            setView("presets");
          }),
      }}
    />
  );
}
