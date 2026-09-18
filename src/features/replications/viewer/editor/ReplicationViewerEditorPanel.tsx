"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { ExpandButton } from "@/components/common/ExpandButton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { EditorField, EditorSelect } from "@/features/dev/components";
import { PlaylistEditor } from "@/features/dev/tools/playlists/PlaylistEditor";
import type { PlaylistDraft } from "@/features/dev/tools/playlists/playlistsModel";
import { ReplicationSingleEditor, type SingleEditDraft } from "@/features/dev/tools/replication-studio/ReplicationEditorDrawer";
import type { StudioRow, StudioEffectOption } from "@/features/dev/tools/replication-studio/replicationStudioModel";
import { useContextualEditing } from "@/features/contextual-editing/context";
import type { ReplicationViewerEditorGateProps } from "./ReplicationViewerEditorGate.editor";
import { SortableViewerRail } from "./SortableViewerRail";

type Target = { kind: "substance" | "effect" | "artist" | "playlist"; key: string; label: string };
type Detail = {
  row: StudioRow;
  revision: string;
  effects: StudioEffectOption[];
  playlists: { key: string; title: string }[];
  collection: { revision: string; order: string[]; removed?: string[]; editable: boolean; title: string };
};
type MetadataSession = { base: Detail; draft: SingleEditDraft; dirty: boolean };
type CollectionSession = { target: Target; revision: string; base: PlaylistDraft; draft: PlaylistDraft; editable: boolean };
type Publication = { mode: "metadata" | "collection"; change: Record<string, unknown>; before: unknown; after: unknown; slug: string; collectionKey?: string };
const ENDPOINT = "/api/dev/replications/contextual";

class EditorRequestError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, headers: { "Content-Type": "application/json", ...init?.headers } });
  const body = await response.json();
  if (!response.ok || body.ok === false) throw new EditorRequestError(body.error ?? "The request failed. Your local draft is retained; retry when the connection is restored.", response.status);
  return body as T;
}
function draftOf(row: StudioRow): SingleEditDraft {
  return { title: row.title, artist: row.artist, role: row.role, effect_slug: row.effect_slug, credit_line: row.credit_line, effect_tags: [...row.effect_tags], source_url: row.source_url ?? null };
}

const PUBLICATION_FIELD_LABELS: Record<string, string> = {
  title: "Title", artist: "Artist", role: "Role", effect_slug: "Primary effect",
  credit_line: "Rights / credit", effect_tags: "Subjective effect tags",
  source_url: "Source URL", slugs: "Works, in order",
};

function publicationValue(field: string, value: unknown, collection: ReplicationViewerEditorGateProps["collection"]) {
  if (value === null || value === undefined || value === "") return "Not set";
  if (Array.isArray(value)) {
    if (value.length === 0) return "None";
    return value.map((item, index) => {
      if (field !== "slugs") return String(item);
      for (const group of collection.groups) {
        const work = group.items.find(work => work.replication.slug === item);
        if (work) return `${index + 1}. ${work.replication.title} (${item})`;
      }
      return `${index + 1}. ${String(item)}`;
    }).join("\n");
  }
  return String(value);
}

