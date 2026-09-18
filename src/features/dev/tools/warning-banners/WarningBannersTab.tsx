"use client";

/**
 * Banner Studio — `/dev` → Banners, deep-linked at `/dev/banners/<slug>`.
 *
 * Two jobs with very different frequencies live in one tab (design brief §3):
 * `Presets` authors the handful of banners that will ever exist, `Coverage`
 * audits what a reader actually sees on one substance. This module owns
 * everything the two views must not disagree about — the preset list, the loaded
 * corpus, the draft, every write, and the rollout readout.
 *
 * Three disciplines are load-bearing. Banners are opt-in: nothing here maps a
 * classification onto a rendered banner, and `searchWarningBannerTargets` only
 * ever produces slugs for an editor to enable by hand. Saving is never
 * optimistic — the route's echoed `enabledSlugs` is adopted verbatim because the
 * server drops slugs that no longer resolve, and a pruned slug that silently
 * stayed on screen would be a lie about what the public site shows. And the
 * glyph size is site-wide, so it is held here on its own wire — its own query,
 * its own draft, its own save state and its own notice — because a preset save
 * and a size save can be in flight at once and must never be mistaken for each
 * other.
 */

import { useCallback, useEffect, useMemo, useState } from "react";

import { Icon } from "@/components/common/Icon";
import { StateCard } from "@/components/common/StateCard";
import { Button } from "@/components/ui/button";
import {
  compareWarningBanners,
  clampSafetyBannerIconSize,
  isWarningBannerTone,
  normalizeEnabledSlugs,
  SAFETY_BANNER_ICON_SIZE_DEFAULT,
  type WarningBannerPreset,
  type WarningBannerTarget,
} from "@/data/substanceWarningBanners";
import {
  useConfirm,
  type EditorActionStatusState,
  type EditorNoticeMessage,
} from "@/features/dev/components";
import { useEditorRead, useInvalidateEditorReads } from "@/hooks/useEditorRead";
import { WarningBannersBoundary } from "./WarningBannersBoundary";
import {
  WarningBannersStudioView,
  type WarningBannersStudioViewMode,
} from "./WarningBannersStudioView";
import { summarizeBannerCoverage } from "./bannerCoverage";
import { planEnablementChange, type EnablementChange } from "./enablement";
import {
  cachedWarningBannerTargets,
  fetchWarningBannerTargets,
} from "./warningBannerTargets";
import { pendingWarning, publishWarning, readWarningJson, retryPendingWarning, writeWarning } from "./warningEditing";
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
 * `origin === null` marks a preset that does not exist yet, which is what makes
 * the key field editable and Save an insert rather than an update.
 */
type PresetEditor = {
  origin: EditableWarningPreset | null;
  draft: EditableWarningPreset;
};

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
  /** `/dev/banners/<slug>` — opens Coverage on that substance. */
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

