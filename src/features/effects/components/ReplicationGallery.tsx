'use client';

import { memo, useMemo, useState } from 'react';
import Lightbox, { type Slide } from 'yet-another-react-lightbox';
import Captions from 'yet-another-react-lightbox/plugins/captions';
import Counter from 'yet-another-react-lightbox/plugins/counter';
import Video from 'yet-another-react-lightbox/plugins/video';
import { MediaTile } from '@/components/layout/PublicFeedbackPrimitives';
import type { ReplicationWithUrl } from '@/types/replications';

const VIDEO_MIME_TYPES: Record<string, string> = {
  mp4: 'video/mp4',
  webm: 'video/webm',
  mov: 'video/quicktime',
  m4v: 'video/x-m4v',
  ogv: 'video/ogg',
};

const getMimeType = (format: string) => VIDEO_MIME_TYPES[format?.toLowerCase()] || `video/${format}`;

interface ReplicationGalleryProps {
  galleryOrder?: string[];
  replications: ReplicationWithUrl[];
}

export const ReplicationGallery = memo(function ReplicationGallery({
  galleryOrder,
  replications,
}: ReplicationGalleryProps) {
  const [activeIndex, setActiveIndex] = useState<number>(-1);

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

  const slides = useMemo<Slide[]>(
    () =>
      sortedReplications.map((replication) => {
        const sharedSlideProps = {
          width: replication.width,
          height: replication.height,
          title: replication.title,
          description: `by ${replication.artist}`,
        };

        if (replication.type === 'video') {
          return {
            type: 'video',
            poster: replication.thumbnail_url,
            sources: [
              {
                src: replication.url,
                type: getMimeType(replication.format),
              },
            ],
            ...sharedSlideProps,
          };
        }

        return {
          src: replication.url,
          alt: replication.title,
          ...sharedSlideProps,
        };
      }),
    [sortedReplications],
  );

  const activeReplication = activeIndex >= 0 ? sortedReplications[activeIndex] ?? null : null;
  const isLightboxOpen = activeIndex >= 0;

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
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 md:grid-cols-4">
        {sortedReplications.map((replication, index) => {
          const thumbnailUrl = replication.type === 'video' ? replication.thumbnail_url : replication.url;

          return (
            <MediaTile
              key={replication._id}
              mediaType={replication.type}
              title={replication.title}
              creator={replication.artist}
              thumbnailUrl={thumbnailUrl}
              width={replication.width}
              height={replication.height}
              onClick={() => openReplication(index)}
              ariaLabel={`Open replication: ${replication.title}`}
            />
          );
        })}
      </div>

      <Lightbox
        open={isLightboxOpen}
        close={closeLightbox}
        index={isLightboxOpen ? activeIndex : 0}
        slides={slides}
        plugins={[Captions, Counter, Video]}
        carousel={{
          finite: sortedReplications.length < 2,
          imageFit: 'contain',
        }}
        controller={{
          closeOnBackdropClick: true,
        }}
        captions={{
          showToggle: true,
          descriptionTextAlign: 'start',
          descriptionMaxLines: 2,
        }}
        counter={{
          container: {
            style: {
              top: 'unset',
              bottom: '20px',
              left: '20px',
            },
          },
        }}
        video={{
          autoPlay: true,
          controls: true,
          playsInline: true,
          preload: 'metadata',
        }}
        toolbar={{
          buttons: [
            activeReplication ? (
              <a
                key="open-original"
                href={activeReplication.url}
                target="_blank"
                rel="noreferrer"
                className="theme-public-card-subtle theme-public-card-hover-quiet rounded-full border px-3 py-1.5 text-sm font-medium transition"
              >
                Open original
              </a>
            ) : null,
            'close',
          ],
        }}
        on={{
          view: ({ index }) => setActiveIndex(index),
        }}
        styles={{
          container: {
            backdropFilter: 'blur(14px)',
            WebkitBackdropFilter: 'blur(14px)',
          },
        }}
      />
    </div>
  );
});
