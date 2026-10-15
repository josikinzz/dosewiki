"use client";
import { useCallback, useEffect, useId, useState } from "react";
import { Icon } from "@/components/common/Icon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { EditorField, EditorPanel, EditorStatusPill, LoadErrorState, Notice, useUnsavedWork } from "@/features/dev/components";
import { formatReviewReason } from "../../../../../lib/translation/reviewReason";
import { ApprovalActions, EMPTY_REASON, ReasonPicker, reasonFor, type ReasonDraft } from "./CorrectionReason";
import { languageLabel } from "./glossaryModel";
import { PaneDock, RowSkeletons, When } from "./workbenchParts";
import { EMPTY_STYLE_GUIDE, STYLE_GUIDE_LIMITS, type StyleGuideDocument, type StyleGuideExample, type StyleGuidePacket } from "../../../../../lib/translation/styleGuideTypes";

const ENDPOINT = "/api/dev/translation-style-guide";

type NewExample = Omit<StyleGuideExample, "id" | "addedAt"> & Partial<Pick<StyleGuideExample, "id" | "addedAt">>;
type Working = { rulesText: string; examples: NewExample[] };

function working(document: StyleGuideDocument | null): Working {
  const source = document ?? EMPTY_STYLE_GUIDE;
  return { rulesText: source.rules.join("\n"), examples: source.examples };
}

function documentOf(value: Working) {
  return { rules: value.rulesText.split("\n").map((rule) => rule.trim()).filter(Boolean), examples: value.examples };
}

const sameDocument = (a: ReturnType<typeof documentOf>, b: StyleGuideDocument | null) => Boolean(b) && JSON.stringify(a) === JSON.stringify({ rules: b!.rules, examples: b!.examples });

function ExampleView({ example, locale }: { example: NewExample; locale: string }) {
  return (
    <dl className="grid min-w-0 flex-1 grid-cols-[4.5rem_minmax(0,1fr)] gap-x-3 gap-y-1 break-words text-sm">
      {example.source ? <><dt className="theme-text-muted">English</dt><dd lang="en" className="theme-text-secondary">{example.source}</dd></> : null}
      <dt className="theme-text-muted">Before</dt><dd lang={locale} dir="auto" className="theme-text-secondary line-through decoration-[var(--theme-text-faint)]">{example.before}</dd>
      <dt className="theme-text-muted">After</dt><dd lang={locale} dir="auto" className="theme-text-primary">{example.after}</dd>
      <dt className="theme-text-muted">Why</dt><dd className="theme-text-secondary">{example.why}</dd>
      {example.origin ? <dd className="theme-text-faint col-span-2 text-xs">Promoted from a correction in {example.origin.slug}</dd> : null}
    </dl>
  );
}