function WarningBannersStudio({ initialSubstanceSlug }: WarningBannersTabProps) {
  const [rows, setRows] = useState<WarningBannerPresetDoc[] | undefined>(undefined);
  const [rowsError, setRowsError] = useState<string | null>(null);
  const [rowsToken, setRowsToken] = useState(0);

  useEffect(() => {
    let active = true;
    setRowsError(null);
    readWarningJson<{ presets: WarningBannerPresetDoc[] }>("/api/dev/warning-banner").then(
      (result) => { if (active) setRows(result.presets); },
      (error: unknown) => { if (active) setRowsError(error instanceof Error ? error.message : "The warning presets could not be loaded."); },
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
  const [targetsError, setTargetsError] = useState<string | null>(null);
  const [targetsToken, setTargetsToken] = useState(0);
  const [view, setView] = useState<StudioView>(
    initialSubstanceSlug ? "coverage" : "presets",
  );
  const [coverageSlug, setCoverageSlug] = useState(initialSubstanceSlug ?? "");
  const [editor, setEditor] = useState<PresetEditor | null>(null);
  const [iconValid, setIconValid] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [notice, setNotice] = useState<EditorNoticeMessage | null>(null);
  const { confirm, dialog: confirmDialog } = useConfirm();

  const isDirty = editor
    ? editor.origin === null || JSON.stringify(editor.origin) !== JSON.stringify(editor.draft)
    : false;

  /**
   * The site-wide glyph size. Its own query, draft, save state and notice, none
   * of them shared with `submitPreset`: an editor who saves a preset must not see
   * a pill claiming the size was stored, and vice versa.
   */
  const display = useEditorRead("siteConfig:getBannerDisplay", {}, "list");
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
  const [iconSizeNotice, setIconSizeNotice] = useState<EditorNoticeMessage | null>(null);

  useEffect(() => {
    if (view !== "coverage" && editor === null) return;
    let cancelled = false;
    fetchWarningBannerTargets({ refresh: targetsToken > 0 }).then(
      (items) => {
        if (!cancelled) {
          setTargets(items);
          setTargetsError(null);
        }
      },
      (error: unknown) => {
        if (!cancelled) {
          setTargetsError(
            error instanceof Error ? error.message : "The substance list could not be loaded.",
          );
        }
      },
    );
    return () => {
      cancelled = true;
    };
  }, [editor, targetsToken, view]);

  // A deep link can arrive while the tab is already mounted — an editor reading
  // an article clicks through to `/dev/banners/<slug>` and the controller hands
  // down a new slug rather than remounting. Mirrors `ReplicationStudioTab`.
  useEffect(() => {
    if (initialSubstanceSlug) {
      setCoverageSlug(initialSubstanceSlug);
      setView("coverage");
    }
  }, [initialSubstanceSlug]);

  /**
   * The blast radius, and the loudest thing on the page (design brief §2),
   * split by tone so a death warning on 31 substances is not hidden behind a
   * sitewide caution notice.
   */
  const coverage = useMemo(() => summarizeBannerCoverage(presets), [presets]);

  /**
   * One POST is every write in this tool: authoring copy, enabling a class of
   * substances, and disabling one slug all submit the whole preset. Returns the
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
        setNotice({
          tone: "danger",
          title: "Couldn't save that preset",
          message: error instanceof Error ? error.message : "The preset could not be saved.",
          actions: pendingWarning(preset.key) ? <Button variant="secondary" size="sm" onClick={() => recoverPending(preset.key)}>Reconcile original change</Button> : undefined,
        });
        return null;
      }
    },
    [],
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
    // Keep an open drawer in step with a write made from inside it, so the
    // dirty pill does not claim unsaved changes the server already has.
    if (editor && (editor.origin === null || editor.origin.key === preset.key)) {
      setEditor({ origin: adopted, draft: adopted });
    }

    setNotice({
      tone: "info",
      message: summary,
      actions: (
        <Button
          type="button"
          variant="secondary"
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
   * as destructive; enabling confirms too, because the write lands the whole
   * draft and the dialog is where an editor learns that.
   */
  function requestEnablement(preset: WarningBannerPreset, change: EnablementChange) {
    const dirty =
      isDirty && editor !== null && (editor.origin === null || editor.origin.key === preset.key);
    const plan = planEnablementChange(preset, change, targets, { dirty });
    confirm({
      ...plan.request,
      onConfirm: () => commitEnabledSlugs(preset, plan.nextSlugs, plan.summary),
    });
  }

  function recoverPending(key: string) {
    const operation = pendingWarning(key);
    if (!operation) return;
    confirm({
      title: `Resolve pending warning ${key}?`,
      description: <><p>Check the receipt, then retry only this original request with the same change id if necessary. Different local edits will not be sent.</p><pre className="max-h-48 overflow-auto whitespace-pre-wrap break-words text-xs">{JSON.stringify(operation.body, null, 2)}</pre></>,
      confirmLabel: "Reconcile or retry original change",
      onConfirm: async () => {
        setSaveState("saving");
        try {
          const result = await retryPendingWarning(key);
          const adopted = result.preset ? { ...result.preset, baseHash: result.baseHash } : null;
          setRows((current) => [...(current ?? []).filter((row) => row.key !== key), ...(adopted ? [adopted] : [])]);
          setEditor(adopted ? { origin: adopted, draft: adopted } : null);
          setSaveState("saved");
          setNotice({ tone: "info", message: `Confirmed the original change for ${key}.` });
        } catch (error) {
          setSaveState("error");
          setNotice({
            tone: "danger", title: "Original warning change unresolved",
            message: error instanceof Error ? error.message : "The original request could not be reconciled.",
            actions: pendingWarning(key) ? <Button variant="secondary" size="sm" onClick={() => recoverPending(key)}>Reconcile original change</Button> : undefined,
          });
        }
      },
    });
  }

  const openPreset = useCallback((preset: WarningBannerPreset | null) => {
    setEditor(preset ? { origin: preset, draft: preset } : null);
    setSaveState("idle");
    setNotice(preset && pendingWarning(preset.key) ? {
      tone: "warning", message: "An earlier warning publication remains unconfirmed. Resolve its original request before making another change.",
      actions: <Button variant="secondary" size="sm" onClick={() => recoverPending(preset.key)}>Reconcile original change</Button>,
    } : null);
  }, []);

  const handleSave = useCallback(() => {
    if (!editor) return;
    const reach = editor.draft.allSubstances ? "every substance article, including future articles" : editor.draft.enabledSlugs.join(", ") || "no assigned articles";
    confirm({
      title: "Publish shared warning preset?",
      description: `This changes shared warning copy on dose.wiki and Effect Index. Affected scope: ${reach}.`,
      confirmLabel: "Publish preset",
      onConfirm: async () => {
        const adopted = await submitPreset(editor.draft);
        if (adopted) setEditor({ origin: adopted, draft: adopted });
      },
    });
  }, [editor, submitPreset, confirm]);

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
      setNotice({
        tone: "danger",
        title: "Couldn't delete that preset",
        message: error instanceof Error ? error.message : "The preset could not be deleted.",
        actions: pendingWarning(preset.key) ? <Button variant="secondary" size="sm" onClick={() => recoverPending(preset.key)}>Reconcile original change</Button> : undefined,
      });
    }
  }, []);

  const requestDelete = useCallback(
    (preset: WarningBannerPreset) => {
      const reach = preset.allSubstances
        ? "every substance article"
        : `${preset.enabledSlugs.length} substance${preset.enabledSlugs.length === 1 ? "" : "s"}`;
      confirm({
        title: `Delete ${preset.key}?`,
        description: `${preset.key} is enabled on ${reach}. Deleting destroys its headline and mechanism text, and it stops rendering everywhere.`,
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

  const handleSaveIconSize = useCallback(async () => {
    setIconSizeSaveState("saving");
    setIconSizeNotice(null);

    try {
      const response = await fetch(WARNING_BANNER_DISPLAY_API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ iconSize }),
      });
      const payload = (await response.json()) as { error?: string; iconSize?: number };
      if (!response.ok || typeof payload.iconSize !== "number") {
        throw new Error(payload.error ?? "The icon size could not be saved.");
      }

      // Adopt the echoed number, not the typed one: it is what the clamp stored,
      // and re-seeding the draft from it clears the dirty pill without waiting
      // for the reactive query to come back round.
      const stored = clampSafetyBannerIconSize(payload.iconSize);
      setIconSizeDraft(String(stored));
      void invalidateEditorReads(["siteConfig:getBannerDisplay"]);
      setIconSizeSaveState("saved");
      setIconSizeNotice({
        tone: "info",
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

  if (rows === undefined) {
    if (rowsError) {
      return <StateCard compact tone="danger" title="Unable to load warning presets" description={rowsError} actions={<Button variant="secondary" onClick={() => setRowsToken((value) => value + 1)}>Retry preset read</Button>} />;
    }
    return (
      <StateCard loading compact className="mt-10" title="Loading banner presets" />
    );
  }

  // A new preset has no row to expand, so nothing in the table is marked open.
  const openKey = editor?.origin?.key ?? null;

  return (
    <WarningBannersStudioView
      confirmDialog={confirmDialog}
      initialSubstanceSlug={initialSubstanceSlug}
      presets={presets}
      targets={targets}
      targetsError={targetsError}
      coverage={coverage}
      view={view}
      coverageSlug={coverageSlug}
      openKey={openKey}
      draft={editor?.draft ?? null}
      isNew={editor !== null && editor.origin === null}
      isDirty={isDirty}
      saveState={saveState}
      notice={notice}
      iconSizeNotice={iconSizeNotice}
      iconSizeControl={{
        size: iconSize,
        text: iconSizeText,
        dirty: iconSizeDirty,
        saveState: iconSizeSaveState,
        onTextChange: (text) => {
          setIconSizeSaveState("idle");
          setIconSizeDraft(text);
        },
        onSave: () => void handleSaveIconSize(),
        onReset: () => {
          setIconSizeDraft(null);
          setIconSizeSaveState("idle");
          setIconSizeNotice(null);
        },
      }}
      iconValid={iconValid}
      onRetryTargets={() => setTargetsToken((token) => token + 1)}
      onViewChange={setView}
      onIconValidityChange={setIconValid}
      onDraftChange={(draft) => {
        setSaveState("idle");
        setEditor((current) => (current ? { ...current, draft } : current));
      }}
      onOpen={openPreset}
      onCreate={() => {
        setEditor({ origin: null, draft: BLANK_PRESET });
        setSaveState("idle");
        setNotice(null);
      }}
      onSave={() => void handleSave()}
      onDiscard={() =>
        setEditor((current) =>
          current?.origin ? { origin: current.origin, draft: current.origin } : null,
        )
      }
      onRequestEnablement={requestEnablement}
      onRequestDelete={requestDelete}
      onInspectCoverage={(slug) => {
        setCoverageSlug(slug);
        setView("coverage");
      }}
      onCoverageSlugChange={setCoverageSlug}
      onEditCoveragePreset={(preset) => {
        openPreset(preset);
        setView("presets");
      }}
    />
  );
}
