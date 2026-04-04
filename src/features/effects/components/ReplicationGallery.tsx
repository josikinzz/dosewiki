'use client';

import { memo, useMemo, useState } from 'react';
import { Play } from 'lucide-react';
import Lightbox, { type Slide } from 'yet-another-react-lightbox';
import Captions from 'yet-another-react-lightbox/plugins/captions';
import Counter from 'yet-another-react-lightbox/plugins/counter';
import Video from 'yet-another-react-lightbox/plugins/video';
import { AppImage } from '@/components/common/AppImage';
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
            <button
              key={replication._id}
              type="button"
              onClick={() => openReplication(index)}
              className="group relative aspect-square overflow-hidden rounded-xl border border-white/10 bg-white/5 text-left transition hover:border-white/20 hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fuchsia-400"
              aria-label={`Open replication: ${replication.title}`}
            >
              {thumbnailUrl ? (
                <AppImage
                  src={thumbnailUrl}
                  alt={replication.title}
                  width={replication.width ?? 800}
                  height={replication.height ?? 800}
                  className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.02] group-hover:opacity-80"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-fuchsia-900/20 via-violet-900/20 to-sky-900/20 px-3 text-center">
                  <div>
                    <Play className="mx-auto mb-2 h-10 w-10 text-fuchsia-300/70" />
                    <p className="line-clamp-2 text-sm font-medium text-white/85">{replication.title}</p>
                    <p className="mt-1 text-xs text-white/50">by {replication.artist}</p>
                  </div>
                </div>
              )}

              <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/35 to-transparent px-3 py-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-white">{replication.title}</p>
                    <p className="truncate text-xs text-white/60">by {replication.artist}</p>
                  </div>
                  {replication.type === 'video' ? (
                    <span className="rounded-full bg-black/45 p-2 text-white/85">
                      <Play className="h-3.5 w-3.5 fill-current" />
                    </span>
                  ) : null}
                </div>
              </div>
            </button>
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
                className="rounded-full border border-white/15 backdrop-blur-sm bg-white/[0.04] px-3 py-1.5 text-sm font-medium text-white/80 transition hover:border-white/30 hover:bg-white/10 hover:text-white"
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
