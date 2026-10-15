"use client";

/**
 * Banner Studio: `/dev` → Banners, deep-linked at `/dev/banners/<slug>`.
 *
 * Two jobs with very different frequencies live in one tab:
 * `Presets` authors the handful of banners that will ever exist, `Coverage`
 * audits what a reader actually sees on one substance. This module owns
 * everything the two views must not disagree about: the preset list, the loaded
 * corpus, the draft, every write, and the rollout readout.
 *
 * Three disciplines are load-bearing. Banners are opt-in: nothing here maps a
 * classification onto a rendered banner, and `searchWarningBannerTargets` only
 * ever produces slugs for an editor to enable by hand. Saving is never
 * optimistic: the route's echoed `enabledSlugs` is adopted verbatim because the
 * server drops slugs that no longer resolve, and a pruned slug that silently
 * stayed on screen would be a lie about what the public site shows. And the
 * glyph size is site-wide, so it is held here on its own wire (its own query,
 * its own draft, its own save state and its own notice), because a preset save
 * and a size save can be in flight at once and must never be mistaken for each
 * other.
 */

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
  EditorSection,
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


/**
 * A separate endpoint, not a field on the preset write: the size is one document
 * for the whole site, and posting it alongside a preset would make every preset
 * save a chance to change every banner.
 */
const WARNING_BANNER_DISPLAY_API = "/api/dev/warning-banner/display";

/**
 * The stored row as it arrives from `warningBannerPresets`. `tone` is narrowed
 * below rather than trusted: the read validator keeps it a string union on the
 * wire, but a row written before a tone was renamed must still load and be
 * editable rather than fail the query.
 */
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

/**
 * A preset notice, plus whether it reports a write that did not land. When the
 * shell has seen the write freeze, a failed write reads as the freeze rather
 * than as the reconcile step's "not yet confirmed", which is what the client
 * says after any 5xx.
 */
type BannerNotice = NoticeMessage & { writeFailed?: boolean };

/** A save refused by the revision check: someone published this preset after it was opened. */
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
  // Both opt-in gates start shut, so a half-written preset cannot reach a
  // reader between its first Save and the editor finishing the copy.
  enabled: false,
  allSubstances: false,
  enabledSlugs: [],
};

export type WarningBannersTabProps = {
  /**
   * `/dev/banners/<slug>` opens Coverage on that substance;
   * `/dev/banners/preset:<key>` opens that preset's editor.
   */
  initialSubstanceSlug?: string;
};

