"use client";
import { useEffect, useId, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Surface } from "@/components/ui/surface";
import { SmartLink } from "@/components/common/SmartLink";
import { StateCard } from "@/components/common/StateCard";
import { EditorSelect } from "@/features/dev/components";
import type { PublicationReceipt } from "@lib/next/publicationDispatch";
import type { ReviewHistoryEntry } from "@lib/translation/reviewTypes";
import type { readNarrativeReview } from "@lib/translation/narrativeReview";
type Packet = Awaited<ReturnType<typeof readNarrativeReview>>;
export function NarrativeReview({ locale }: {
    locale: string;
}) {
    const formId = useId();
    const [kind, setKind] = useState("article"), [slug, setSlug] = useState("");
    const [packet, setPacket] = useState<Packet | null>(null), [selected, setSelected] = useState("");
    const [target, setTarget] = useState(""), [reason, setReason] = useState("");
    const [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null), [notice, setNotice] = useState("");
    const [publication, setPublication] = useState<PublicationReceipt[]>([]);
    const [history, setHistory] = useState<ReviewHistoryEntry[]>([]);
    const correctionRef = useRef<HTMLTextAreaElement>(null);
    const row = packet?.rows.find(r => r.id === selected);
    async function load(id?: string, requestedSlug = slug, expectedVersion = packet?.sourceVersion) {
        setBusy(true);
        setError(null);
        try {
            const params = new URLSearchParams({ locale, kind, slug: requestedSlug });
            if (id)
                params.set("history", id);
            const response = await fetch(`/api/dev/translation-narrative?${params}`);
            const data = await response.json();
            if (!response.ok)
                throw new Error(data.error ?? "Unable to load record.");
            if (id && expectedVersion && expectedVersion !== data.sourceVersion) {
                setPacket(data);
                setSelected("");
                setHistory([]);
                throw new Error("Source context changed since the preview. Inspect the refreshed text and select the field again.");
            }
            setPacket(data);
            const location = new URL(window.location.href);
            location.searchParams.set("translationReview", "article");
            location.searchParams.set("translationLocale", locale);
            location.searchParams.set("translationSlug", data.slug);
            if (id) { location.searchParams.set("translationSegment", id); location.searchParams.set("translationVersion", data.sourceVersion); }
            else { location.searchParams.delete("translationSegment"); location.searchParams.delete("translationVersion"); }
            window.history.replaceState(window.history.state, "", location);
            setSelected(id ?? "");
            setHistory(data.history ?? []);
            if (id) {
                const next = data.rows.find((r: Packet["rows"][number]) => r.id === id);
                setTarget(next?.draft?.target ?? next?.approved?.target ?? next?.machine?.target ?? "");
                requestAnimationFrame(() => correctionRef.current?.focus());
            }
        }
        catch (cause) {
            setError(cause instanceof Error ? cause.message : "Unable to load record.");
        }
        finally {
            setBusy(false);
        }
    }
    const openedLink = useRef(false);
    useEffect(() => {
        if (openedLink.current) return;
        openedLink.current = true;
        const params = new URLSearchParams(window.location.search);
        const requestedSlug = params.get("translationSlug");
        if (params.get("translationReview") !== "article" || params.get("translationLocale") !== locale || !requestedSlug) return;
        setSlug(requestedSlug);
        void load(params.get("translationSegment") ?? undefined, requestedSlug, params.get("translationVersion") ?? undefined);
    }, [locale]);
    async function mutate(action: "save" | "approve" | "restore", restoreRevision?: number) {
        if (!packet || !row)
            return;
        setBusy(true);
        setError(null);
        setNotice("");
        try {
            const response = await fetch("/api/dev/translation-narrative", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ locale, kind: packet.kind, slug: packet.slug, id: row.id, sourceVersion: packet.sourceVersion, expectedRevision: row.revision, action, target, reason, restoreRevision }) });
            const result = await response.json();
            if (!response.ok)
                throw new Error(result.error ?? "Unable to save review.");
            setPublication(result.publication ?? []);
            setNotice(action === "approve" ? "Approved for this field only. Public rendering still needs verification." : "Draft saved. Published wording is unchanged.");
            if (action === "approve" && result.publication?.some((receipt: {
                status: string;
            }) => receipt.status !== "accepted"))
                setNotice("Approved, but cache delivery is incomplete. Reloading the public page is not proof of delivery; retain the receipt and retry publication through the operator workflow.");
            await load(row.id);
        }
        catch (cause) {
            setError(cause instanceof Error ? cause.message : "Unable to save review.");
        }
        finally {
            setBusy(false);
        }
    }
    return <section aria-label="Narrative review" className="space-y-4">
  <p className="theme-text-secondary text-sm">Review one public substance article. Corrections apply only to the selected field and source context. Other uses of identical English retain their own wording.</p>
  <div className="flex flex-wrap items-end gap-3">
   <label>Content<EditorSelect value={kind} disabled={busy} onChange={e => { setKind(e.target.value); setPacket(null); setHistory([]); }}>{["article"].map(k => <option key={k} value={k}>{k}</option>)}</EditorSelect></label>
   <label htmlFor={`${formId}-slug`}>Source slug<Input id={`${formId}-slug`} value={slug} disabled={busy} onChange={e => { setSlug(e.target.value); setPacket(null); setHistory([]); }}/></label>
   <Button disabled={busy || !slug.trim()} onClick={() => void load()}>Load source</Button>
  </div>
  {error ? <StateCard compact tone="danger" title="Review failed" description={error}/> : null}
  {publication.length > 0 ? <ul className="theme-text-secondary text-sm">{publication.map((receipt, index) => <li key={index}>{receipt.target}: {receipt.status} ({receipt.attempts} attempts). {receipt.detail}</li>)}</ul> : null}
  {notice ? <p role="status" className="theme-text-secondary text-sm">{notice}</p> : null}
  {packet ? <Surface variant="subtle" padding="sm" radius="lg" className="space-y-3">
   <h3 className="theme-text-primary font-medium">Narrative field preview</h3>
   <p className="theme-text-faint text-xs">Current stored wording in source order. This field preview does not certify the deployed page or its layout.</p>
   {packet.rows.map(item => <div key={item.id} className="space-y-1">
    <p className="theme-text-faint text-xs">{item.field}</p>
    <p className="theme-text-primary whitespace-pre-wrap">{item.approved?.source === item.source && item.approved.context === item.context ? item.approved.target : item.machine?.target ?? item.source}</p>
    <Button size="sm" variant="outline" disabled={busy} onClick={() => void load(item.id)}>Review {item.field}</Button>
   </div>)}
  </Surface> : null}
  {packet ? <label>Source field<EditorSelect value={selected} disabled={busy} onChange={e => { const id = e.target.value; setSelected(id); setHistory([]); if (id)
        void load(id); }}><option value="">Choose a field</option>{packet.rows.map(r => <option key={r.id} value={r.id}>{r.field}: {r.status}</option>)}</EditorSelect></label> : null}
  {row ? <Surface variant="subtle" padding="sm" radius="lg" className="space-y-3">
   <h3 className="theme-text-primary font-medium">{row.field} · {row.status} · revision {row.revision}</h3>
   <p className="theme-text-primary whitespace-pre-wrap">{row.source}</p>
   <p className="theme-text-secondary text-sm">Machine target: {row.machine?.target ?? "Missing"}</p>
   <p className="theme-text-faint text-xs">Model {row.machine?.model ?? "unknown"} · prompt {row.machine?.prompt_version ?? "unknown"}</p>
   <p className="theme-text-secondary text-sm">Approved target: {row.approved?.target ?? "Not reviewed"}. A stale approval does not apply to changed source context.</p>
   <p className="theme-text-secondary text-sm">{row.usages ? `${row.usages.total} current records share this English hash; showing ${row.usages.pages.length}.` : "Shared-hash usage was not included in this bounded inventory."} This correction affects only {packet?.slug}, {row.field}.</p>
   <ul className="theme-text-secondary text-sm">{row.usages?.pages.map(p => <li key={`${p.kind}:${p.slug}`}><SmartLink className="underline" href={p.href}>{p.kind}: {p.label}</SmartLink></li>)}</ul>
   <label htmlFor={`${formId}-correction`}>Correction<Textarea id={`${formId}-correction`} ref={correctionRef} value={target} onChange={e => setTarget(e.target.value)} disabled={busy} maxLength={30000}/></label>
   <label htmlFor={`${formId}-reason`}>Reason<Input id={`${formId}-reason`} value={reason} onChange={e => setReason(e.target.value)} disabled={busy} maxLength={1000}/></label>
   <div className="flex flex-wrap gap-2"><Button disabled={busy || !target.trim() || !reason.trim()} onClick={() => void mutate("save")}>Save draft</Button><Button variant="outline" disabled={busy || !row.draft || row.status === "stale" || target !== row.draft.target || !reason.trim()} onClick={() => void mutate("approve")}>Approve saved revision</Button></div>
   <h4 className="theme-text-primary font-medium">Review history</h4>
   <ul className="space-y-2">{history.map(h => <li key={h.revision} className="theme-text-secondary text-sm">Revision {h.revision}: {h.action} by {h.actor}. {h.reason} <Button size="sm" variant="outline" disabled={busy || !reason.trim()} onClick={() => void mutate("restore", h.revision)}>Restore as draft</Button></li>)}</ul>
  </Surface> : null}
 </section>;
}