/** The viewer owns the only dialog. This panel portals into its existing focus boundary. */
export function ReplicationViewerEditorPanel(props: ReplicationViewerEditorGateProps) {
  const { collection, activeSlug, open, panelHost, railHost, onOrderChange, onReorderModeChange } = props;
  const editing = useContextualEditing();
  const router = useRouter();
  const headingId = useId();
  const [scope, setScope] = useState<"metadata" | "collection">("collection");
  const [targetOverride, setTargetOverride] = useState<Target | null>(null);
  const target = targetOverride ?? collection.editorTarget ?? null;
  const targetKey = target ? `${target.kind}:${target.key}` : "";
  const [sessions, setSessions] = useState<Record<string, MetadataSession>>({});
  const [collections, setCollections] = useState<Record<string, CollectionSession>>({});
  const [review, setReview] = useState<Publication | null>(null);
  const [busy, setBusy] = useState(false);
  const [pendingPublication, setPendingPublication] = useState<Publication | null>(null);
  const [effectQuery, setEffectQuery] = useState("");
  const [findingEffects, setFindingEffects] = useState(false);
  const [playlistKey, setPlaylistKey] = useState("");
  const effectQueryId = useId();
  const playlistKeyId = useId();
  const [otherPlaylistOpen, setOtherPlaylistOpen] = useState(false);
  const [effectSearchOpen, setEffectSearchOpen] = useState(false);
  const otherPlaylistId = useId();
  const effectSearchId = useId();
  const reviewHeading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { if (review) reviewHeading.current?.focus(); }, [review]);
  const locked = busy || pendingPublication !== null;
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [arranging, setArranging] = useState(false);
  const [pendingClose, setPendingClose] = useState<(() => void) | null>(null);
  const requestIds = useRef<Record<string, string>>({});
  const panelRef = useRef<HTMLElement>(null);
  const loadGeneration = useRef(0);
  const session = sessions[activeSlug];
  const collectionSession = collections[targetKey];
  const collectionDirty = Boolean(collectionSession && JSON.stringify(collectionSession.draft) !== JSON.stringify(collectionSession.base));
  const anyDirty = pendingPublication !== null || Object.values(sessions).some(s => s.dirty) || Object.values(collections).some(s => JSON.stringify(s.draft) !== JSON.stringify(s.base));
  const dirtyKey = `replication-viewer:${collection.sourcePath}`;

  useEffect(() => {
    editing.setDirty(dirtyKey, anyDirty);
    return () => editing.setDirty(dirtyKey, false);
  }, [anyDirty, dirtyKey, editing.setDirty]);

  const discard = useCallback(() => {
    if (locked) return;
    setSessions(current => Object.fromEntries(Object.entries(current).map(([key, value]) => [key, { ...value, draft: draftOf(value.base.row), dirty: false }])));
    setCollections(current => Object.fromEntries(Object.entries(current).map(([key, value]) => [key, { ...value, draft: value.base }])));
    setReview(null);
    setArranging(false);
    onReorderModeChange(false);
    const source = collections[collection.editorTarget ? `${collection.editorTarget.kind}:${collection.editorTarget.key}` : ""];
    if (source) onOrderChange(source.base.slugs);
  }, [collection.editorTarget, collections, locked, onOrderChange, onReorderModeChange]);
  useEffect(() => editing.registerDraftGuard(dirtyKey, { discard, canDiscard: !locked }), [dirtyKey, discard, locked, editing.registerDraftGuard]);

  useEffect(() => {
    const beforeClose = (event: Event) => {
      if (!anyDirty && !busy) {
        window.setTimeout(() => router.refresh(), 0);
        return;
      }
      event.preventDefault();
      props.onOpenChange(true);
      if (locked) {
        setError("This publication is pending or its outcome is unknown. Reconcile the exact reviewed request before leaving; its operation identity cannot be discarded.");
        return;
      }
      const proceed = (event as CustomEvent<{ proceed: () => void }>).detail.proceed;
      setPendingClose(() => proceed);
    };
    document.addEventListener("replication-viewer-before-close", beforeClose);
    return () => document.removeEventListener("replication-viewer-before-close", beforeClose);
  }, [anyDirty, busy, locked, props.onOpenChange, router]);

  useEffect(() => { setReview(null); setArranging(false); }, [activeSlug, targetKey]);

  const load = useCallback(async (signal?: AbortSignal, replace = false) => {
    const search = new URLSearchParams({ slug: activeSlug });
    if (target) { search.set("targetKind", target.kind); search.set("targetKey", target.key); }
    const detail = await request<Detail>(`${ENDPOINT}?${search}`, { signal });
    setSessions(current => current[activeSlug] && !(replace && scope === "metadata") ? current : { ...current, [activeSlug]: { base: detail, draft: draftOf(detail.row), dirty: false } });
    if (target) {
      const visible = collection.groups.flatMap(group => group.items.map(item => item.replication.slug)).filter(slug => !detail.collection.removed?.includes(slug));
      const storedOrder = detail.collection.order.filter(slug => visible.includes(slug));
      const slugs = target.kind === "playlist" ? detail.collection.order : [...storedOrder, ...visible.filter(slug => !storedOrder.includes(slug))];
      const base: PlaylistDraft = { key: target.key, title: target.kind === "playlist" ? detail.collection.title : target.label, slugs, expectedUpdatedAt: null, ownerEmail: "" };
      setCollections(current => current[targetKey] && !(replace && scope === "collection") ? current : { ...current, [targetKey]: { target, revision: detail.collection.revision, base, draft: base, editable: detail.collection.editable } });
      if (replace && scope === "collection" && !targetOverride) onOrderChange(base.slugs);
    }
    if (replace) { setReview(null); setError(null); }
  }, [activeSlug, target, targetKey, collection, scope, targetOverride, onOrderChange]);

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    const generation = ++loadGeneration.current;
    setError(null);
    void load(controller.signal).catch((cause: unknown) => {
      if (!controller.signal.aborted && generation === loadGeneration.current) setError(cause instanceof Error ? cause.message : "Unable to load this work.");
    });
    return () => controller.abort();
  }, [load, open]);

  useEffect(() => {
    if (open) panelRef.current?.focus({ preventScroll: true });
    if (!open) { onReorderModeChange(false); setArranging(false); }
  }, [open, onReorderModeChange]);

  const changeMetadata = useCallback((draft: SingleEditDraft, dirty: boolean) => {
    setSessions(current => ({ ...current, [activeSlug]: { ...current[activeSlug], draft, dirty } }));
    setReview(null); setNotice(null);
  }, [activeSlug]);

  const changeCollection = (draft: PlaylistDraft) => {
    if (!collectionSession) return;
    setCollections(current => ({ ...current, [targetKey]: { ...collectionSession, draft } }));
    setReview(null); setNotice(null);
    if (!targetOverride) onOrderChange(draft.slugs);
  };

  const reviewMetadata = () => {
    if (!session || !session.dirty) return;
    const { source_url, ...updates } = session.draft;
    const fingerprint = JSON.stringify([session.base.row.id, session.base.revision, session.draft]);
    const requestId = requestIds.current[fingerprint] ??= crypto.randomUUID();
    setReview({ mode: "metadata", slug: activeSlug, change: { id: session.base.row.id, expectedRevision: session.base.revision, requestId, updates, sourceUrl: source_url ?? null }, before: draftOf(session.base.row), after: session.draft });
  };
  const reviewCollection = () => {
    if (!collectionSession || !collectionDirty) return;
    const { target: owner, draft, base, revision } = collectionSession;
    const fingerprint = JSON.stringify([targetKey, revision, base.slugs, draft]);
    const requestId = requestIds.current[fingerprint] ??= crypto.randomUUID();
    setReview({ mode: "collection", slug: activeSlug, collectionKey: targetKey, change: { targetKind: owner.kind, targetKey: owner.key, expectedRevision: revision, requestId, slugs: draft.slugs, previousSlugs: base.slugs, title: draft.title }, before: { title: base.title, slugs: base.slugs }, after: { title: draft.title, slugs: draft.slugs } });
  };

  const findEffectOptions = async () => {
    if (!session || findingEffects) return;
    setFindingEffects(true);
    setError(null);
    try {
      const result = await request<{ effects: StudioEffectOption[] }>(`${ENDPOINT}?effectQuery=${encodeURIComponent(effectQuery)}`);
      setSessions(current => {
        const currentSession = current[activeSlug];
        if (!currentSession) return current;
        const options = new Map(currentSession.base.effects.map(effect => [effect.slug, effect]));
        for (const effect of result.effects) options.set(effect.slug, effect);
        return { ...current, [activeSlug]: { ...currentSession, base: { ...currentSession.base, effects: [...options.values()] } } };
      });
      setNotice(`${result.effects.length} matching effect options loaded. Choose one in Primary effect or Subjective effect tags.`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to find effect options."); }
    finally { setFindingEffects(false); }
  };
  const publish = async () => {
    const publication = pendingPublication ?? review;
    if (!publication || busy) return;
    setBusy(true); setError(null); setPendingPublication(publication);
    try {
      await request(ENDPOINT, { method: "POST", body: JSON.stringify({ mode: publication.mode, change: publication.change, slug: publication.slug }) });
      setNotice("Publication confirmed. The attributed before/after history was saved with this change.");
      setPendingPublication(null);
      setReview(null);
      // Only the confirmed domain is cleared. Other works' drafts survive reconciliation.
      if (publication.mode === "metadata") setSessions(current => { const next = { ...current }; delete next[publication.slug]; return next; });
      else if (publication.collectionKey) setCollections(current => { const next = { ...current }; delete next[publication.collectionKey!]; return next; });
      await load(undefined, false).catch(() => setError("Publication is confirmed, but the refreshed record could not be loaded. Retry the read before editing again."));
    } catch (cause) {
      if (cause instanceof EditorRequestError && cause.status >= 400 && cause.status < 500 && cause.status !== 408 && (pendingPublication === null || cause.status === 409)) {
        setPendingPublication(null);
        setReview(publication);
      }
      setError(cause instanceof Error ? cause.message : "Publication was not confirmed. Its exact request is retained for explicit reconciliation.");
    } finally { setBusy(false); }
  };

  if (!panelHost) return null;
  const group = collection.groups.find(group => group.items.some(item => item.replication.slug === activeSlug));
  const railItems = collectionSession && group ? collectionSession.draft.slugs.flatMap(slug => group.items.filter(item => item.replication.slug === slug)) : [];
  return <>
    {createPortal(
      <section ref={panelRef} tabIndex={-1} aria-labelledby={headingId} data-publication-review={review || pendingPublication ? "" : undefined} className="theme-text-primary min-w-0 space-y-5 p-4 outline-none [overflow-wrap:anywhere]">
        <header className="flex items-start justify-between gap-3">
          <div className="min-w-0"><h2 id={headingId} className="theme-text-primary font-semibold">Edit replication</h2><p className="theme-text-muted break-words text-sm">{session?.base.row.title ?? activeSlug}</p><p className="theme-text-muted text-xs">From {collection.label}</p></div>
          <Button variant="ghost" size="sm" aria-label="Close editor and keep drafts" disabled={locked} onClick={() => props.onOpenChange(false)}>Close editor</Button>
        </header>
        {pendingClose ? <section aria-label="Unsaved viewer drafts" className="space-y-2">
          <p className="theme-text-primary">Leaving this viewer discards its local drafts. Nothing unconfirmed will be published.</p>
          <Button variant="ghostDestructive" disabled={locked} onClick={() => { discard(); editing.setDirty(dirtyKey, false); setPendingClose(null); window.setTimeout(() => { pendingClose(); router.refresh(); }, 0); }}>Discard drafts and close viewer</Button>
          <Button variant="secondary" disabled={busy} onClick={() => setPendingClose(null)}>Stay in viewer</Button>
        </section> : null}
        <p className="theme-text-muted text-sm">Changes stay local until you review and confirm publication. Closing keeps your draft for this viewer session.</p>
        {!review && !pendingPublication ? <div className="flex flex-wrap gap-2">
          <Button size="sm" disabled={locked} variant={scope === "collection" ? "accent" : "secondary"} aria-pressed={scope === "collection"} onClick={() => { setScope("collection"); setReview(null); }}>Collection</Button>
          {editing.role === "admin" ? <Button size="sm" disabled={locked} variant={scope === "metadata" ? "accent" : "secondary"} aria-pressed={scope === "metadata"} onClick={() => { setScope("metadata"); setReview(null); setArranging(false); onReorderModeChange(false); }}>Canonical metadata</Button> : null}
          {anyDirty ? <Badge variant="secondary">Local draft</Badge> : null}
        </div> : null}
        {error ? <div role="alert" className="theme-text-primary space-y-2 text-sm"><p>{error}</p><Button size="sm" variant="secondary" disabled={busy} onClick={() => void load().catch(cause => setError(String(cause)))}>Retry read</Button>{session ? <Button size="sm" variant="ghostDestructive" disabled={locked} onClick={() => void load(undefined, true).catch(cause => setError(String(cause)))}>Discard this draft and reload stored version</Button> : null}</div> : null}
        {notice ? <p role="status" className="theme-text-primary text-sm">{notice}</p> : null}
        {pendingPublication ? <section aria-label="Publication reconciliation" className="space-y-3">
          <h3 className="theme-text-primary font-semibold">{busy ? "Publication pending" : "Publication outcome unknown"}</h3>
          <p className="theme-text-muted text-sm">The {pendingPublication.mode} change for {pendingPublication.collectionKey ?? pendingPublication.slug} retains its original request identity. Nothing is replayed automatically. Retry only this exact reviewed request to confirm whether it was applied.</p>
          <pre className="theme-text-primary whitespace-pre-wrap break-all text-xs">{JSON.stringify(pendingPublication.after, null, 2)}</pre>
          <Button variant="accent" disabled={busy} onClick={() => void publish()}>Retry exact reviewed publication</Button>
        </section> : null}
        {!session && !error ? <p role="status">Loading this replication…</p> : null}
        {!review && !pendingPublication && scope === "metadata" && session && editing.role === "admin" ? <>
          <p className="theme-text-muted text-sm">Title, credit, source, and classification belong to the shared canonical record. Every collection using this work will reflect the correction. Artist endorsement is not changed here.</p>
          <ExpandButton variant="inline" isExpanded={effectSearchOpen} onToggle={() => setEffectSearchOpen(value => !value)} label="Find more effects" ariaControls={effectSearchId} />
          {effectSearchOpen ? <div id={effectSearchId} className="space-y-3">
          <EditorField label="Find effect options by slug prefix" htmlFor={effectQueryId} description="Search at least two slug characters. At most eight matches are loaded; refine the prefix for more specific results.">
            <Input id={effectQueryId} value={effectQuery} disabled={locked || findingEffects} onChange={event => setEffectQuery(event.target.value)} />
          </EditorField>
          <Button variant="secondary" size="sm" disabled={locked || findingEffects || effectQuery.trim().length < 2} onClick={() => void findEffectOptions()}>{findingEffects ? "Finding effects…" : "Find effect options"}</Button>
          </div> : null}
          <fieldset disabled={locked}><ReplicationSingleEditor row={session.base.row} effects={session.base.effects} artists={[session.base.row.artist]} value={session.draft} busy={locked} onDraftChange={changeMetadata} onSave={reviewMetadata} showSource saveLabel="Review publication" /></fieldset>
          {session.dirty ? <div className="theme-text-primary space-y-1 text-sm" aria-label="Local metadata preview"><strong>{session.draft.title}</strong><p>{session.draft.artist}</p><p>{session.draft.credit_line}</p><p className="break-all">{session.draft.source_url}</p></div> : null}
        </> : null}
        {!review && !pendingPublication && scope === "collection" && session ? <>
          <EditorSelect disabled={locked} aria-label="Collection to curate" value={targetOverride ? `playlist:${targetOverride.key}` : "source"} options={[{ value: "source", label: `${collection.label} (source collection)` }, ...session.base.playlists.map(p => ({ value: `playlist:${p.key}`, label: `Playlist: ${p.title}` })), ...(targetOverride && !session.base.playlists.some(p => p.key === targetOverride.key) ? [{ value: `playlist:${targetOverride.key}`, label: `Playlist: ${targetOverride.label}` }] : [])]} onChange={event => {
            const key = event.target.value.replace(/^playlist:/, ""); const playlist = session.base.playlists.find(p => p.key === key);
            setTargetOverride(playlist ? { kind: "playlist", key, label: playlist.title } : null); setReview(null); onReorderModeChange(false);
          }} />
          <ExpandButton variant="inline" isExpanded={otherPlaylistOpen} onToggle={() => setOtherPlaylistOpen(value => !value)} label="Open another playlist" ariaControls={otherPlaylistId} />
          {otherPlaylistOpen ? <div id={otherPlaylistId} className="space-y-3">
          <EditorField label="Open a playlist by its exact key" htmlFor={playlistKeyId} description="Suggestions include up to 25 of your playlists. Enter any other playlist key you are authorized to edit.">
            <Input id={playlistKeyId} value={playlistKey} disabled={locked} onChange={event => setPlaylistKey(event.target.value)} />
          </EditorField>
          <Button variant="secondary" size="sm" disabled={locked || !playlistKey.trim()} onClick={() => {
            const key = playlistKey.trim().toLowerCase();
            if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(key)) { setError("Use the playlist’s lowercase, hyphen-separated key."); return; }
            setTargetOverride({ kind: "playlist", key, label: key }); setReview(null); setArranging(false); onReorderModeChange(false);
          }}>Open playlist</Button>
          </div> : null}
          {collectionSession?.editable ? <>
            <p className="theme-text-muted text-sm">{collectionSession.target.kind === "playlist" ? "Only this playlist changes. Existing showcases are not rewritten by changing a reusable playlist." : collectionSession.target.kind === "substance" ? "Only this substance showcase changes. Removing a work suppresses it here, not from the canonical media library." : "Membership is derived from canonical metadata. This collection supports order changes only."}</p>
            <PlaylistEditor contextual draft={collectionSession.draft} isNew={false} isDirty={collectionDirty} busy={locked} showOwner={false} notice={null} onChange={changeCollection} onSave={reviewCollection} onCancel={() => changeCollection(collectionSession.base)} saveLabel="Review publication" titleEditable={collectionSession.target.kind === "playlist"} membershipEditable={collectionSession.target.kind === "playlist" || collectionSession.target.kind === "substance"} />
            {!targetOverride && railHost ? <Button size="sm" variant="secondary" disabled={locked} aria-pressed={arranging} onClick={() => { setArranging(!arranging); onReorderModeChange(!arranging); }}>{arranging ? "Finish arranging thumbnails" : "Arrange thumbnails — keyboard or pointer"}</Button> : null}
          </> : <p className="theme-text-muted text-sm">{target ? "You cannot publish changes to this collection." : "This gallery derives its membership. Choose an owned playlist to curate, or edit this work’s canonical metadata."}</p>}
        </> : null}
        {review && !pendingPublication ? <section className="min-w-0 space-y-4" aria-label="Publication review">
          <h3 ref={reviewHeading} tabIndex={-1} className="theme-text-primary font-semibold">Review {review.mode === "metadata" ? "shared metadata correction" : "collection publication"}</h3>
          <p className="theme-text-muted text-sm">{review.mode === "metadata" ? "This updates the canonical work in every appearance, not just this collection." : "This publishes the named collection’s membership and order; it does not edit or delete media."}</p>
          {Object.entries(review.after as Record<string, unknown>).filter(([field, value]) => JSON.stringify(value) !== JSON.stringify((review.before as Record<string, unknown>)[field])).map(([field, value]) => <section key={field} className="min-w-0 space-y-2">
            <h4 className="font-semibold">{PUBLICATION_FIELD_LABELS[field] ?? field}</h4>
            <div className="min-w-0 space-y-3">
              <div><h5 className="theme-text-muted text-sm">Published</h5><p className="whitespace-pre-wrap text-sm">{publicationValue(field, (review.before as Record<string, unknown>)[field], collection)}</p></div>
              <div><h5 className="theme-text-muted text-sm">Your draft</h5><p className="whitespace-pre-wrap text-sm">{publicationValue(field, value, collection)}</p></div>
            </div>
          </section>)}
          <div className="sticky bottom-0 flex flex-wrap gap-2 border-t theme-border bg-dose-body py-3"><Button variant="accent" disabled={busy} onClick={() => void publish()}>{busy ? "Publishing…" : "Confirm publication"}</Button><Button variant="ghost" disabled={busy} onClick={() => { setReview(null); panelRef.current?.focus(); }}>Return to draft</Button></div>
        </section> : null}
        {anyDirty && !review && !pendingPublication ? <Button variant="ghostDestructive" disabled={locked} onClick={discard}>Discard all viewer drafts</Button> : null}
      </section>, panelHost)}
    {open && arranging && scope === "collection" && !targetOverride && collectionSession?.editable && railHost && railItems.length > 0 ? createPortal(<SortableViewerRail items={railItems} activeSlug={activeSlug} disabled={locked} onActivate={props.onActivateSlug} onReorder={slugs => changeCollection({ ...collectionSession.draft, slugs: [...slugs, ...collectionSession.draft.slugs.filter(slug => !slugs.includes(slug))] })} />, railHost) : null}
  </>;
}