/**
 * Exported entry point. The boundary sits outside `WarningBannersStudio` because
 * the display read throws during that component's render when the server cannot
 * answer, and a boundary cannot catch a throw from itself.
 */
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
  /** Set when a row opens a preset, so the pane's heading takes focus once it has rendered. */
  const focusPaneOnOpen = useRef(false);

  const isDirty = editor ? isCopyDirty(editor) || isScopeDirty(editor) : false;
  const draft = useMemo(() => (editor ? composeDraft(editor) : null), [editor]);
  // Replacing the open draft (another preset, New preset, Coverage's Edit, or
  // closing the pane) asks first while it holds unsaved work.
  // The shell owns rail clicks, Leave and unload; this guard keeps the
  // in-tool switches.
  const { guard: guardDraft, dialog: dirtyGuardDialog } = useDirtyGuard(isDirty, { warnOnUnload: false });

  // Phones stack the pane under the list: opening a preset scrolls it in.
  const openIdentity = editor ? (editor.origin?.key ?? "new") : null;
  useScrollToDetail(paneRef, view === "presets" ? openIdentity : null);
  // Name the preset for keyboard and screen reader users once its pane is in
  // the page. An effect, not a frame later, so a click that lands in a field
  // right after cannot lose its focus to the heading.
  useEffect(() => {
    if (openIdentity === null || !focusPaneOnOpen.current) return;
    focusPaneOnOpen.current = false;
    paneTitleRef.current?.focus({ preventScroll: true });
  }, [openIdentity]);

  /**
   * The site-wide glyph size. Its own query, draft, save state and notice, none
   * of them shared with `submitPreset`: an editor who saves a preset must not see
   * a pill claiming the size was stored, and vice versa.
   */
  // Read without throwing, so a failed read degrades the size control alone
  // and the presets stay editable; the boundary is the net for anything else.
  const displayRead = useEditorReadState("siteConfig:getBannerDisplay", {}, "list");
  const display = displayRead.data;
  const invalidateEditorReads = useInvalidateEditorReads();
  const storedIconSize = display
    ? clampSafetyBannerIconSize(display.iconSize)
    : SAFETY_BANNER_ICON_SIZE_DEFAULT;
  /**
   * Raw text rather than a number, because clamping on every keystroke turns
   * typing `50` into `24` at the first digit. `null` means "whatever is stored",
   * so the field adopts a late-arriving query instead of pinning the fallback
   * the previews rendered at while it loaded.
   */
  const [iconSizeDraft, setIconSizeDraft] = useState<string | null>(null);
  const [iconSizeSaveState, setIconSizeSaveState] = useState<SaveState>("idle");
  const [iconSizeNotice, setIconSizeNotice] = useState<NoticeMessage | null>(null);

  // The corpus is read once per visit (and cached across visits), so the
  // readout's denominator, Coverage and the substance search are all ready
  // without waiting for a view to ask.
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

  // A deep link can arrive while the tab is already mounted: an editor reading
  // an article clicks through to `/dev/banners/<slug>` and the controller hands
  // down a new slug rather than remounting. Mirrors `ReplicationStudioTab`.
  useEffect(() => {
    if (initialSubstanceSlug) {
      setCoverageSlug(initialSubstanceSlug);
      setView("coverage");
    }
  }, [initialSubstanceSlug]);

  /**
   * The blast radius, and the loudest thing on the page, split by tone so a
   * death warning on 31 substances is not hidden behind a sitewide caution
   * notice.
   */
  const coverage = useMemo(() => summarizeBannerCoverage(presets), [presets]);
  const capped = useMemo(
    () => summarizeCapSuppression(presets, targets.map((target) => target.slug)),
    [presets, targets],
  );

  /** Re-read one preset after a conflict and put the latest version in front of the editor. */
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

  /** The notice for a write that did not land, with its way forward. */
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
    // `recoverPending` is a plain function declared below; it only reads module state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [askLoadLatest]);

  /**
   * One POST is every write in this tool: authoring copy, enabling a class of
   * substances, and disabling one slug all submit a whole preset. Scope writes
   * submit the saved copy, never the pane's unsaved words. Returns the
   * confirmed preset and its new revision for the caller to adopt, or `null`
   * when the write failed and local edits must remain untouched.
   */
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

  /**
   * Every enablement write, from Coverage's single `Disable on <slug>` to the
   * search block's `Enable on all N results`, funnels through here so all of
   * them are confirmed the same way, write the same way and offer Undo. Undo is
   * the one caller that re-enters without a dialog: it is the escape hatch, and
   * a confirm on it would be clicked through blindly.
   *
   * A plain function rather than a `useCallback` so Undo can re-enter it with
   * the previous list, which is the whole of the undo mechanism.
   */
  async function commitEnabledSlugs(
    preset: WarningBannerPreset,
    nextSlugs: string[],
    summary: string,
  ) {
    const previous = preset.enabledSlugs;
    const adopted = await submitPreset({ ...preset, enabledSlugs: nextSlugs });
    if (!adopted) return;
    // Keep an open pane in step with a write made from inside it: the saved
    // list becomes the scope draft's list, and unsaved words stay a draft.
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

  /**
   * The only door to `commitEnabledSlugs` from a view. Disabling a slug removes
   * a warning from a public article the moment the write lands, so it confirms
   * as destructive; enabling confirms too. Both write the saved copy with the
   * new list, and the dialog says unsaved words stay behind. A preset that does
   * not exist yet has nothing live to change, so its list is a draft that
   * publishes with the preset.
   */
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
    // An enable that the two-banner cap would hide says so before it is confirmed.
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
    // `recoverPending` only reads module state and opens the confirm.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // `/dev/banners/preset:<key>` (the Cmd+K palette's preset records) opens
  // that preset's editor once the presets arrive. Each key opens once, so
  // closing the pane sticks.
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

  // What the field shows, and what everything else renders at. They differ only
  // while a number is half typed; the clamp is the one that reaches the server.
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

      // Adopt the echoed number, not the typed one: it is what the clamp stored,
      // and re-seeding the draft from it clears the unsaved line without waiting
      // for the reactive query to come back round.
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

  // The size changes every banner on the site, so it asks first and says so.
  const handleSaveIconSize = useCallback(() => {
    confirm({
      title: `Change the icon size on every banner to ${iconSize}px?`,
      description: `Every safety banner on every article that shows one renders its glyph at ${iconSize}px instead of ${storedIconSize}px, as soon as you confirm.`,
      confirmLabel: "Save size",
      onConfirm: saveIconSize,
    });
  }, [confirm, iconSize, saveIconSize, storedIconSize]);

  // Both drafts would go live on save (a preset on its articles, the size on
  // every banner), so the shell only discards them.
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

  // Cmd+S or Ctrl+S asks to publish the open preset; it never publishes past
  // the confirm. `/` focuses the substance search on screen.
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
        <EditorSection icon="lucide:triangle-alert" title="Banners">
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
        </EditorSection>
      </div>
    );
  }

  // Freeze turns a failed write's notice into the freeze's own words; the
  // draft stays, and the retry (when there is one) stays with it.
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
