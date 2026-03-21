'use client';

import { memo, useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Play, X } from 'lucide-react';
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
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

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

  const activeReplication = activeIndex === null ? null : sortedReplications[activeIndex] ?? null;

  useEffect(() => {
    if (activeIndex !== null && activeIndex >= sortedReplications.length) {
      setActiveIndex(sortedReplications.length > 0 ? sortedReplications.length - 1 : null);
    }
  }, [activeIndex, sortedReplications.length]);

  useEffect(() => {
    if (activeReplication === null) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setActiveIndex(null);
        return;
      }

      if (sortedReplications.length < 2) {
        return;
      }

      if (event.key === 'ArrowLeft') {
        setActiveIndex((current) => {
          if (current === null) {
            return current;
          }

          return (current - 1 + sortedReplications.length) % sortedReplications.length;
        });
      }

      if (event.key === 'ArrowRight') {
        setActiveIndex((current) => {
          if (current === null) {
            return current;
          }

          return (current + 1) % sortedReplications.length;
        });
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [activeReplication, sortedReplications.length]);

  if (sortedReplications.length === 0) {
    return null;
  }

  const openReplication = (index: number) => {
    setActiveIndex(index);
  };

  const closeLightbox = () => {
    setActiveIndex(null);
  };

  const showPrevious = () => {
    setActiveIndex((current) => {
      if (current === null) {
        return current;
      }

      return (current - 1 + sortedReplications.length) % sortedReplications.length;
    });
  };

  const showNext = () => {
    setActiveIndex((current) => {
      if (current === null) {
        return current;
      }

      return (current + 1) % sortedReplications.length;
    });
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

      {activeReplication ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={activeReplication.title}
          className="fixed inset-0 z-[80] flex items-center justify-center bg-black/85 p-4 backdrop-blur-sm"
        >
          <button
            type="button"
            aria-label="Close replication viewer"
            className="absolute inset-0 cursor-default"
            onClick={closeLightbox}
          />
          <div
            className="relative w-full max-w-6xl overflow-hidden rounded-[28px] border border-white/10 bg-[color:var(--theme-page-end)] shadow-2xl"
          >
            <button
              type="button"
              onClick={closeLightbox}
              className="absolute right-4 top-4 z-10 rounded-full border border-white/10 bg-black/40 p-2 text-white/80 transition hover:bg-black/60 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fuchsia-400"
              aria-label="Close replication viewer"
            >
              <X className="h-5 w-5" />
            </button>

            {sortedReplications.length > 1 ? (
              <>
                <button
                  type="button"
                  onClick={showPrevious}
                  className="absolute left-4 top-1/2 z-10 -translate-y-1/2 rounded-full border border-white/10 bg-black/40 p-2 text-white/80 transition hover:bg-black/60 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fuchsia-400"
                  aria-label="Previous replication"
                >
                  <ChevronLeft className="h-5 w-5" />
                </button>
                <button
                  type="button"
                  onClick={showNext}
                  className="absolute right-4 top-1/2 z-10 -translate-y-1/2 rounded-full border border-white/10 bg-black/40 p-2 text-white/80 transition hover:bg-black/60 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fuchsia-400"
                  aria-label="Next replication"
                >
                  <ChevronRight className="h-5 w-5" />
                </button>
              </>
            ) : null}

            <div className="flex max-h-[85vh] min-h-[24rem] items-center justify-center bg-black/30 px-4 py-16 sm:px-8">
              {activeReplication.type === 'video' ? (
                <video
                  controls
                  playsInline
                  preload="metadata"
                  autoPlay
                  className="max-h-[70vh] w-full rounded-2xl bg-black"
                >
                  <source src={activeReplication.url} type={getMimeType(activeReplication.format)} />
                  <track kind="captions" />
                </video>
              ) : (
                <AppImage
                  src={activeReplication.url}
                  alt={activeReplication.title}
                  width={activeReplication.width ?? 1400}
                  height={activeReplication.height ?? 1400}
                  className="max-h-[70vh] w-auto rounded-2xl object-contain"
                />
              )}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/10 bg-black/20 px-5 py-4">
              <div className="min-w-0">
                <p className="truncate text-base font-semibold text-white">{activeReplication.title}</p>
                <p className="truncate text-sm text-white/60">by {activeReplication.artist}</p>
              </div>
              <div className="flex items-center gap-3 text-sm text-white/55">
                <span>
                  {activeIndex !== null ? activeIndex + 1 : 1} / {sortedReplications.length}
                </span>
                <a
                  href={activeReplication.url}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-full border border-white/10 px-3 py-1.5 text-white/75 transition hover:border-white/20 hover:bg-white/5 hover:text-white"
                >
                  Open original
                </a>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
});
