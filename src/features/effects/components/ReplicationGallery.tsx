'use client';

import Link from 'next/link';
import { memo, useMemo } from 'react';
import { proseLinkClassName } from '@/components/common/ProseLink';
import type { ReplicationWithUrl } from '@/types/replications';
import { GalleryMediaTile } from '../gallery/GalleryMediaTile';

interface ReplicationGalleryProps {
  galleryOrder?: string[];
  replications: ReplicationWithUrl[];
  /**
   * The owning effect article's slug. Tiles append `?set=effect:<slug>` so
   * the viewer walks *this effect's* playlist — the works the reader can see
   * around the one they tapped. Optional because the article editor's
   * placeholder preview renders the same gallery with no effect behind it.
   */
  effectSlug?: string;
}

/**
 * The per-effect article gallery. Each tile links to the replication's own page,
 * scoped to this effect's walk — the same tile and the same destination as the
 * cross-effect gallery, so a work reads identically wherever it is met.
 */
export const ReplicationGallery = memo(function ReplicationGallery({
  galleryOrder,
  replications,
  effectSlug,
}: ReplicationGalleryProps) {
  const sortedReplications = useMemo(() => {
    if (!replications) {
      return [];
    }

    if (galleryOrder && galleryOrder.length > 0) {
      const orderMap = new Map(galleryOrder.map((slug, index) => [slug, index]));
      return [...replications].sort((a, b) => {
        const aIndex = orderMap.get(a.slug) ?? Number.POSITIVE_INFINITY;
        const bIndex = orderMap.get(b.slug) ?? Number.POSITIVE_INFINITY;
        return aIndex - bIndex;
      });
    }

    return replications;
  }, [replications, galleryOrder]);

  if (sortedReplications.length === 0) {
    return null;
  }

  return (
    <div className="w-full space-y-4">
      {/* One quiet sentence; the full rights matrix lives on the licence page,
          so repeating the gallery footnote verbatim here only added noise. */}
      <p className="theme-text-muted text-xs leading-5">
        Replication media is credited to its creator; rights remain with the
        rightsholder — see the{" "}
        <Link href="/docs/license#replication-media-terms" className={proseLinkClassName}>
          licensing terms
        </Link>{" "}
        to correct a credit or request removal.
      </p>

      <div className="grid grid-cols-2 gap-x-3 gap-y-5 sm:grid-cols-3 sm:gap-x-4 md:grid-cols-4">
        {sortedReplications.map((replication) => (
          <GalleryMediaTile
            key={replication._id}
            replication={replication}
            frameAspect="square"
            frameClassName="aspect-square w-full"
            setParam={effectSlug ? { kind: 'effect', slug: effectSlug } : null}
          />
        ))}
      </div>
    </div>
  );
});
