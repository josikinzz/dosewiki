'use client';

import { memo, useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import { MediaTile } from '@/components/layout/PublicFeedbackPrimitives';
import type { ReplicationWithUrl } from '@/types/replications';
import { getCreatorLabel } from './replicationCredit';

// Defer the YARL modal viewer (and its CSS) to a lazy client chunk so it loads
// only when a thumbnail is first clicked. The grid above renders eagerly.
const ReplicationLightbox = dynamic(
  () => import('./ReplicationLightbox').then((mod) => mod.ReplicationLightbox),
  { ssr: false },
);

interface ReplicationGalleryProps {
  galleryOrder?: string[];
  replications: ReplicationWithUrl[];
}

export const ReplicationGallery = memo(function ReplicationGallery({
  galleryOrder,
  replications,
}: ReplicationGalleryProps) {
  const [activeIndex, setActiveIndex] = useState<number>(-1);
  // Latch: once the lightbox has ever been opened, keep it mounted so YARL's
  // own open/close transitions keep working after the user closes it.
  const [hasOpened, setHasOpened] = useState(false);

  useEffect(() => {
    if (activeIndex >= 0) {
      setHasOpened(true);
    }
  }, [activeIndex]);

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

  const openReplication = (index: number) => {
    setActiveIndex(index);
  };

  const closeLightbox = () => {
    setActiveIndex(-1);
  };

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

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 md:grid-cols-4">
        {sortedReplications.map((replication, index) => {
          const thumbnailUrl = replication.type === 'video' ? replication.thumbnail_url : replication.url;

          return (
            <MediaTile
              key={replication._id}
              mediaType={replication.type}
              title={replication.title}
              creator={getCreatorLabel(replication)}
              thumbnailUrl={thumbnailUrl}
              width={replication.width}
              height={replication.height}
              onClick={() => openReplication(index)}
              ariaLabel={`Open replication: ${replication.title}`}
            />
          );
        })}
      </div>

      {hasOpened ? (
        <ReplicationLightbox
          replications={sortedReplications}
          index={activeIndex}
          onIndexChange={setActiveIndex}
          onClose={closeLightbox}
        />
      ) : null}
    </div>
  );
});
