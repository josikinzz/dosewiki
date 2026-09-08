"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Surface } from "@/components/ui/surface";
import { Icon } from "@/components/common/Icon";
import { useContextualEditing } from "@/features/contextual-editing/context";
import { ContextualEditorPanel } from "@/features/contextual-editing/ContextualEditorPanel";
import { EditorCheckbox, EditorField, EditorSelect, useConfirm } from "@/features/dev/components";
import { PresetDrawer } from "@/features/dev/tools/warning-banners/PresetDrawer";
import { fetchWarningBannerTargets } from "@/features/dev/tools/warning-banners/warningBannerTargets";
import {
  publishWarning, readWarningJson, readWarningState, writeWarning, WarningRequestError,
  pendingWarning, pendingArticleWarning, retryPendingWarning,
  type WarningEditorState, type WarningRevision, type WarningResult,
} from "@/features/dev/tools/warning-banners/warningEditing";
import type { EditableWarningPreset } from "@/features/dev/tools/warning-banners/warningEditing";
import {
  resolveEnabledBanners, resolveSuppressedBanners, SAFETY_BANNER_ICON_SIZE_DEFAULT,
  type WarningBannerPreset,
} from "@/data/substanceWarningBanners";
import { SubstanceWarningBanners } from "../components/sections/SubstanceWarningBanners";

type Props = { slug: string; iconSize?: number; onPublished?: () => void };

export default function WarningContextualEditor(props: Props) {
  const { enabled, mode, role, email } = useContextualEditing();
  if (!enabled || mode !== "edit" || role !== "admin") return null;
  return <WarningEditor key={`${props.slug}:${email}`} {...props} />;
}

