"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { useContextualEditing } from "@/features/contextual-editing/context";
import { ContextualEditorPanel } from "@/features/contextual-editing/ContextualEditorPanel";
import { PortalReportEditor } from "@/features/dev/tools/trip-report-portal/PortalReportEditor";
import { toPortalRowFromReport } from "@/features/dev/tools/trip-report-portal/tripReportPortalModel";
import type { TripReportEditableFields } from "../../../../server/lib/tripReportEditing";
import type { TripReport } from "@/types/tripReport";
import type { SubstanceLookupRecord } from "../domain/tripReportIndex";
import { TripReportDetailPresentation } from "../pages/TripReportDetailPresentation";
import { useT } from "@/i18n/client";
import { useConfirm, useDirtyGuard } from "@/features/dev/components";

type Props = { report: TripReport; substanceBySlug: Record<string, SubstanceLookupRecord>; substanceLinks?: Record<string, string> };
type EditableRecord = { id: string; slug: string; canEdit: boolean; fields: TripReportEditableFields; revision: string };

const CORRECTION_LABELS: Record<keyof TripReportEditableFields, string> = {
  title: "Report title",
  subject: "Report details",
  substances: "Substances",
  introduction: "Introduction",
  onset: "Onset",
  peak: "Peak",
  offset: "Offset",
  conclusion: "Conclusion / Aftermath",
  tags: "Tags",
};

const SUBJECT_LABELS: Record<keyof TripReportEditableFields["subject"], string> = {
  name: "Author", trip_date: "Trip date", age: "Age", gender: "Gender",
  height: "Height", weight: "Weight", medications: "Medications", setting: "Setting",
};

function CorrectionValue({ field, fields }: { field: keyof TripReportEditableFields; fields: TripReportEditableFields }) {
  switch (field) {
    case "subject":
      return <dl className="space-y-2">{(Object.keys(fields.subject) as (keyof TripReportEditableFields["subject"])[]).map((key) => <div key={key}><dt className="theme-text-muted text-sm">{SUBJECT_LABELS[key]}</dt><dd className="whitespace-pre-wrap break-words">{fields.subject[key] || "Not provided"}</dd></div>)}</dl>;
    case "substances":
      return fields.substances.length ? <ul className="space-y-3">{fields.substances.map((entry, index) => <li key={index}><p className="font-medium">{entry.name || "Unnamed substance"}</p><dl><div><dt className="theme-text-muted inline">Dose: </dt><dd className="inline">{entry.dose || "Not provided"}</dd></div><div><dt className="theme-text-muted inline">Route: </dt><dd className="inline">{entry.roa || "Not provided"}</dd></div></dl></li>)}</ul> : <p>No substances.</p>;
    case "onset":
    case "peak":
    case "offset":
      return fields[field].length ? <ol className="list-decimal space-y-3 pl-5">{fields[field].map((entry, index) => <li key={index}>{entry.time && <p className="theme-text-muted text-sm">{entry.time}</p>}<p className="whitespace-pre-wrap">{entry.description || "No description."}</p></li>)}</ol> : <p>No entries.</p>;
    case "tags":
      return <p>{fields.tags.length ? fields.tags.join(", ") : "No tags."}</p>;
    default:
      return <p className="whitespace-pre-wrap">{fields[field] || "Not provided"}</p>;
  }
}

export default function PublishedReportEditor(props: Props) {
  const { enabled, mode } = useContextualEditing();
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  if (!enabled || mode !== "edit") return null;
  return <>
    <Button ref={triggerRef} variant="outline" onClick={() => setOpen(true)}>Correct published report</Button>
    {open ? <ReportSession {...props} onClose={() => setOpen(false)} returnFocusRef={triggerRef} /> : null}
  </>;
}

