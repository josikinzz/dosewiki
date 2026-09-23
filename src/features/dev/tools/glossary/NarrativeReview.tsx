"use client";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Surface } from "@/components/ui/surface";
import { SmartLink } from "@/components/common/SmartLink";
import { StateCard } from "@/components/common/StateCard";
import { loadSearchManifestIndex } from "@/hooks/useSearchManifest";
import { parseUiLocale } from "@/i18n/messages";
import type { SearchManifestIndex } from "@/data/builders/searchManifest";
import type { PublicationReceipt } from "@lib/next/publicationDispatch";
import type { NarrativeRowStatus, ReviewHistoryEntry } from "@lib/translation/reviewTypes";
import { narrativeOverlayApplies } from "../../../../../lib/translation/reviewTypes";
import type { readNarrativeReview } from "@lib/translation/narrativeReview";
type Packet = Awaited<ReturnType<typeof readNarrativeReview>>;
type Row = Packet["rows"][number];
/** One mark per paragraph; the workbench legend owns the wider definitions. */
const MARKS: Record<NarrativeRowStatus, { label: string; variant: BadgeProps["variant"] }> = {
    unreviewed: { label: "Machine", variant: "outline" },
    draft: { label: "Draft", variant: "secondary" },
    approved: { label: "Human approved", variant: "success" },
    // A re-check approval still shows, but a neighbouring English sentence changed.
    recheck: { label: "Re-check: nearby English changed", variant: "default" },
    stale: { label: "Source changed", variant: "destructive" },
};
/** Wording a reader sees now: an applied approval (including re-check), else the machine target, else English. */
function liveText(row: Row) {
    return row.approved && narrativeOverlayApplies(row.overlay) ? row.approved.target : row.machine?.target ?? row.source;
}
/** Field labels, numbered when one field holds several paragraphs. */
function paragraphLabels(rows: readonly Row[]) {
    const counts = new Map<string, number>(), seen = new Map<string, number>();
    for (const r of rows)
        counts.set(r.field, (counts.get(r.field) ?? 0) + 1);
    return rows.map(r => {
        const n = (seen.get(r.field) ?? 0) + 1;
        seen.set(r.field, n);
        return (counts.get(r.field) ?? 0) > 1 ? `${r.field} paragraph ${n}` : r.field;
    });
}
type ArticleMatch = { slug: string; english: string; localized?: string };
const MAX_MATCHES = 12;
/** Finds published substance articles through the public search manifests, English and locale. */
function ArticlePicker({ locale, disabled, onChoose }: {
    locale: string;
    disabled: boolean;
    onChoose: (slug: string) => void;
}) {
    const id = useId();
    const [query, setQuery] = useState(""), [open, setOpen] = useState(false);
    const [indexes, setIndexes] = useState<{ en: SearchManifestIndex | null; local: SearchManifestIndex | null } | null>(null);
    const loading = useRef(false);
    const uiLocale = parseUiLocale(locale, "en");
    function ensureIndexes() {
        if (indexes || loading.current)
            return;
        loading.current = true;
        void Promise.all([loadSearchManifestIndex("en"), uiLocale === locale && locale !== "en" ? loadSearchManifestIndex(uiLocale) : null])
            .then(([en, local]) => setIndexes({ en, local }))
            .finally(() => { loading.current = false; });
    }
    const matches = useMemo<ArticleMatch[]>(() => {
        if (!indexes || !query.trim())
            return [];
        const bySlug = new Map<string, ArticleMatch>();
        for (const s of indexes.en?.query(query, { limit: 40 }) ?? [])
            if (s.type === "substance" && !bySlug.has(s.slug))
                bySlug.set(s.slug, { slug: s.slug, english: s.label });
        for (const s of indexes.local?.query(query, { limit: 40 }) ?? []) {
            if (s.type !== "substance")
                continue;
            const known = bySlug.get(s.slug);
            if (known)
                known.localized = s.label;
            else
                bySlug.set(s.slug, { slug: s.slug, english: s.label, localized: s.label });
        }
        return [...bySlug.values()].slice(0, MAX_MATCHES);
    }, [indexes, query]);
    const failed = indexes !== null && !indexes.en && !indexes.local;
    const [activeIndex, setActiveIndex] = useState(0);
    const expanded = open && matches.length > 0, active = Math.min(activeIndex, matches.length - 1);
    function pick(m: ArticleMatch) {
        setOpen(false);
        setQuery(m.english);
        onChoose(m.slug);
    }
    return <div className="relative w-full max-w-md">
   <label htmlFor={`${id}-query`}>Find article</label>
   <Input id={`${id}-query`} role="combobox" aria-expanded={expanded} aria-controls={`${id}-list`} aria-autocomplete="list" aria-activedescendant={expanded ? `${id}-option-${active}` : undefined} autoComplete="off" value={query} disabled={disabled} placeholder="English or localized title"
    onFocus={() => { ensureIndexes(); setOpen(true); }} onBlur={() => setOpen(false)} onChange={e => { ensureIndexes(); setQuery(e.target.value); setActiveIndex(0); setOpen(true); }}
    onKeyDown={e => {
            if (e.key === "Escape")
                setOpen(false);
            else if (expanded && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
                e.preventDefault();
                setActiveIndex((active + (e.key === "ArrowDown" ? 1 : matches.length - 1)) % matches.length);
            }
            else if (expanded && e.key === "Enter") {
                e.preventDefault();
                pick(matches[active]);
            }
        }}/>
   {failed ? <p className="theme-text-secondary text-sm">Article search is unavailable. Enter the source slug instead.</p> : null}
   {expanded ? <ul id={`${id}-list`} role="listbox" aria-label="Matching articles" className="theme-frosted-control mt-1 max-h-72 overflow-y-auto rounded-lg border border-[var(--theme-border-subtle)] p-1">
    {matches.map((m, index) =>
            // The combobox owns keyboard selection through aria-activedescendant.
            // eslint-disable-next-line jsx-a11y/click-events-have-key-events
            <li key={m.slug} id={`${id}-option-${index}`} role="option" aria-selected={index === active} className={`cursor-pointer rounded-md px-2 py-1.5 hover:bg-[var(--theme-frosted-control-hover-bg)] ${index === active ? "bg-[var(--theme-frosted-control-bg)]" : ""}`}
      onMouseDown={e => e.preventDefault()} onClick={() => pick(m)}>
     <span className="theme-text-primary">{m.english}</span>
     {m.localized && m.localized !== m.english ? <span lang={locale} className="theme-text-secondary"> · {m.localized}</span> : null}
     <span className="theme-text-faint text-xs"> · {m.slug}</span>
    </li>)}
   </ul> : null}
  </div>;
}
export function NarrativeReview({ locale }: {
    locale: string;
}) {
    const formId = useId();
    const kind = "article";
    const [slug, setSlug] = useState("");
    const [packet, setPacket] = useState<Packet | null>(null), [selected, setSelected] = useState("");
    const [target, setTarget] = useState(""), [reason, setReason] = useState("");
    const [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null), [notice, setNotice] = useState("");
    const [publication, setPublication] = useState<PublicationReceipt[]>([]);
    const [history, setHistory] = useState<ReviewHistoryEntry[]>([]);
    const correctionRef = useRef<HTMLTextAreaElement>(null);
    const row = packet?.rows.find(r => r.id === selected);
    const labels = useMemo(() => paragraphLabels(packet?.rows ?? []), [packet]);
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
                const next = data.rows.find((r: Row) => r.id === id);
                setTarget(next?.draft?.target ?? next?.approved?.target ?? next?.machine?.target ?? "");
                requestAnimationFrame(() => {
                    correctionRef.current?.scrollIntoView?.({ block: "center" });
                    correctionRef.current?.focus();
                });
            }
        }
        catch (cause) {
            setError(cause instanceof Error ? cause.message : "Unable to load record.");
        }
        finally {
            setBusy(false);
        }
    }
    function choose(nextSlug: string) {
        setSlug(nextSlug);
        setPacket(null);
        setSelected("");
        setHistory([]);
        void load(undefined, nextSlug, undefined);
    }
    function closeEditor() {
        setSelected("");
        setHistory([]);
        const location = new URL(window.location.href);
        location.searchParams.delete("translationSegment");
        location.searchParams.delete("translationVersion");
        window.history.replaceState(window.history.state, "", location);
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
    const editor = row ? <Surface variant="subtle" padding="sm" radius="lg" className="min-w-0 space-y-3 break-words">
   <h4 className="theme-text-primary font-medium">{row.field} · {MARKS[row.status]?.label ?? row.status} · revision {row.revision}</h4>
   <p className="theme-text-secondary text-sm">Machine target: {row.machine?.target ?? "Missing"}</p>
   <p className="theme-text-faint text-xs">Model {row.machine?.model ?? "unknown"} · prompt {row.machine?.prompt_version ?? "unknown"}</p>
   <p className="theme-text-secondary text-sm">Approved target: {row.approved?.target ?? "Not reviewed"}. A stale approval does not apply to changed source context.</p>
   <p className="theme-text-secondary text-sm">{row.usages ? `${row.usages.total} current records share this English hash; showing ${row.usages.pages.length}.` : "Shared-hash usage was not included in this bounded inventory."} This correction affects only {packet?.slug}, {row.field}.</p>
   <ul className="theme-text-secondary text-sm">{row.usages?.pages.map(p => <li key={`${p.kind}:${p.slug}`}><SmartLink className="underline" href={p.href}>{p.kind}: {p.label}</SmartLink></li>)}</ul>
   <label htmlFor={`${formId}-correction`} className="block">Correction<Textarea id={`${formId}-correction`} ref={correctionRef} lang={locale} value={target} onChange={e => setTarget(e.target.value)} disabled={busy} maxLength={30000}/></label>
   <label htmlFor={`${formId}-reason`} className="block">Reason<Input id={`${formId}-reason`} value={reason} onChange={e => setReason(e.target.value)} disabled={busy} maxLength={1000}/></label>
   <div className="flex flex-wrap gap-2"><Button disabled={busy || !target.trim() || !reason.trim()} onClick={() => void mutate("save")}>Save draft</Button><Button variant="outline" disabled={busy || !row.draft || row.status === "stale" || row.draft.context !== row.context || target !== row.draft.target || !reason.trim()} onClick={() => void mutate("approve")}>Approve saved revision</Button><Button variant="ghost" disabled={busy} onClick={closeEditor}>Close editor</Button></div>
   <h5 className="theme-text-primary font-medium">Review history</h5>
   <ul className="space-y-2">{history.map(h => <li key={h.revision} className="theme-text-secondary text-sm">Revision {h.revision}: {h.action} by {h.actor}. {h.reason} <Button size="sm" variant="outline" disabled={busy || !reason.trim()} onClick={() => void mutate("restore", h.revision)}>Restore as draft</Button></li>)}</ul>
  </Surface> : null;
    return <section aria-label="Narrative review" className="min-w-0 space-y-4">
  <p className="theme-text-secondary text-sm">Review one public substance article. Corrections apply only to the selected paragraph and source context. Other uses of identical English retain their own wording.</p>
  <div className="flex flex-wrap items-end gap-3">
   <ArticlePicker locale={locale} disabled={busy} onChoose={choose}/>
   <label htmlFor={`${formId}-slug`}>Source slug<Input id={`${formId}-slug`} value={slug} disabled={busy} onChange={e => { setSlug(e.target.value); setPacket(null); setHistory([]); }}/></label>
   <Button disabled={busy || !slug.trim()} onClick={() => void load()}>Load source</Button>
  </div>
  {error ? <StateCard compact tone="danger" title="Review failed" description={error}/> : null}
  {publication.length > 0 ? <ul className="theme-text-secondary text-sm">{publication.map((receipt, index) => <li key={index}>{receipt.target}: {receipt.status} ({receipt.attempts} attempts). {receipt.detail}</li>)}</ul> : null}
  {notice ? <p role="status" className="theme-text-secondary text-sm">{notice}</p> : null}
  {packet ? <Surface variant="subtle" padding="sm" radius="lg" className="min-w-0 space-y-3">
   <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
    <h3 className="theme-text-primary font-medium">{packet.slug}</h3>
    {packet.tally ? <p className="theme-text-secondary text-sm">{packet.tally.humanApproved} of {packet.tally.total} paragraphs human approved</p> : null}
   </div>
   <p className="theme-text-faint text-xs">Stored wording in source order. Click a translated paragraph to correct it. This view does not certify the deployed page or its layout.</p>
   <div aria-hidden="true" className="theme-text-faint hidden text-xs md:grid md:grid-cols-2 md:gap-4"><span>English</span><span>{locale}</span></div>
   <ol className="space-y-4">
    {packet.rows.map((item, index) => {
            const mark = MARKS[item.status as NarrativeRowStatus] ?? MARKS.unreviewed, textId = `${formId}-text-${index}`, active = item.id === selected;
            return <li key={item.id} className="min-w-0 space-y-2">
     <p className="theme-text-faint text-xs">{labels[index]}</p>
     <div className="grid min-w-0 grid-cols-1 gap-2 md:grid-cols-2 md:gap-4">
      <div className="min-w-0">
       <p className="theme-text-faint text-xs md:hidden">English</p>
       <p lang="en" className="theme-text-primary whitespace-pre-wrap break-words">{item.source}</p>
      </div>
      <div className="min-w-0 space-y-1">
       <div className="flex flex-wrap items-center gap-2"><span className="theme-text-faint text-xs md:hidden">{locale}</span><Badge variant={mark.variant}>{mark.label}</Badge></div>
       <button type="button" aria-label={`Review ${labels[index]}`} aria-describedby={textId} aria-expanded={active} disabled={busy}
        className={`theme-focus-ring block w-full min-w-0 rounded-md px-2 py-1 text-left hover:bg-[var(--theme-frosted-control-hover-bg)] ${active ? "bg-[var(--theme-frosted-control-bg)]" : ""}`}
        onClick={() => void load(item.id)}>
        <span id={textId} lang={locale} className="theme-text-primary whitespace-pre-wrap break-words">{liveText(item)}</span>
       </button>
      </div>
     </div>
     {active ? editor : null}
    </li>;
        })}
   </ol>
  </Surface> : null}
 </section>;
}
