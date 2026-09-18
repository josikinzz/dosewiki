"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState, type ComponentProps } from "react";
import { ZodError } from "zod";
import { useRouter } from "next/navigation";
import { useT } from "@/i18n/client";
import { Button, Input, Textarea } from "@/components/ui";
import { Icon } from "@/components/common/Icon";
import { TOUCH_ICON } from "@/components/ui/touchTargets";
import { EditorField, EditorNotice, EditorSection, EditorStatusPill, EditorToolbar, useConfirm } from "@/features/dev/components";
import { ExpandButton } from "@/components/common/ExpandButton";
import { ContextualEditorPanel } from "@/features/contextual-editing/ContextualEditorPanel";
import { useContextualEditing } from "@/features/contextual-editing/context";
import { EditorLauncherTarget } from "@/features/editor-launcher/EditorLauncherTarget";
import { EffectArticlePage } from "../pages/EffectArticlePage";
import { buildEffectArticleModel, type SubjectiveEffectArticle } from "../articleSectionModel";
import { EFFECT_NARRATIVES, effectDraftFromRow, prepareEffectDraft, type EffectDraft } from "./effectEditorModel";

import { NarrativeHistory, type NarrativeHistoryEntry } from "./NarrativeHistory";
type Props = {
  slug: string;
  pageProps: Omit<ComponentProps<typeof EffectArticlePage>, "contributorDirectory" | "replicationsSection" | "headingActions">;
};
type Document = { effect: SubjectiveEffectArticle; baseRevision: string; history: History[] };
type History = NarrativeHistoryEntry;
export default function EffectContextualEditor(props: Props) {
  const { enabled, mode, role } = useContextualEditing();
  if (!enabled || role !== "admin") return null;
  return <>
    <EditorLauncherTarget target={{ kind: "effect", slug: props.slug, name: props.pageProps.article.hero.name }} />
    {mode === "edit" ? <EffectSession key={props.slug} {...props} /> : null}
  </>;
}

