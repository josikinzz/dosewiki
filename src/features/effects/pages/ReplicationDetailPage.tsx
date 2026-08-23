import Link from "next/link";

import { AppImage } from "@/components/common/AppImage";
import { Icon } from "@/components/common/Icon";
import { proseLinkClassName } from "@/components/common/ProseLink";
import { PublicContentShell } from "@/components/layout/PublicPagePrimitives";
import { MediaPlaceholder } from "@/components/layout/PublicFeedbackPrimitives";
import { Button } from "@/components/ui/button";
import { buildReplicationViewerUrl } from "@/features/replications/galleryUrlState";
import { ViewerMetadata } from "@/features/replications/viewer/ViewerMetadata";
import type { ReplicationViewerItem } from "@/features/replications/viewer/viewerModel";
import type { ReplicationWithUrl } from "@/types/replications";
import { publicHref } from "@/utils/publicHref";
import type { EffectCategoryLink } from "./replicationSubject";

export interface ReplicationDetailPageProps {
  replication: ReplicationWithUrl;
  effectName: string | null;
  effectSlug: string | null;
  artistProfileHref: string | null;
  avatarUrl: string | null;
  effectCategories: EffectCategoryLink[];
}

/**
 * Stable provenance page for one work. Playback and collection exploration
 * belong exclusively to the canonical overlay on the linked source page.
 */
export function ReplicationDetailPage({
  replication,
  effectName,
  effectSlug,
  artistProfileHref,
  avatarUrl,
  effectCategories,
}: ReplicationDetailPageProps) {
  const item: ReplicationViewerItem = {
    replication,
    effectName,
    effectSlug,
    effectCategories,
    artistProfileHref,
    avatarUrl,
  };
  const collectionPath = effectSlug
    ? publicHref.effect(effectSlug)
    : publicHref.replications();
  const viewerHref = buildReplicationViewerUrl(
    collectionPath,
    replication.slug,
  );
  const previewSource =
    replication.type === "video" ? replication.thumbnail_url : replication.url;
  const artistName = replication.artist?.trim() || "Unattributed";

  return (
    <PublicContentShell focusTarget>
      <Link href={publicHref.replications()} className={proseLinkClassName}>
        <Icon
          icon="lucide:arrow-left"
          className="mr-1 inline-block h-4 w-4"
          aria-hidden
        />
        Replications
      </Link>

      <header className="mt-6">
        <h1 className="theme-text-primary font-display text-3xl font-semibold tracking-tight sm:text-4xl">
          {replication.title}
        </h1>
        <p className="theme-text-muted mt-2 text-sm">
          {artistProfileHref ? (
            <Link href={artistProfileHref} className={proseLinkClassName}>
              {artistName}
            </Link>
          ) : (
            artistName
          )}
        </p>
      </header>

      <div className="theme-media-thumbnail-border mt-6 overflow-hidden rounded-2xl border bg-black">
        {previewSource ? (
          <AppImage
            src={previewSource}
            alt={replication.title}
            width={replication.width ?? 1600}
            height={replication.height ?? 900}
            priority
            className="max-h-[70vh] w-full object-contain"
          />
        ) : (
          <MediaPlaceholder
            kind="empty"
            title="Preview unavailable"
            description="Open the viewer to load the original media."
            className="aspect-video"
          />
        )}
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <Button asChild>
          <Link href={viewerHref}>
            <Icon icon="lucide:maximize-2" className="h-4 w-4" aria-hidden />
            Open in {effectName ? `${effectName} replications` : "viewer"}
          </Link>
        </Button>
        {replication.type === "video" ? (
          <span className="theme-text-muted text-sm">
            Video playback opens in the shared viewer.
          </span>
        ) : null}
      </div>

      <div className="mt-8">
        <ViewerMetadata item={item} />
      </div>
    </PublicContentShell>
  );
}