function ReportSession({ report, substanceBySlug, substanceLinks, onClose, returnFocusRef }: Props & { onClose: () => void; returnFocusRef: RefObject<HTMLElement | null> }) {
  const t = useT();
  const { role, setDirty, registerDraftGuard } = useContextualEditing();
  const router = useRouter();
  const [record, setRecord] = useState<EditableRecord | null>(null);
  const [draft, setDraft] = useState<TripReportEditableFields | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [review, setReview] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [success, setSuccess] = useState(false);
  const [reload, setReload] = useState(0);
  const pending = useRef<string | null>(null);
  const reviewHeading = useRef<HTMLHeadingElement>(null);
  const editorFields = useRef<HTMLFieldSetElement>(null);
  const returningToEditor = useRef(false);
  useEffect(() => {
    if (review) {
      reviewHeading.current?.focus({ preventScroll: true });
      reviewHeading.current?.scrollIntoView({ block: "start" });
    } else if (returningToEditor.current) {
      returningToEditor.current = false;
      editorFields.current?.querySelector<HTMLInputElement>("input")?.focus();
    }
  }, [review]);
  const key = `report:${report.slug}`;
  const dirty = !!record && !!draft && JSON.stringify(record.fields) !== JSON.stringify(draft);
  const { guard, dialog: discardDialog } = useDirtyGuard(dirty || uncertain, {
    title: "Discard local report corrections?",
    description: "No new publication will be sent. An already-sent publication is not undone.",
  });
  const { confirm, dialog: confirmDialog } = useConfirm();
  useEffect(() => {
    const abort = new AbortController();
    setLoading(true);
    setError(null);
    void fetch(`/api/dev/trip-reports/record?slug=${encodeURIComponent(report.slug)}&contextual=true`, { signal: abort.signal, cache: "no-store" }).then(async (response) => {
      const payload = await response.json();
      if (!response.ok || !payload.report?.canEdit || typeof payload.report?.revision !== "string") throw new Error(payload.error ?? "Only this report’s owner or an admin can publish corrections. Reload the report to check access.");
      if (abort.signal.aborted) return;
      setRecord(payload.report);
      setDraft(payload.report.fields);
    }).catch((reason) => { if (!abort.signal.aborted) { setRecord(null); setDraft(null); setError(reason instanceof Error ? reason.message : "Unable to load this report."); } }).finally(() => { if (!abort.signal.aborted) setLoading(false); });
    return () => abort.abort();
  }, [reload, report.slug]);
  useEffect(() => { setDirty(key, dirty || uncertain); return () => setDirty(key, false); }, [dirty, uncertain, key, setDirty]);
  useEffect(() => registerDraftGuard(key, { canDiscard: !busy && !uncertain, discard: () => { if (busy || uncertain) return; setDraft(record?.fields ?? null); } }), [busy, uncertain, key, record, registerDraftGuard]);
  function close() {
    if (busy || uncertain) return;
    guard(onClose);
  }
  async function publish() {
    if (!record || !draft || busy) return;
    pending.current ??= JSON.stringify({ mode: "save", id: record.id, expected: record.fields, expectedRevision: record.revision, updates: draft, operationId: crypto.randomUUID() });
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/dev/trip-reports/record", { method: "POST", headers: { "Content-Type": "application/json" }, body: pending.current });
      const payload = await response.json();
      if (!response.ok) {
        if (response.status < 500) { pending.current = null; setUncertain(false); }
        throw new Error(payload.error ?? "The report correction was not confirmed.");
      }
      pending.current = null;
      setUncertain(false);
      setSuccess(true);
      setReview(false);
      const committedFields = payload.fields as TripReportEditableFields;
      setRecord({ ...record, fields: committedFields, revision: payload.revision as string });
      setDraft(committedFields);
      router.refresh();
    } catch (reason) {
      if (pending.current) setUncertain(true);
      setError(reason instanceof Error ? reason.message : "Publication response unavailable. Reconcile this operation before making another edit.");
    } finally { setBusy(false); }
  }
  const row = record ? { ...toPortalRowFromReport({ id: record.id, slug: report.slug, title: record.fields.title, subject: record.fields.subject, substances: record.fields.substances, tags: record.fields.tags, featured: report.featured === true, license: report.license, profileKey: report.subject.profile_key, createdAt: 0 }), fields: record.fields } : null;
  return <ContextualEditorPanel title="Correct published report" description="Changes stay local until confirmed publication. Private intake and moderation information is not loaded here." open returnFocusRef={returnFocusRef} onOpenChange={(next) => { if (!next) close(); }}>
    <div className="space-y-5">
      {discardDialog}
      {confirmDialog}
      {loading ? <p role="status">Loading this report and checking ownership…</p> : null}
      {error ? <div role="alert" className="space-y-3"><p>{error}</p>{!record ? <Button variant="outline" onClick={() => setReload((value) => value + 1)}>Retry access check</Button> : !uncertain ? <Button variant="outline" onClick={() => confirm({ title: "Discard corrections and reload?", description: "Your local corrections will be discarded and replaced with the current published report.", confirmLabel: "Discard and reload", destructive: true, onConfirm: () => { setReview(false); setReload((value) => value + 1); } })}>Discard corrections and reload published report</Button> : null}</div> : null}
      {success ? <p role="status">Publication confirmed. The report and its attributed history were saved together.</p> : null}
      {uncertain ? <div role="alert"><p>The response was lost. Editing is paused until the original operation is reconciled.</p><Button disabled={busy} onClick={() => void publish()}>Reconcile publication</Button></div> : null}
      {record && draft && row ? <>
        <fieldset ref={editorFields} hidden={review} disabled={busy || uncertain}>
          <PortalReportEditor busy={busy || uncertain} contributors={[]} draft={draft} feedback={null} onChange={(next) => { setDraft(next); setSuccess(false); setReview(false); }} onClose={close} onDelete={close} onDismissFeedback={() => setError(null)} onRevert={() => { setDraft(record.fields); setReview(false); }} onSave={() => setReview(true)} row={row} contentOnly saveLabel="Preview correction" />
        </fieldset>
        {review ? <section className="space-y-4" aria-label="Report publication review">
          <h3 ref={reviewHeading} tabIndex={-1} className="font-display text-xl theme-focus-ring">Review correction</h3>
          <p className="theme-text-muted text-sm">Only changed fields are shown. Compare the current publication with your proposed correction, then read the local preview.</p>
          {(Object.keys(draft) as (keyof TripReportEditableFields)[]).filter((field) => JSON.stringify(record.fields[field]) !== JSON.stringify(draft[field])).map((field) => <section key={field} className="space-y-3 [overflow-wrap:anywhere]"><h4 className="font-display text-lg font-semibold">{CORRECTION_LABELS[field]}</h4><div className="grid gap-5 sm:grid-cols-2"><div className="min-w-0 space-y-2"><h5 className="theme-text-muted text-sm font-semibold">Current published version</h5><CorrectionValue field={field} fields={record.fields} /></div><div className="min-w-0 space-y-2"><h5 className="theme-text-muted text-sm font-semibold">Proposed correction</h5><CorrectionValue field={field} fields={draft} /></div></div></section>)}
          <h3 className="font-display text-xl">Local reading preview</h3>
          <TripReportDetailPresentation t={t} preview report={{ ...report, ...draft, subject: { ...report.subject, ...draft.subject } }} substanceBySlug={substanceBySlug} substanceLinks={substanceLinks} />
          <p>Publish these corrections to the shared report on dose.wiki and Effect Index? Author attribution, media, licensing, ownership and moderation remain unchanged.</p>
          <div className="flex flex-wrap gap-2">
            <Button disabled={busy || uncertain || !dirty} onClick={() => void publish()}>{busy ? "Publishing…" : "Confirm publish correction"}</Button>
            <Button variant="secondary" disabled={busy || uncertain} onClick={() => { returningToEditor.current = true; setReview(false); }}>Keep editing</Button>
          </div>
        </section> : null}
      </> : null}
      <Link href={role === "admin" ? "/dev/trip-report-submissions" : "/dev/my-reports"} className="underline">Open the report workbench for supported report management</Link>
    </div>
  </ContextualEditorPanel>;
}