function EffectSession({ slug, pageProps }: Props) {
  const t = useT();
  const { setDirty, registerDraftGuard } = useContextualEditing();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [document, setDocument] = useState<Document | null>(null);
  const [draft, setDraft] = useState<EffectDraft | null>(null);
  const [listInputs, setListInputs] = useState({ tags: "", contributors: "" });
  const [additionalOpen, setAdditionalOpen] = useState(false);
  const additionalId = useId();
  const [citationsOpen, setCitationsOpen] = useState(false);
  const citationsId = useId();
  const fieldsRef = useRef<HTMLDivElement>(null);
  const { confirm, dialog } = useConfirm();
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [working, setBusy] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const busy = working || uncertain;
  const [preview, setPreview] = useState(false);
  const [reviewed, setReviewed] = useState<string | null>(null);
  const operation = useRef<{ body: string; id: string } | null>(null);
  const key = `effect:${slug}`;
  const baseline = useMemo(() => document ? effectDraftFromRow(document.effect) : null, [document]);
  const dirty = uncertain || JSON.stringify(draft) !== JSON.stringify(baseline);
  const fingerprint = JSON.stringify([draft, baseline]);
  const parsed = useMemo(() => {
    const fieldErrors: Record<string, string> = {};
    if (!draft || !document) return { updates: null, error: null, fieldErrors };
    try { return { updates: prepareEffectDraft(draft, document.effect), error: null, fieldErrors }; }
    catch (cause) {
      if (cause instanceof ZodError) {
        for (const issue of cause.issues) {
          const path = issue.path[0] === "tags" || issue.path[0] === "contributors" ? String(issue.path[0]) : issue.path.join(".");
          fieldErrors[path] = issue.path[0] === "name" && issue.code === "too_small"
            ? "Enter an effect name." : issue.message;
        }
        return { updates: null, error: "Fix the highlighted fields before previewing or reviewing changes.", fieldErrors };
      }
      return { updates: null, error: cause instanceof Error ? cause.message : "Invalid effect document.", fieldErrors };
    }
  }, [draft, document]);
  const citationsExpanded = citationsOpen || Object.keys(parsed.fieldErrors).some(path => path === "citations" || path.startsWith("citations."));
  const resetDraft = useCallback((next: EffectDraft | null) => {
    setDraft(next);
    setListInputs({ tags: (next?.tags ?? []).join(", "), contributors: (next?.contributors ?? []).join(", ") });
  }, []);
  const discard = useCallback(() => { if (busy) return; resetDraft(baseline); }, [baseline, busy, resetDraft]);
  useEffect(() => { setDirty(key, dirty); return () => setDirty(key, false); }, [key, dirty, setDirty]);
  useEffect(() => registerDraftGuard(key, { discard, canDiscard: !busy }), [key, discard, busy, registerDraftGuard]);
  const load = async (retain = false) => {
    if (uncertain) return;
    setBusy(true); setError(null);
    try {
      const response = await fetch(`/api/dev/effect-article?slug=${encodeURIComponent(slug)}`);
      const payload = await response.json() as Document & { error?: string };
      if (!response.ok) throw new Error(response.status === 401 || response.status === 403
        ? `${payload.error ?? "Editing access is unavailable."} Check that you are signed in with an admin account, then retry loading. Any local edits are retained.`
        : payload.error ?? "Unable to load this effect.");
      setDocument(payload);
      if (!retain) resetDraft(effectDraftFromRow(payload.effect));
      else setMessage("Latest published baseline loaded. Local edits are retained; review the diff before publishing.");
      operation.current = null;
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to load this effect."); }
    finally { setBusy(false); }
  };
  const publish = async () => {
    if (!document || !draft || !parsed.updates || reviewed !== fingerprint || working) return;
    setBusy(true); setError(null); setMessage(null);
    try {
      const body = JSON.stringify({ slug, expectedRevision: document.baseRevision, draft });
      if (operation.current?.body !== body) operation.current = { body, id: crypto.randomUUID() };
      setUncertain(true);
      const response = await fetch("/api/dev/effect-article", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...JSON.parse(body), operationId: operation.current.id }) });
      const result = await response.json() as { revision?: string; error?: string };
      if (!response.ok && response.status < 500) setUncertain(false);
      if (!response.ok || !result.revision) throw new Error(result.error ?? "Publication was not confirmed. Retry to reconcile the operation.");
      setUncertain(false);
      const saved = { ...document.effect, ...parsed.updates };
      setDocument({ ...document, effect: saved, baseRevision: result.revision });
      resetDraft(effectDraftFromRow(saved));
      setReviewed(null); setMessage("Published. The public effect projections have been invalidated."); router.refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Publication failed. Your local edits are retained."); }
    finally { setBusy(false); }
  };
  const replications = pageProps.article.sections.find(section => section.kind === "replications");
  const previewModel = document && parsed.updates ? buildEffectArticleModel({ effect: { ...document.effect, ...parsed.updates }, replications: replications?.state }) : null;
  const related = pageProps.article.sections.find(section => section.kind === "relatedSubstances");
  if (previewModel && related) {
    const sourcesIndex = previewModel.sections.findIndex(section => section.kind === "sources" || section.kind === "contributors");
    previewModel.sections.splice(sourcesIndex < 0 ? previewModel.sections.length : sourcesIndex, 0, related);
  }
  const update = (patch: Partial<EffectDraft>) => {
    setMessage(null);
    setDraft(current => current ? { ...current, ...patch } : current);
  };
  const reveal = (selector: string) => requestAnimationFrame(() => {
    const section = fieldsRef.current?.querySelector<HTMLElement>(selector);
    section?.scrollIntoView({ block: "start" });
    section?.focus({ preventScroll: true });
  });
  return <>
    <Button type="button" variant="iconGhost" size="sm" className={`w-8 shrink-0 p-0 ${TOUCH_ICON}`} aria-label="Edit effect" title="Edit effect" onClick={() => { setOpen(true); if (!document) void load(); }}>
      <Icon icon="lucide:pencil" size={16} aria-hidden />
    </Button>
    <ContextualEditorPanel
      title={`Edit effect · ${pageProps.article.hero.name}`}
      open={open}
      onOpenChange={next => {
        if (!next && busy && document) return;
        if (!next && dirty) {
          confirm({
            title: "Discard local effect edits?",
            description: "These edits have not been saved. Cancel to keep editing.",
            confirmLabel: "Discard and close",
            destructive: true,
            onConfirm: () => { if (busy) return; discard(); setOpen(false); },
          });
        } else setOpen(next);
      }}
      description="Local edits only. Confirmation changes this effect on dose.wiki and Effect Index. There is no saved draft or proposal workflow."
    >
      {error ? <EditorNotice notice={{ tone: "danger", message: error }} /> : null}
      {message ? <EditorNotice notice={{ tone: "info", message }} /> : null}
      {uncertain ? <EditorNotice notice={{ tone: "warning", message: "Publication is not confirmed. Editing, closing and discard are locked until you reconcile the original operation.", actions: <Button disabled={working} onClick={() => void publish()}>Retry publication confirmation</Button> }} /> : null}
      {busy && !document ? <p role="status">Loading effect… You can close this editor while it loads.</p> : null}
      {!document && !busy ? <Button onClick={() => void load()}>Retry loading</Button> : null}
      {draft ? <div ref={fieldsRef} className="min-w-0 space-y-6">
        <EditorToolbar variant="sticky" className="bg-[var(--editor-panel-bg)]">
          <Button type="button" variant="iconGhost" size="sm" className={`w-8 shrink-0 p-0 ${TOUCH_ICON}`} aria-label={preview ? "Close preview" : "Preview locally"} title={preview ? "Close preview" : "Preview locally"} aria-expanded={preview} disabled={!!parsed.error} onClick={() => { setPreview(value => !value); if (!preview) reveal("[data-effect-preview]"); }}>
            <Icon icon={preview ? "lucide:eye-off" : "lucide:eye"} size={16} aria-hidden />
          </Button>
          <Button type="button" size="sm" disabled={!dirty || busy || !!parsed.error} onClick={() => { setReviewed(fingerprint); reveal("[data-effect-review]"); }}>Review changes</Button>
          <EditorStatusPill tone={dirty ? "warning" : "neutral"}>{dirty ? "Unsaved changes" : "No changes"}</EditorStatusPill>
        </EditorToolbar>
        {parsed.error ? <EditorNotice notice={{
          tone: "danger",
          message: parsed.error,
          actions: Object.keys(parsed.fieldErrors).length ? <Button variant="outline" size="sm" onClick={() => {
            setAdditionalOpen(true);
            requestAnimationFrame(() => {
              const invalid = fieldsRef.current?.querySelector<HTMLElement>('[aria-invalid="true"], [data-validation-error="true"]');
              invalid?.scrollIntoView({ block: "center" });
              invalid?.focus({ preventScroll: true });
            });
          }}>Go to first error</Button> : undefined,
        }} /> : null}
        {reviewed === fingerprint && baseline ? <EditorSection headingLevel="h3" title="Review effect changes" data-effect-review tabIndex={-1} className="scroll-mt-32" description="Only this effect changes, on dose.wiki and Effect Index. Nothing is published until you confirm.">
          {(Object.keys(draft) as Array<keyof EffectDraft>).filter(field => JSON.stringify(draft[field]) !== JSON.stringify(baseline[field])).map(field => <div key={field} className="min-w-0 space-y-2">
            <h4 className="font-semibold">{FIELD_LABELS[field]}</h4>
            <div className="grid min-w-0 gap-3 md:grid-cols-2">
              <div className="min-w-0"><p className="theme-text-muted text-sm">Published baseline</p><pre role="region" tabIndex={0} aria-label={`${FIELD_LABELS[field]}: published baseline`} className="max-h-64 overflow-auto whitespace-pre-wrap [overflow-wrap:anywhere] text-sm">{typeof baseline[field] === "string" ? baseline[field] : JSON.stringify(baseline[field], null, 2) ?? "Not set"}</pre></div>
              <div className="min-w-0"><p className="theme-text-muted text-sm">Local changes</p><pre role="region" tabIndex={0} aria-label={`${FIELD_LABELS[field]}: local changes`} className="max-h-64 overflow-auto whitespace-pre-wrap [overflow-wrap:anywhere] text-sm">{typeof draft[field] === "string" ? draft[field] : JSON.stringify(draft[field], null, 2)}</pre></div>
            </div>
          </div>)}
          <Button variant="accent" disabled={busy || !!parsed.error || !dirty} onClick={() => void publish()}>Confirm publication</Button>
        </EditorSection> : null}
        {preview && previewModel && !parsed.error ? <EditorSection headingLevel="h3" title="Local preview" data-effect-preview tabIndex={-1} className="scroll-mt-32" description="The public effect renderer; nothing is published here."><EffectArticlePage {...pageProps} article={previewModel} embedded t={t} /></EditorSection> : null}
        <EditorSection headingLevel="h3" title="Overview">
          <EditorField label="Name" required error={parsed.fieldErrors.name}>{control => <Input {...control} value={draft.name} disabled={busy} onChange={event => update({ name: event.target.value })} />}</EditorField>
          <EditorField label="Summary" error={parsed.fieldErrors.summary}>{control => <Textarea {...control} value={draft.summary} disabled={busy} onChange={event => update({ summary: event.target.value })} />}</EditorField>
          <EditorField label="Description (VCode)" description="Main article text. Use Preview locally to check how VCode source renders; preserve existing citation and subarticle markers." error={parsed.fieldErrors.description_raw}>{control => <Textarea {...control} className="font-mono" rows={8} value={draft.description_raw} disabled={busy} onChange={event => update({ description_raw: event.target.value })} />}</EditorField>
          <ExpandButton variant="inline" isExpanded={additionalOpen} onToggle={() => setAdditionalOpen(value => !value)} ariaControls={additionalId} ariaLabel="Additional narrative sections" label="Additional narrative sections" />
          <div id={additionalId} hidden={!additionalOpen} className="space-y-4">
            {EFFECT_NARRATIVES.filter(field => field !== "description").map(field => <EditorField key={field} label={`${FIELD_LABELS[`${field}_raw`]} (VCode)`} error={parsed.fieldErrors[`${field}_raw`]}>{control => <Textarea {...control} className="font-mono" rows={6} value={draft[`${field}_raw`] ?? ""} disabled={busy} onChange={event => update({ [`${field}_raw`]: event.target.value })} />}</EditorField>)}
          </div>
        </EditorSection>
        <EditorSection headingLevel="h3" title="Classification and attribution">
          {(["tags", "contributors"] as const).map(field => <EditorField key={field} label={FIELD_LABELS[field]} description="Comma separated." error={parsed.fieldErrors[field]}>{control => <Input {...control} value={listInputs[field]} disabled={busy} onChange={event => {
            const value = event.target.value;
            setListInputs(current => ({ ...current, [field]: value }));
            update({ [field]: value.split(",").map(item => item.trim()).filter(Boolean) });
          }} />}</EditorField>)}
          <EditorField label="Social image URL" description="Use an https/http URL or a site-relative /path." error={parsed.fieldErrors.social_media_image}>{control => <Input {...control} value={draft.social_media_image ?? ""} disabled={busy} onChange={event => update({ social_media_image: event.target.value })} />}</EditorField>
          <Button variant="outline" disabled={busy} aria-pressed={draft.featured ?? false} onClick={() => update({ featured: !draft.featured })}>{draft.featured ? "Featured effect" : "Not featured"}</Button>
        </EditorSection>
        {(["see_also", "external_links"] as const).map(field => <StructuredFields key={field} field={field} value={draft[field] ?? []} disabled={busy} errors={parsed.fieldErrors} onChange={value => update({ [field]: value })} />)}
        <section className="space-y-4">
          <ExpandButton
            variant="inline"
            className="min-h-11 w-full justify-between gap-3 text-sm font-semibold before:inset-0"
            isExpanded={citationsExpanded}
            onToggle={() => setCitationsOpen(value => !value)}
            label={`Citations (${draft.citations?.length ?? 0})`}
            ariaLabel="Citations"
            ariaControls={citationsId}
          />
          <div id={citationsId} hidden={!citationsExpanded}>
            <StructuredFields field="citations" value={draft.citations ?? []} disabled={busy} errors={parsed.fieldErrors} onChange={value => update({ citations: value.map(row => ({ url: row.url ?? "", text: row.text ?? "", from: row.from })) })} />
          </div>
        </section>
        <StructuredFields field="subarticles" value={draft.subarticles ?? []} disabled={busy} errors={parsed.fieldErrors} onChange={value => update({ subarticles: value.map(row => ({ id: row.id ?? "", title: row.title ?? "" })) })} />
        <EditorToolbar label="Draft recovery">
          <Button variant="ghost" disabled={busy || !dirty} onClick={discard}>Discard local edits</Button>
          <Button variant="ghost" disabled={busy} onClick={() => void load(true)}>Reload published baseline</Button>
        </EditorToolbar>
        {document ? <NarrativeHistory entries={document.history} /> : null}
      </div> : null}
    </ContextualEditorPanel>
    {dialog}
  </>;
}