function WarningEditor({ slug, iconSize = SAFETY_BANNER_ICON_SIZE_DEFAULT, onPublished }: Props) {
  const router = useRouter();
  const { setDirty, registerDraftGuard } = useContextualEditing();
  const [open, setOpen] = useState(false);
  const [presets, setPresets] = useState<EditableWarningPreset[]>([]);
  const [state, setState] = useState<WarningEditorState | null>(null);
  const [draft, setDraft] = useState<EditableWarningPreset | null>(null);
  const [scope, setScope] = useState<"assignment" | "preset">("assignment");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uncertainKey, setUncertainKey] = useState<string | null>(() => pendingArticleWarning(slug)?.body.key ?? null);
  const [locked, setLocked] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [iconValid, setIconValid] = useState(false);
  const [sitewideSlugs, setSitewideSlugs] = useState<string[] | null>(null);
  const { confirm, dialog } = useConfirm();
  const baseline = state?.preset ? { ...state.preset, baseHash: state.baseHash } : null;
  const dirty = Boolean(draft && baseline && JSON.stringify(draft) !== JSON.stringify(baseline));
  const dirtyKey = `warning:${slug}`;
  const blocked = saving || uncertainKey !== null;
  const discard = useCallback(() => {
    if (blocked) throw new Error("Resolve the pending warning publication before discarding local edits.");
    setDraft(state?.preset ? { ...state.preset, baseHash: state.baseHash } : null);
    setError(null);
  }, [state, blocked]);
  useEffect(() => { setDirty(dirtyKey, dirty || blocked); return () => setDirty(dirtyKey, false); }, [dirty, blocked, dirtyKey, setDirty]);
  useEffect(() => registerDraftGuard(dirtyKey, { discard, canDiscard: !blocked }), [dirtyKey, discard, blocked, registerDraftGuard]);

  function fail(reason: unknown) {
    const key = draft?.key ?? uncertainKey ?? pendingArticleWarning(slug)?.body.key;
    setUncertainKey(key && pendingWarning(key) ? key : null);
    if (reason instanceof WarningRequestError && (reason.status === 401 || reason.status === 403)) {
      setLocked(true); setState(null); setDraft(null); setPresets([]);
    }
    setError(reason instanceof Error ? reason.message : "Unable to load this warning. Try again.");
  }

  async function selectPreset(key: string) {
    setLoading(true); setError(null); setNotice(null);
    try {
      const next = await readWarningState(key);
      setState(next);
      const operation = pendingWarning(key);
      setUncertainKey(operation ? key : null);
      if (operation?.body.action === "publish") {
        const original = operation.body as EditableWarningPreset;
        setDraft({
          key: original.key, tone: original.tone, icon: original.icon,
          severityLabel: original.severityLabel, headline: original.headline, points: original.points,
          enabled: original.enabled, allSubstances: original.allSubstances, enabledSlugs: original.enabledSlugs,
          baseHash: original.baseHash,
        });
        setScope(operation.body.scope === "assignment" ? "assignment" : "preset");
      } else setDraft(next.preset ? { ...next.preset, baseHash: next.baseHash } : null);
    } catch (reason) { fail(reason); }
    finally { setLoading(false); }
  }

  async function load() {
    setLoading(true); setError(null);
    try {
      const result = await readWarningJson<{ presets: EditableWarningPreset[] }>("/api/dev/warning-banner");
      setPresets(result.presets);
      const pendingKey = pendingArticleWarning(slug)?.body.key;
      const first = result.presets.find((preset) => preset.enabledSlugs.includes(slug) || preset.allSubstances) ?? result.presets[0];
      if (pendingKey || first) await selectPreset(pendingKey ?? first!.key);
    } catch (reason) { fail(reason); }
    finally { setLoading(false); }
  }

  useEffect(() => {
    if (!open || (!draft?.allSubstances && !state?.history.some((revision) => revision.allSubstances)) || sitewideSlugs) return;
    let active = true;
    fetchWarningBannerTargets({ refresh: true }).then((targets) => {
      if (active) setSitewideSlugs(targets.map((target) => target.slug));
    }, (reason: unknown) => { if (active) fail(reason); });
    return () => { active = false; };
  }, [open, draft?.allSubstances, state?.history, sitewideSlugs]);

  function changeContext(action: () => void) {
    if (blocked) {
      setError("Resolve the pending warning publication before closing, discarding or changing editors.");
      return;
    }
    if (!dirty) { action(); return; }
    confirm({ title: "Discard local warning changes?", description: "These edits have not been published. Discard them or cancel to keep editing.", confirmLabel: "Discard local changes", destructive: true, onConfirm: () => { discard(); action(); } });
  }

  const impact = scope === "assignment" ? [slug] : draft?.allSubstances ? sitewideSlugs : draft?.enabledSlugs ?? [];
  const projected = draft ? presets.map((preset) => preset.key === draft.key ? draft : preset) : presets;
  const preview = resolveEnabledBanners(projected, slug);
  const suppressed = resolveSuppressedBanners(projected, slug);

  async function adopt(result: WarningResult) {
    setUncertainKey(null);
    setPresets((current) => result.preset
      ? [...current.filter((preset) => preset.key !== result.key), { ...result.preset!, baseHash: result.baseHash }]
      : current.filter((preset) => preset.key !== result.key));
    const next = result.preset ? { ...result.preset, baseHash: result.baseHash } : null;
    setDraft(next);
    setState({ preset: result.preset, baseHash: result.baseHash, history: [], operation: result });
    setNotice(`Published ${result.key}. The warning projection is confirmed; attributed history is recorded.`);
    router.refresh(); onPublished?.();
    try { setState(await readWarningState(result.key)); }
    catch (reason) { fail(reason); }
  }

  async function publish() {
    if (!draft || !impact || blocked) return;
    const submitted = draft;
    confirm({
      title: scope === "assignment" ? `Publish assignment on ${slug}?` : `Publish shared preset ${draft.key}?`,
      description: scope === "assignment"
        ? `Only this article's assignment changes on dose.wiki and Effect Index. Shared warning wording is unchanged.`
        : `Shared warning wording changes on dose.wiki and Effect Index for every listed assignment.${draft.allSubstances ? " Sitewide coverage also includes all future substance articles." : ""}${!draft.enabled ? " The preset is currently disabled; this updates its stored wording without enabling it." : ""}`,
      affected: impact, confirmLabel: scope === "assignment" ? "Publish assignment" : "Publish shared preset",
      onConfirm: async () => {
        setSaving(true); setError(null); setNotice(null);
        try { await adopt(await publishWarning(submitted, scope, slug)); }
        catch (reason) { fail(reason); }
        finally { setSaving(false); }
      },
    });
  }

  function restore(revision: WarningRevision) {
    if (!state || dirty || blocked) return;
    confirm({ title: `Reverse ${revision.key} change?`,
      description: `This publishes a new attributed inverse change on dose.wiki and Effect Index. Scope: ${revision.scope === "assignment" ? `local assignment on ${revision.slug}` : "shared preset"}.${revision.allSubstances ? " Every current and future substance article is affected." : ""} It is rejected if any later warning change has landed.`,
      affected: revision.allSubstances ? sitewideSlugs ?? [] : revision.affectedSlugs, confirmLabel: "Publish inverse change", destructive: true,
      onConfirm: async () => {
        setSaving(true); setError(null);
        try { await adopt(await writeWarning("POST", { action: "restore", key: revision.key, revisionId: revision.revisionId, baseHash: state.baseHash, scope: revision.scope, slug })); }
        catch (reason) { fail(reason); }
        finally { setSaving(false); }
      },
    });
  }

  function reconcile() {
    if (!uncertainKey || saving) return;
    const operation = pendingWarning(uncertainKey);
    if (!operation) {
      setUncertainKey(null);
      return;
    }
    confirm({
      title: `Resolve pending warning ${uncertainKey}?`,
      description: "First check whether this exact change committed. If no receipt exists, retry only the original request below with the same change id. No newly edited values will be sent.",
      confirmLabel: "Reconcile or retry original change",
      onConfirm: async () => {
        setSaving(true); setError(null);
        try { await adopt(await retryPendingWarning(operation.body.key)); }
        catch (reason) { fail(reason); }
        finally { setSaving(false); }
      },
    });
  }

  return <>
    <Button variant="outline" size="sm" className="shrink-0" aria-label="Edit article warnings" title="Edit article warnings" onClick={() => { setOpen(true); if (!state && !locked) void load(); }}>
      <Icon icon="lucide:triangle-alert" size={16} aria-hidden /> Warnings
    </Button>
    <ContextualEditorPanel title={`Warnings · ${slug}`} description="Local preview is not saved. Choose one article's assignment or explicitly edit shared preset wording; publish only after reviewing its scope." open={open} onOpenChange={(next) => changeContext(() => setOpen(next))}>
      <div className="space-y-6 overflow-y-auto pr-1">
        {error ? <p role="alert" className="text-dose-danger">{error}</p> : null}
        {notice ? <p role="status" className="theme-text-secondary">{notice}</p> : null}
        {locked ? <p>Sign in again to reopen warning editing. No write will be replayed automatically.</p> : <>
          {uncertainKey ? <Surface variant="subtle" padding="sm" radius="lg">
            <h3 className="font-semibold">Warning publication remains unconfirmed</h3>
            <p className="theme-text-secondary text-sm">Keep this editor open. Discard, navigation and new changes are blocked until the original operation is resolved.</p>
            <pre className="my-3 max-h-48 overflow-auto whitespace-pre-wrap break-words text-xs">{JSON.stringify(pendingWarning(uncertainKey)?.body, null, 2)}</pre>
            <Button variant="secondary" disabled={saving || loading} onClick={reconcile}>Reconcile pending warning</Button>
          </Surface> : null}
          {loading ? <p role="status">Loading current warnings and history…</p> : null}
          {!loading && !error && presets.length === 0 ? <p>No warning presets are available. Preset creation and bulk coverage remain in the Banners workbench.</p> : null}
          {presets.length > 0 ? <fieldset disabled={blocked || loading} className="space-y-6">
            <EditorField label="Warning preset">
              {(props) => <EditorSelect {...props} value={draft?.key ?? state?.history[0]?.key ?? ""} options={presets.map((preset) => ({ value: preset.key, label: preset.key }))} onChange={(event) => { const key = event.target.value; changeContext(() => void selectPreset(key)); }} />}
            </EditorField>
            <EditorField label="Scope of this edit">
              {(props) => <EditorSelect {...props} value={scope} options={[{ value: "assignment", label: `Local assignment · ${slug} only` }, { value: "preset", label: "Shared preset · all assigned articles" }]} onChange={(event) => { const value = event.target.value as "assignment" | "preset"; changeContext(() => setScope(value)); }} />}
            </EditorField>
            {draft ? <>
              <Surface variant="subtle" padding="sm" radius="lg">
                <h3 className="font-semibold">{scope === "assignment" ? "Local assignment" : "Shared preset impact"}</h3>
                <p className="theme-text-secondary text-sm">Publications: dose.wiki and Effect Index. {scope === "assignment" ? "Shared wording and every other article stay unchanged." : draft.allSubstances ? "Every current and future substance article. Current articles are listed below." : "Wording is shared by all assignments listed below. Bulk coverage is not editable here."}</p>
                {!draft.enabled ? <p className="theme-text-secondary text-sm">This preset is disabled. Assignment or wording changes do not turn it on.</p> : null}
                {impact ? <ul className="mt-2 max-h-40 overflow-y-auto text-sm">{impact.map((item) => <li key={item}>{item}</li>)}</ul> : <p role="status">Loading the full shared impact list…</p>}
                {impact?.length === 0 ? <p>No articles are assigned to this preset.</p> : null}
              </Surface>
              {scope === "assignment" ? <>
                {draft.allSubstances ? <p>This sitewide preset has no local opt-out. Its coverage can only be changed explicitly in the Banners workbench; do not remove it from other articles to hide it here.</p> : <EditorCheckbox checked={draft.enabledSlugs.includes(slug)} label={`Assign ${draft.key} to ${slug}`} onChange={(event) => setDraft({ ...draft, enabledSlugs: event.target.checked ? [...draft.enabledSlugs, slug].sort() : draft.enabledSlugs.filter((item) => item !== slug) })} />}
                <h3 className="font-semibold">Local article preview</h3>
                <SubstanceWarningBanners banners={preview} iconSize={iconSize} />
                {preview.length === 0 ? <p>No warning banners render on this article with these assignments.</p> : null}
                {suppressed.length ? <p className="theme-text-secondary text-sm">The article's banner cap suppresses: {suppressed.map((preset) => preset.key).join(", ")}.</p> : null}
                <div className="flex flex-wrap gap-2"><Button variant="accent" disabled={!dirty || draft.allSubstances} onClick={() => void publish()}>Publish assignment</Button><Button variant="secondary" disabled={!dirty} onClick={discard}>Discard changes</Button></div>
              </> : <PresetDrawer contextual draft={draft} isNew={false} isDirty={dirty} saveState={saving ? "saving" : "idle"} iconValid={iconValid && impact !== null} iconSize={iconSize} targets={[]} onIconValidityChange={setIconValid} onDraftChange={setDraft} onSave={() => void publish()} onDiscard={discard} />}
            </> : null}
          </fieldset> : null}
          <div className="flex flex-wrap gap-2"><Button variant="secondary" disabled={blocked || loading} onClick={() => changeContext(() => { if (draft) void selectPreset(draft.key); else void load(); })}>Reload current warning</Button><Button variant="ghost" disabled={blocked} onClick={() => changeContext(() => setOpen(false))}>Close</Button></div>
          {state ? <section className="space-y-4">
            <h3 className="font-semibold">Attributed warning history</h3>
            {state?.history.length ? state.history.map((revision) => <div key={revision.revisionId} className="space-y-2 border-t border-dose-divider pt-3">
              <p className="text-sm">{revision.operation} · {revision.scope === "assignment" ? `local assignment: ${revision.slug}` : "shared preset"} · {revision.actorEmail} · {revision.createdAt}</p>
              <p className="theme-text-secondary text-xs">{revision.allSubstances ? "All current and future substance articles" : revision.affectedSlugs.join(", ") || "No assignments"} · {revision.publications.join(", ")}</p>
              <dl className="space-y-2 text-sm">{changedFields(revision).map((field) => <div key={field}><dt className="font-medium">{field}</dt><dd className="whitespace-pre-wrap break-words theme-text-secondary">Before: {JSON.stringify(revision.before?.[field]) ?? "absent"}{"\n"}After: {JSON.stringify(revision.after?.[field]) ?? "absent"}</dd></div>)}</dl>
              <Button variant="secondary" size="sm" disabled={dirty || blocked || state.baseHash !== revision.resultHash || (revision.allSubstances && sitewideSlugs === null)} onClick={() => restore(revision)}>Reverse this change</Button>
            </div>) : <p className="theme-text-secondary text-sm">No recorded changes for this preset.</p>}
          </section> : null}
        </>}
      </div>
    </ContextualEditorPanel>
    {dialog}
  </>;
}

function changedFields(revision: WarningRevision): (keyof WarningBannerPreset)[] {
  const keys = new Set([...Object.keys(revision.before ?? {}), ...Object.keys(revision.after ?? {})] as (keyof WarningBannerPreset)[]);
  return [...keys].filter((key) => JSON.stringify(revision.before?.[key]) !== JSON.stringify(revision.after?.[key]));
}