export function StyleGuidePanel({ locale }: { locale: string }) {
  const formId = useId();
  const [packet, setPacket] = useState<StyleGuidePacket | null>(null);
  const [value, setValue] = useState<Working>(working(null));
  const [reason, setReason] = useState<ReasonDraft>(EMPTY_REASON);
  const [adding, setAdding] = useState<NewExample>({ source: "", before: "", after: "", why: "" });
  const [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null), [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    try {
      const response = await fetch(`${ENDPOINT}?${new URLSearchParams({ locale, history: "1" })}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Unable to load the style guide.");
      setPacket(data);
      setValue(working(data.draft ?? data.approved));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to load the style guide.");
    }
  }, [locale]);
  useEffect(() => { void load(); }, [load]);

  async function send(action: "save" | "approve" | "restore", expectedRevision: number, restoreRevision?: number): Promise<StyleGuidePacket> {
    const fallback = action === "save" ? "Saved the style guide as it stands." : action === "approve" ? "Approved the saved style guide." : `Restored revision ${restoreRevision} as a draft.`;
    const response = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ locale, action, expectedRevision, guide: action === "save" ? documentOf(value) : undefined, reason: reasonFor(reason, fallback), restoreRevision }),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error ?? "Unable to save the style guide.");
    return result.packet;
  }

  async function mutate(action: "save" | "approve" | "restore" | "save-approve", restoreRevision?: number) {
    if (!packet) return;
    setBusy(true);
    setError(null);
    setNotice("");
    try {
      const saved = await send(action === "save-approve" ? "save" : action, packet.revision, restoreRevision);
      if (action === "save-approve") await send("approve", saved.revision);
      setReason(EMPTY_REASON);
      setNotice(action === "approve" || action === "save-approve"
        ? "Approved. The next translation run follows this guide. Existing translations are marked for an update; nothing was queued."
        : action === "restore" ? "Restored as a draft. Translations still follow the approved guide." : "Draft saved. Translations still follow the approved guide.");
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to save the style guide.");
    } finally {
      setBusy(false);
    }
  }

  const proposed = documentOf(value);
  const unsaved = packet ? !sameDocument(proposed, packet.draft ?? packet.approved) : false;
  const approvable = Boolean(packet?.draft) && !unsaved;

  useUnsavedWork({
    id: "glossary:style-guide",
    tab: "glossary",
    label: `Glossary: style guide for ${languageLabel(locale)}`,
    dirty: unsaved,
    saveLabel: "Save draft",
    ...(reason.kind && packet
      ? { kind: "save-unpublished" as const, saveDraft: async () => {
          await send("save", packet.revision);
          setReason(EMPTY_REASON);
          await load();
        } }
      : { kind: "discard-only" as const, because: "Choose a reason before saving the guide draft." }),
    discard: () => {
      if (packet) setValue(working(packet.draft ?? packet.approved));
      setReason(EMPTY_REASON);
    },
  });
  const canAdd = adding.before.trim() && adding.after.trim() && adding.why.trim() && adding.before.trim() !== adding.after.trim();

  if (!packet) return error ? <LoadErrorState what="the style guide" message={error} onRetry={() => { setError(null); void load(); }} /> : <RowSkeletons rows={3} label="the style guide" />;
  const stateLine = unsaved
    ? "Unsaved changes"
    : packet.draft
      ? "A saved draft waits for approval"
      : packet.approved ? "No changes yet" : "Nothing approved yet";
  return (
    <section aria-label="Style guide" className="min-w-0 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-2">
        <p className="theme-text-secondary max-w-prose text-sm">
          Rules and example corrections for {languageLabel(locale)}. Translations follow the approved guide: every rule, and up to five examples that share words with the text being translated.
        </p>
        <p className="theme-text-muted flex flex-wrap items-center gap-2 text-xs">
          {packet.approved ? <><EditorStatusPill tone="success" inline>Approved</EditorStatusPill><span className="break-all">Approved · version {packet.approvedRevision || "empty"}</span></> : <EditorStatusPill tone="neutral" inline>Nothing approved yet</EditorStatusPill>}
          {packet.draft ? <EditorStatusPill tone="warning" inline>Draft waiting</EditorStatusPill> : null}
        </p>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(18rem,22rem)] xl:items-start">
        <EditorPanel className="overflow-visible">
          <div className="space-y-6 px-4 py-5 sm:px-5 [&_:is(input,textarea,button)]:scroll-mb-48 [&_:is(input,textarea,button)]:scroll-mt-28">
            <EditorField htmlFor={`${formId}-rules`} label="Rules, one per line" description={`At most ${STYLE_GUIDE_LIMITS.rules} rules of ${STYLE_GUIDE_LIMITS.ruleChars} characters each.`}>
              <Textarea id={`${formId}-rules`} lang={locale} dir="auto" value={value.rulesText} disabled={busy} rows={5} className="[field-sizing:content] max-h-[70vh] min-h-32 text-[16px] md:text-sm"
                onChange={(e) => setValue((current) => ({ ...current, rulesText: e.target.value }))} />
            </EditorField>

            <div className="space-y-3">
              <h4 className="theme-text-primary flex items-baseline gap-2 font-medium">Examples <span className="theme-text-muted text-sm font-normal tabular-nums">{value.examples.length}</span></h4>
              {value.examples.length === 0 ? <p className="theme-text-secondary text-sm">No examples yet. Promote a Fluency correction from the article reader, or add one below.</p> : null}
              <ol className="theme-dev-link-list">
                {value.examples.map((example, index) => (
                  <li key={example.id ?? `new-${index}`} className="flex min-w-0 items-start justify-between gap-3 py-3">
                    <ExampleView example={example} locale={locale} />
                    <Button size="sm" variant="ghost" disabled={busy} aria-label={`Remove example ${index + 1}`}
                      onClick={() => setValue((current) => ({ ...current, examples: current.examples.filter((_, at) => at !== index) }))}>
                      <Icon icon="lucide:trash-2" size={14} /><span className="hidden sm:inline">Remove</span>
                    </Button>
                  </li>
                ))}
              </ol>
            </div>

            <fieldset className="space-y-3 rounded-card border border-[color:var(--editor-panel-border)] p-4" disabled={busy}>
              <legend className="theme-text-primary px-1 font-medium">Add an example</legend>
              <div className="grid gap-3 sm:grid-cols-2">
                <EditorField htmlFor={`${formId}-source`} label="English (optional)" className="sm:col-span-2"><Input id={`${formId}-source`} lang="en" value={adding.source ?? ""} onChange={(e) => setAdding({ ...adding, source: e.target.value })} /></EditorField>
                <EditorField htmlFor={`${formId}-before`} label="Before"><Input id={`${formId}-before`} lang={locale} dir="auto" value={adding.before} onChange={(e) => setAdding({ ...adding, before: e.target.value })} /></EditorField>
                <EditorField htmlFor={`${formId}-after`} label="After"><Input id={`${formId}-after`} lang={locale} dir="auto" value={adding.after} onChange={(e) => setAdding({ ...adding, after: e.target.value })} /></EditorField>
                <EditorField htmlFor={`${formId}-why`} label="Why" className="sm:col-span-2"><Input id={`${formId}-why`} value={adding.why} maxLength={STYLE_GUIDE_LIMITS.whyChars} onChange={(e) => setAdding({ ...adding, why: e.target.value })} /></EditorField>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <Button size="sm" variant="outline" disabled={!canAdd} onClick={() => {
                  const next: NewExample = { before: adding.before.trim(), after: adding.after.trim(), why: adding.why.trim() };
                  if (adding.source?.trim()) next.source = adding.source.trim();
                  setValue((current) => ({ ...current, examples: [...current.examples, next] }));
                  setAdding({ source: "", before: "", after: "", why: "" });
                }}>Add example to draft</Button>
                {!canAdd && (adding.before || adding.after || adding.why) ? <span className="theme-text-muted text-xs">{adding.before.trim() && adding.before.trim() === adding.after.trim() ? "Before and After are the same." : "Before, After and Why are needed."}</span> : null}
              </div>
            </fieldset>

            <div className="space-y-2">
              <h4 className="theme-text-primary font-medium">Why you are changing it</h4>
              <ReasonPicker value={reason} onChange={setReason} disabled={busy} needed={unsaved} />
            </div>
          </div>

          <PaneDock label="Save">
            {error ? <Notice tone="danger" placement="inline" message={error} dismiss={() => setError(null)} /> : null}
            {notice ? <Notice tone="success" placement="inline" message={notice} dismiss={() => setNotice("")} /> : null}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              <ApprovalActions changed={unsaved} approvable={approvable} busy={busy} blocked={!reason.kind}
                onSave={() => void mutate("save")} onSaveAndApprove={() => void mutate("save-approve")} onApprove={() => void mutate("approve")} />
              <span className="theme-text-muted inline-flex items-center gap-1.5 text-xs" aria-live="polite">
                {unsaved ? <span aria-hidden className="size-1.5 rounded-full bg-[var(--theme-accent)]" /> : null}
                {busy ? "Saving" : stateLine}
              </span>
              {unsaved && !reason.kind && !busy ? <span className="theme-text-muted text-xs">Choose why above to save them.</span> : null}
            </div>
          </PaneDock>
        </EditorPanel>

        <aside aria-labelledby={`${formId}-history`} className="space-y-3 xl:sticky xl:top-24">
          <h4 id={`${formId}-history`} className="type-meta-label theme-text-muted">Style guide history</h4>
          {unsaved && packet.history?.length ? <p className="theme-text-muted text-xs">Save your changes first to restore an earlier revision.</p> : null}
          {packet.history?.length ? (
            <ol className="theme-dev-link-list">
              {packet.history.map((h) => (
                <li key={h.revision} className="space-y-1.5 py-2.5 text-sm">
                  <p className="theme-text-secondary">
                    <span className="theme-text-primary font-medium">Revision {h.revision}</span>{" "}
                    {h.action === "approve" ? "approved" : h.action === "restore" ? "restored as a draft" : "saved as a draft"} by {h.actor}, <When at={h.createdAt} />.
                  </p>
                  <p className="theme-text-muted text-xs">{formatReviewReason(h.reason)}</p>
                  <Button size="sm" variant="outline" disabled={busy || unsaved} aria-label={`Restore revision ${h.revision} as draft`} onClick={() => void mutate("restore", h.revision)}>Restore as draft</Button>
                </li>
              ))}
            </ol>
          ) : <p className="theme-text-muted text-sm">No saved revisions yet.</p>}
        </aside>
      </div>
    </section>
  );
}

export function PromoteToStyleGuide({ locale, slug, segment, revision, disabled }: { locale: string; slug: string; segment: string; revision: number; disabled?: boolean }) {
  const [state, setState] = useState<{ busy: boolean; message: string | null }>({ busy: false, message: null });
  async function promote() {
    setState({ busy: true, message: null });
    try {
      const response = await fetch(ENDPOINT, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ locale, action: "promote", correction: { kind: "article", slug, segment, revision } }),
      });
      const result = await response.json();
      setState({ busy: false, message: response.ok ? "Added to the style guide draft." : result.error ?? "Unable to promote this correction." });
    } catch {
      setState({ busy: false, message: "Unable to promote this correction." });
    }
  }
  return (
    <>
      <Button size="sm" variant="ghost" disabled={disabled || state.busy} onClick={() => void promote()}>Promote to style guide</Button>
      {state.message ? <span role="status" className="theme-text-faint text-xs"> {state.message}</span> : null}
    </>
  );
}