const FIELD_LABELS: Record<keyof EffectDraft, string> = {
  name: "Name", summary: "Summary", description_raw: "Description", long_summary_raw: "Long summary",
  analysis_raw: "Analysis", style_variations_raw: "Style variations", personal_commentary_raw: "Personal commentary",
  tags: "Tags", contributors: "Contributors", social_media_image: "Social image URL", featured: "Featured effect",
  see_also: "See also", external_links: "External links", citations: "Citations", subarticles: "Subarticles",
};
const STRUCTURED_KEYS = { see_also: ["location", "title"], external_links: ["url", "title"], citations: ["url", "text", "from"], subarticles: ["id", "title"] } as const;
const STRUCTURED_LABELS: Record<string, string> = { location: "Destination URL", url: "URL", title: "Title", text: "Citation text", from: "Source attribution", id: "Subarticle ID" };
function StructuredFields({ field, value, disabled, errors, onChange }: { field: keyof typeof STRUCTURED_KEYS; value: Array<Record<string, string | undefined>>; disabled: boolean; errors: Record<string, string>; onChange: (value: Array<Record<string, string | undefined>>) => void }) {
  return <EditorSection headingLevel="h3" title={FIELD_LABELS[field]}>
    {errors[field] ? <div tabIndex={-1} data-validation-error="true"><EditorNotice notice={{ tone: "danger", message: errors[field] }} /></div> : null}
    {value.map((row, index) => <div key={index} className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
      <div className="min-w-0 space-y-3">
      {STRUCTURED_KEYS[field].map(key => <EditorField key={key} label={`${FIELD_LABELS[field]} ${index + 1}: ${STRUCTURED_LABELS[key]}`} description={key === "url" || key === "location" ? "Use an https/http URL or a site-relative /path." : undefined} error={errors[`${field}.${index}.${key}`]}>{control => <Input {...control} value={row[key] ?? ""} disabled={disabled} onChange={event => onChange(value.map((entry, position) => position === index ? { ...entry, [key]: event.target.value } : entry))} />}</EditorField>)}
      </div>
      <Button type="button" variant="ghost" size="auto" className={`h-8 w-8 shrink-0 ${TOUCH_ICON}`} disabled={disabled} title={`Remove ${FIELD_LABELS[field].toLowerCase()} ${index + 1}`} aria-label={`Remove ${FIELD_LABELS[field].toLowerCase()} ${index + 1}`} onClick={() => onChange(value.filter((_, position) => position !== index))}><Icon icon="lucide:trash-2" size={16} /></Button>
    </div>)}
    <Button type="button" variant="outline" disabled={disabled} onClick={() => onChange([...value, Object.fromEntries(STRUCTURED_KEYS[field].filter(key => key !== "from").map(key => [key, ""]))])}>Add {FIELD_LABELS[field].toLowerCase()}</Button>
  </EditorSection>;
}
