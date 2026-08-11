'use client';

import { memo, useMemo } from 'react';
import type { ReplicationWithUrl } from '@/types/replications';
import { GalleryMediaTile } from '../gallery/GalleryMediaTile';

interface ReplicationGalleryProps {
  galleryOrder?: string[];
  replications: ReplicationWithUrl[];
}

/**
 * The per-effect article gallery. Each tile links to the replication's own page,
 * where the full credit and licence live — the same tile and the same destination
 * as the cross-effect gallery, so a work reads identically wherever it is met.
 */
export const ReplicationGallery = memo(function ReplicationGallery({
  galleryOrder,
  replications,
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
      <div className="theme-public-card-subtle rounded-xl border px-4 py-3">
        <p className="theme-text-secondary text-sm leading-6">
          <strong className="theme-text-primary">Creator rights:</strong>{" "}
          replication media is credited to its creator when known. Rights remain
          with the original creator or rightsholder unless an individual item
          states another license.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-x-3 gap-y-5 sm:grid-cols-3 sm:gap-x-4 md:grid-cols-4">
        {sortedReplications.map((replication) => (
          <GalleryMediaTile
            key={replication._id}
            replication={replication}
            frameAspect="square"
            frameClassName="aspect-square w-full"
          />
        ))}
      </div>
    </div>
  );
});
