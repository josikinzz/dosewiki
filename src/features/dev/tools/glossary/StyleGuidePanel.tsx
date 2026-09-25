"use client";
/**
 * The style guide view: a locale's rules and example corrections the
 * translation prompt reads. Translators edit one draft of the whole guide and
 * save and approve it like any other wording (the shared ApprovalActions and
 * ReasonPicker); only the approved guide reaches
 * prompts, and approving it changes the prompt version (stored translations
 * read as stale, nothing is enqueued). Examples arrive from the article
 * reader through "Promote to style guide" on a Fluency correction, or are
 * written here.
 */
import { useCallback, useEffect, useId, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Surface } from "@/components/ui/surface";
import { StateCard } from "@/components/common/StateCard";
import { formatReviewReason } from "../../../../../lib/translation/reviewReason";
import { ApprovalActions, EMPTY_REASON, ReasonPicker, reasonFor, type ReasonDraft } from "./CorrectionReason";
import { languageLabel } from "./glossaryModel";
import { EMPTY_STYLE_GUIDE, STYLE_GUIDE_LIMITS, type StyleGuideDocument, type StyleGuideExample, type StyleGuidePacket } from "../../../../../lib/translation/styleGuideTypes";

const ENDPOINT = "/api/dev/translation-style-guide";

/** A new example before the server gives it an id and a time. */
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
    <div className="min-w-0 space-y-1 break-words text-sm">
      {example.source ? <p lang="en" className="theme-text-secondary">English: {example.source}</p> : null}
      <p className="theme-text-secondary">Before: <span lang={locale} dir="auto">{example.before}</span></p>
      <p className="theme-text-primary">After: <span lang={locale} dir="auto">{example.after}</span></p>
      <p className="theme-text-secondary">Why: {example.why}</p>
      {example.origin ? <p className="theme-text-faint text-xs">Promoted from {example.origin.slug}, correction revision {example.origin.revision}</p> : null}
    </div>
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

  /** Save and approve saves the guide, then approves exactly the revision that save produced. */
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
  const canAdd = adding.before.trim() && adding.after.trim() && adding.why.trim() && adding.before.trim() !== adding.after.trim();

  if (!packet) return error ? <StateCard compact tone="danger" title="Style guide unavailable" description={error} /> : <p className="theme-text-secondary text-sm">Loading the style guide.</p>;
  return (
    <section aria-label="Style guide" className="min-w-0 space-y-4">
      <p className="theme-text-secondary text-sm">
        Rules and example corrections for {languageLabel(locale)}. Translations follow the approved guide: every rule, and up to five examples that share words with the text being translated.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        {packet.approved ? <Badge variant="success">Approved · version {packet.approvedRevision || "empty"}</Badge> : <Badge variant="outline">Nothing approved yet</Badge>}
        {packet.draft ? <Badge variant="secondary">Draft waiting for approval</Badge> : null}
        {unsaved ? <Badge variant="default">Unsaved changes</Badge> : null}
      </div>
      {error ? <StateCard compact tone="danger" title="Style guide failed" description={error} /> : null}
      {notice ? <p role="status" className="theme-text-secondary text-sm">{notice}</p> : null}

      <Surface variant="subtle" padding="sm" radius="lg" className="min-w-0 space-y-3">
        <label htmlFor={`${formId}-rules`} className="block">Rules, one per line
          <Textarea id={`${formId}-rules`} lang={locale} dir="auto" value={value.rulesText} disabled={busy} rows={5}
            onChange={(e) => setValue((current) => ({ ...current, rulesText: e.target.value }))} />
        </label>
        <p className="theme-text-faint text-xs">At most {STYLE_GUIDE_LIMITS.rules} rules of {STYLE_GUIDE_LIMITS.ruleChars} characters each.</p>

        <h4 className="theme-text-primary font-medium">Examples ({value.examples.length})</h4>
        {value.examples.length === 0 ? <p className="theme-text-secondary text-sm">No examples yet. Promote a Fluency correction from the article reader, or add one below.</p> : null}
        <ul className="space-y-3">
          {value.examples.map((example, index) => (
            <li key={example.id ?? `new-${index}`} className="flex min-w-0 items-start justify-between gap-3">
              <ExampleView example={example} locale={locale} />
              <Button size="sm" variant="outline" disabled={busy} aria-label={`Remove example ${index + 1}`}
                onClick={() => setValue((current) => ({ ...current, examples: current.examples.filter((_, at) => at !== index) }))}>Remove</Button>
            </li>
          ))}
        </ul>

        <fieldset className="space-y-2" disabled={busy}>
          <legend className="theme-text-primary font-medium">Add an example</legend>
          <label htmlFor={`${formId}-source`} className="block">English (optional)<Input id={`${formId}-source`} lang="en" value={adding.source ?? ""} onChange={(e) => setAdding({ ...adding, source: e.target.value })} /></label>
          <label htmlFor={`${formId}-before`} className="block">Before<Input id={`${formId}-before`} lang={locale} dir="auto" value={adding.before} onChange={(e) => setAdding({ ...adding, before: e.target.value })} /></label>
          <label htmlFor={`${formId}-after`} className="block">After<Input id={`${formId}-after`} lang={locale} dir="auto" value={adding.after} onChange={(e) => setAdding({ ...adding, after: e.target.value })} /></label>
          <label htmlFor={`${formId}-why`} className="block">Why<Input id={`${formId}-why`} value={adding.why} maxLength={STYLE_GUIDE_LIMITS.whyChars} onChange={(e) => setAdding({ ...adding, why: e.target.value })} /></label>
          <Button size="sm" variant="outline" disabled={!canAdd} onClick={() => {
            const next: NewExample = { before: adding.before.trim(), after: adding.after.trim(), why: adding.why.trim() };
            if (adding.source?.trim()) next.source = adding.source.trim();
            setValue((current) => ({ ...current, examples: [...current.examples, next] }));
            setAdding({ source: "", before: "", after: "", why: "" });
          }}>Add example to draft</Button>
        </fieldset>

        <ReasonPicker value={reason} onChange={setReason} disabled={busy} needed={unsaved} />
        <ApprovalActions changed={unsaved} approvable={approvable} busy={busy} blocked={!reason.kind}
          onSave={() => void mutate("save")} onSaveAndApprove={() => void mutate("save-approve")} onApprove={() => void mutate("approve")} />
      </Surface>

      {packet.history?.length ? <>
        <h4 className="theme-text-primary font-medium">Style guide history</h4>
        {unsaved ? <p className="theme-text-faint text-xs">Save your changes first to restore an earlier revision.</p> : null}
        <ul className="space-y-2">{packet.history.map((h) => <li key={h.revision} className="theme-text-secondary text-sm">Revision {h.revision}: {h.action} by {h.actor}. {formatReviewReason(h.reason)} <Button size="sm" variant="outline" disabled={busy || unsaved} aria-label={`Restore revision ${h.revision} as draft`} onClick={() => void mutate("restore", h.revision)}>Restore as draft</Button></li>)}</ul>
      </> : null}
    </section>
  );
}

/**
 * "Promote to style guide" on a saved Fluency correction in the article
 * reader: appends it to the locale's style guide draft as an example. The
 * draft still needs approval in the Style guide view.
 */
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
