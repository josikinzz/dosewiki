"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { proseLinkClassName } from "@/components/common/ProseLink";
import { Alert, AlertDescription } from "@/components/ui/alert";
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
import { ReplicationViewerOverlay } from "../viewer/ReplicationViewerOverlay";
import type { ReplicationViewerCollection } from "../viewer/viewerModel";

export interface ArtistShowcaseProps {
  /** Persistent identity shown by the expanded viewer's heading. */
  label: string;
  /** The filmstrip works — capped by the server to the showcase cap. */
  works: ShowcaseWork[];
  /** The body of work's complete size; beyond the cap it drives the "+N" tile. */
  totalCount: number;
  /**
   * The complete body of work the expanded viewer walks — every work as one
   * collection, so a deep link to a work beyond the filmstrip's cap still
   * opens.
   */
  collection: ReplicationViewerCollection;
  /** The Artist Page path the `?viewer=` URL contract writes against. */
  sourcePath: string;
}

/**
 * The Artist Page's works: one showcase stage over the artist's whole body of
 * work. This component — not the showcase — owns the viewer URL contract,
 * exactly as the gallery explorer does on /replications: the deep link
 * resolves here against the whole collection, the overlay is a single
 * instance, and the showcase merely reports launches through its controller.
 */
export function ArtistShowcase({
  label,
  works,
  totalCount,
  collection,
  sourcePath,
}: ArtistShowcaseProps) {
  const [viewerSlug, setViewerSlug] = useState<string | null>(null);
  const [unavailableViewerSlug, setUnavailableViewerSlug] = useState<
    string | null
  >(null);
  const collectionSlugs = useMemo(() => {
    const slugs = new Set<string>();
    for (const group of collection.groups) {
      for (const item of group.items) {
        slugs.add(item.replication.slug);
      }
    }
    return slugs;
  }, [collection]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const slug = parseReplicationViewerSlug(params);
    const belongsToCollection = Boolean(slug && collectionSlugs.has(slug));
    setUnavailableViewerSlug(slug && !belongsToCollection ? slug : null);
    setViewerSlug(belongsToCollection ? slug : null);
    if (params.has("viewer") && !belongsToCollection) {
      const source = `${window.location.pathname}${window.location.search}${window.location.hash}`;
      window.history.replaceState(
        window.history.state,
        "",
        closeReplicationViewerUrl(source),
      );
    }
    // Absent or unresolvable viewer param: drop the deep-link cover so the
    // page (and the unavailable notice) is visible. A valid param keeps the
    // cover underneath the opaque overlay until the viewer closes.
    if (!belongsToCollection) {
      dismissViewerDeepLinkCover();
    }
  }, [collectionSlugs]);

  const launchViewer = useCallback((slug: string) => {
    const source = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    setUnavailableViewerSlug(null);
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

  return (
    <>
      {/* Before the stages in document order: a `?viewer=` deep link's first
          paint is black, and the resolution effect above dismisses the cover
          if the slug is unknown here. */}
      <ViewerDeepLinkCover />
      {unavailableViewerSlug ? (
        <Alert role="status">
          <AlertDescription>
            The linked replication is no longer available in this collection.
          </AlertDescription>
        </Alert>
      ) : null}

      <ReplicationShowcase
        works={works}
        totalCount={totalCount}
        collectionLabel={label}
        showCreator={false}
        controller={controller}
      />

      {/* Rights footnote — the page's, not the stage's. */}
      <p className="theme-text-muted mx-auto mt-10 max-w-3xl px-1 text-center text-xs leading-5">
        Replication media is credited to its creator when known. Rights remain
        with the original creator or rightsholder unless an individual item
        states another license. See the{" "}
        <Link
          href="/docs/license#replication-media-terms"
          className={proseLinkClassName}
        >
          licensing terms
        </Link>{" "}
        to correct a credit or request removal.
      </p>

      {viewerSlug ? (
        <ReplicationViewerOverlay
          collection={collection}
          initialSlug={viewerSlug}
          open
          onOpenChange={(nextOpen) => {
            if (!nextOpen) {
              setViewerSlug(null);
              dismissViewerDeepLinkCover();
            }
          }}
        />
      ) : null}
    </>
  );
}
