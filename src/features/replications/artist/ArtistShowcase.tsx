"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { proseLinkClassName } from "@/components/common/ProseLink";
import { useT, useUiLocale } from "@/i18n/client";
import {
  buildReplicationViewerUrl,
  closeReplicationViewerUrl,
  parseReplicationViewerSlug,
} from "../galleryUrlState";
import {
  dismissViewerDeepLinkCover,
  ViewerDeepLinkCover,
} from "../ViewerDeepLinkCover";
import { ReplicationShowcase } from "../components/ReplicationShowcase";
import type { ShowcaseWork } from "../components/showcaseWork";
import { LazyReplicationViewerOverlay } from "../components/LazyReplicationViewerOverlay";
import type { ReplicationViewerCollection } from "../viewer/viewerModel";

export interface ArtistShowcaseProps {
  /** Persistent identity shown by the expanded viewer's heading. */
  label: string;
  /** Opening filmstrip, capped on the server. */
  works: ShowcaseWork[];
  /** The body of work's complete size; beyond the cap it drives the "+N" tile. */
  totalCount: number;
  /** Viewer identity and opening works; offscreen works resolve on intent. */
  collection: ReplicationViewerCollection;
  artistKey: string;
  /** The Artist Page path the `?viewer=` URL contract writes against. */
  sourcePath: string;
}

/**
 * The Artist Page owns the viewer URL contract and resolves its validated
 * complete collection only on launch or a direct viewer link.
 */
export function ArtistShowcase({
  label,
  works,
  totalCount,
  collection,
  sourcePath,
  artistKey,
}: ArtistShowcaseProps) {
  const t = useT();
  const locale = useUiLocale();
  const resolveCollection = useCallback(async () => {
    const params = new URLSearchParams({ artist: artistKey, locale });
    const response = await fetch(`/api/replications/showcase?${params}`, { headers: { Accept: "application/json" } });
    if (!response.ok) throw new Error("Artist collection could not be loaded.");
    const payload = await response.json() as { groups?: ReplicationViewerCollection["groups"] };
    if (!Array.isArray(payload.groups)) throw new Error("Malformed artist collection.");
    return { ...collection, groups: payload.groups.map((group) => ({
      ...group,
      label: collection.groups[0]?.label ?? group.label,
      items: group.items.map((item) => ({ ...item, avatarUrl: works[0]?.avatarUrl ?? null })),
    })) };
  }, [artistKey, collection, locale, works]);
  const [viewerSlug, setViewerSlug] = useState<string | null>(null);

  useEffect(() => {
    const syncViewerFromUrl = () => {
      const params = new URLSearchParams(window.location.search);
      const slug = parseReplicationViewerSlug(params);
      setViewerSlug(slug);
      if (params.has("viewer") && !slug) {
        const source = `${window.location.pathname}${window.location.search}${window.location.hash}`;
        window.history.replaceState(
          window.history.state,
          "",
          closeReplicationViewerUrl(source),
        );
      }
      // Keep the cover until the viewer closes or history leaves its URL,
      // including while the collection or viewer chunk is still loading.
      if (!slug) {
        dismissViewerDeepLinkCover();
      }
    };
    syncViewerFromUrl();
    window.addEventListener("popstate", syncViewerFromUrl);
    return () => window.removeEventListener("popstate", syncViewerFromUrl);
  }, []);

  const launchViewer = useCallback((slug: string) => {
    const source = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    window.history.pushState(
      { ...window.history.state, replicationViewer: true },
      "",
      buildReplicationViewerUrl(source, slug),
    );
    setViewerSlug(slug);
  }, []);

  const controller = useMemo(
    () => ({ sourcePath, onOpenWork: launchViewer }),
    [sourcePath, launchViewer],
  );
  const [rightsBefore, rightsAfter] = t(
    "Replication media is credited to its creator when known. Rights remain with the original creator or rightsholder unless an individual item states another license. See the {{terms}} to correct a credit or request removal.",
  ).split("{{terms}}");

  return (
    <>
      {/* Before the stages in document order: a `?viewer=` deep link's first
          paint is black, and the resolution effect above dismisses the cover
          if the slug is unknown here. */}
      <ViewerDeepLinkCover />

      <ReplicationShowcase
        works={works}
        totalCount={totalCount}
        collectionLabel={label}
        showCreator={false}
        /* The page's only heading above this is its own h1. */
        headingLevel={2}
        controller={controller}
      />

      {/* Rights footnote — the page's, not the stage's. */}
      <p className="theme-text-muted mx-auto mt-10 max-w-3xl px-1 text-center text-xs leading-5">
        {rightsBefore}
        <Link
          href="/docs/license#replication-media-terms"
          className={proseLinkClassName}
        >
          {t("licensing terms")}
        </Link>
        {rightsAfter}
      </p>

      {viewerSlug ? (
        <LazyReplicationViewerOverlay
          collection={collection}
          resolveCollection={resolveCollection}
          initialSlug={viewerSlug}
          open
          onOpenChange={(nextOpen) => {
            if (!nextOpen) {
              setViewerSlug(null);
              dismissViewerDeepLinkCover();
              const source = `${window.location.pathname}${window.location.search}${window.location.hash}`;
              window.history.replaceState(window.history.state, "", closeReplicationViewerUrl(source));
            }
          }}
        />
      ) : null}
    </>
  );
}
