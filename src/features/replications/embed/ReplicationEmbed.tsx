"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { useTheme } from "@/context/ThemeContext";
import { isAllowedReplicationEmbedParent } from "@server/next/replicationEmbedPolicy";
import { ReplicationShowcase } from "../components/ReplicationShowcase";
import { SHOWCASE_WORK_CAP } from "../components/showcaseWork";
import { ReplicationViewerOverlay } from "../viewer/ReplicationViewerOverlay";
import type { ViewerHistoryAdapter } from "../viewer/viewerSession";
import { parseReplicationViewerSlug } from "../galleryUrlState";
import { EMBED_CHANNEL, EMBED_VERSION, isEmbedParentMessage, type EmbedCollection } from "./embedModel";
import "./embed.css";

type ChildMessage =
  | { type: "ready" | "resize"; height: number }
  | { type: "viewer"; slug: string | null }
  | { type: "error"; message: string };

export function ReplicationEmbed({ collection, parentOrigin, initialSlug = null, theme, error }: {
  collection?: EmbedCollection;
  parentOrigin: string | null;
  initialSlug?: string | null;
  theme?: "light" | "dark";
  error?: string;
}) {
  const router = useRouter();
  const { setColorScheme } = useTheme();
  const rootRef = useRef<HTMLElement>(null);
  const [connection, setConnection] = useState<"checking" | "standalone" | "embedded" | "blocked">("checking");
  const [viewerSlug, setViewerSlug] = useState<string | null>(null);
  const [selectionRevision, setSelectionRevision] = useState(0);
  const activeSlugRef = useRef<string | null>(null);
  const selectionAnnouncementRef = useRef<{ slug: string | null } | null>(null);
  const [selectionError, setSelectionError] = useState<string | null>(null);
  const readyRef = useRef(false);
  const works = useMemo(() => collection?.works.slice(0, SHOWCASE_WORK_CAP) ?? [], [collection]);
  const slugs = useMemo(() => new Set(collection?.works.map((work) => work.slug)), [collection]);

  const post = useCallback((message: ChildMessage) => {
    if (connection !== "embedded" || !parentOrigin) return;
    window.parent.postMessage({ channel: EMBED_CHANNEL, version: EMBED_VERSION, ...message }, parentOrigin);
  }, [connection, parentOrigin]);

  const select = useCallback((slug: string | null) => {
    if (slug !== null && !slugs.has(slug)) {
      const message = "This work is not available in this replication collection.";
      setSelectionError(message);
      post({ type: "error", message });
      return;
    }
    setSelectionError(null);
    if (slug === activeSlugRef.current) {
      if (readyRef.current) post({ type: "viewer", slug });
      return;
    }
    activeSlugRef.current = slug;
    selectionAnnouncementRef.current = { slug };
    setViewerSlug(slug);
    setSelectionRevision((revision) => revision + 1);
    if (slug === null && document.fullscreenElement && document.exitFullscreen) {
      void document.exitFullscreen().catch(() => undefined);
    }
  }, [post, slugs]);

  useLayoutEffect(() => {
    const announcement = selectionAnnouncementRef.current;
    if (!announcement || !readyRef.current) return;
    selectionAnnouncementRef.current = null;
    post({ type: "viewer", slug: announcement.slug });
  });

  useEffect(() => {
    if (window.parent === window) {
      setConnection("standalone");
      return;
    }
    setConnection(parentOrigin && isAllowedReplicationEmbedParent(parentOrigin, {
      isDevelopment: process.env.NODE_ENV === "development", publisherOrigin: window.location.origin,
    }) ? "embedded" : "blocked");
  }, [parentOrigin]);

  useEffect(() => {
    if (theme) setColorScheme(theme);
  }, [setColorScheme, theme]);

  useEffect(() => {
    if (connection !== "embedded") return;
    const receive = (event: MessageEvent<unknown>) => {
      if (event.source !== window.parent || event.origin !== parentOrigin || !isEmbedParentMessage(event.data)) return;
      if (event.data.type === "theme") setColorScheme(event.data.theme);
      else select(event.data.slug);
    };
    window.addEventListener("message", receive);
    return () => window.removeEventListener("message", receive);
  }, [connection, parentOrigin, select, setColorScheme]);

  useEffect(() => {
    if (connection !== "embedded" && connection !== "standalone") return;
    const root = rootRef.current;
    if (!root) return;
    /* The root, never the document: `documentElement.scrollHeight` is at least
       the frame's own viewport, so reporting it would ratchet the frame to
       whatever height the host already gave it and never shrink. */
    const height = () => Math.max(160, Math.ceil(root.getBoundingClientRect().height));
    post({ type: "ready", height: height() });
    readyRef.current = true;
    if (error) post({ type: "error", message: error });
    if (initialSlug && !slugs.has(initialSlug)) {
      setSelectionError("This work is not available in this replication collection.");
      post({ type: "error", message: "This work is not available in this replication collection." });
      post({ type: "viewer", slug: null });
    } else {
      select(initialSlug);
      if (!initialSlug) post({ type: "viewer", slug: null });
    }
    const observer = new ResizeObserver(() => post({ type: "resize", height: height() }));
    observer.observe(root);
    return () => { readyRef.current = false; observer.disconnect(); };
  }, [connection, error, initialSlug, post, select, slugs]);

  // Canonical public links remain ordinary links, but cannot navigate this frame
  // away from its protocol host. Viewer-entry links still run their own handler.
  useEffect(() => {
    if (connection !== "embedded") return;
    const prepareLink = (event: MouseEvent) => {
      const anchor = event.target instanceof Element ? event.target.closest("a[href]") : null;
      if (!(anchor instanceof HTMLAnchorElement)) return;
      const url = new URL(anchor.href, window.location.href);
      if (url.protocol !== "http:" && url.protocol !== "https:") {
        event.preventDefault();
        return;
      }
      if (url.origin === window.location.origin && url.pathname === "/embed/replications" && url.searchParams.has("viewer")) return;
      anchor.target = "_blank";
      anchor.rel = "noopener noreferrer";
    };
    document.addEventListener("click", prepareLink, true);
    document.addEventListener("auxclick", prepareLink, true);
    return () => {
      document.removeEventListener("click", prepareLink, true);
      document.removeEventListener("auxclick", prepareLink, true);
    };
  }, [connection]);

  const controller = useMemo(() => ({
    sourcePath: collection?.viewer.sourcePath ?? "/embed/replications",
    onOpenWork: select,
    viewerOpen: viewerSlug !== null,
  }), [collection?.viewer.sourcePath, select, viewerSlug]);

  const historyAdapter = useMemo<ViewerHistoryAdapter>(() => {
    const publishSelection = (url: string) => {
      const slug = parseReplicationViewerSlug(new URL(url, window.location.origin).searchParams);
      if (!slug || !slugs.has(slug)) return;
      // Do not feed navigation back through initialSlug: a work can belong to
      // several effect groups, and URL synchronization would jump to the first.
      activeSlugRef.current = slug;
      post({ type: "viewer", slug });
    };
    return {
      push: publishSelection,
      replace: publishSelection,
      back: () => select(null),
      viewerStateActive: () => true,
    };
  }, [post, select, slugs]);

  const unavailable = connection === "blocked" ? "This site is not allowed to embed these replications." : error;
  const usable = connection === "embedded" || connection === "standalone";
  // Framed by another app (osmanthus.io): carousel only — the host supplies its
  // own section heading and rights context, so ours is duplicate clutter. Opened
  // directly on dose.wiki, the document keeps its heading and media terms.
  const chrome = connection === "standalone";
  return (
    <main id="main-content" ref={rootRef} data-replication-embed className={collection && !chrome ? "min-w-0" : "min-w-0 space-y-3 p-1"}>
      {connection === "checking" ? <p role="status" className="theme-text-muted p-4">Loading replications…</p> : null}
      {unavailable ? (
        <div role="alert" className="space-y-3 p-4">
          <p className="theme-text-muted">{unavailable}</p>
          {usable ? <Button variant="outline" onClick={() => router.refresh()}>Try again</Button> : null}
        </div>
      ) : usable && collection ? (
        collection.works.length > 0 ? (
          <>
            <ReplicationShowcase works={works} collectionWorks={collection.works} totalCount={collection.works.length}
              collectionLabel={collection.viewer.label} controller={controller} showHeading={chrome} />
            {chrome ? (
              <p className="theme-text-muted px-1 text-xs leading-5">
                Replication media is credited to its creator; rights remain with the rightsholder. <a className="underline underline-offset-2" href="/docs/license#replication-media-terms">Media terms</a>
              </p>
            ) : null}
          </>
        ) : <div className="space-y-3 p-4"><p role="status" className="theme-text-muted">No public replications are available in this collection.</p><Button variant="outline" onClick={() => router.refresh()}>Check again</Button></div>
      ) : null}
      {selectionError ? <p role="alert" className="theme-text-muted px-4">{selectionError}</p> : null}
      {usable && collection && viewerSlug ? (
        <ReplicationViewerOverlay collection={collection.viewer} initialSlug={viewerSlug} open
          selectionRevision={selectionRevision} editorEnabled={false} historyAdapter={historyAdapter}
          onOpenChange={(open) => { if (!open) select(null); }} />
      ) : null}
    </main>
  );
}
