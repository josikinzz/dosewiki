'use client';

import { memo, useEffect, useRef, useMemo } from 'react';
import { useQuery } from 'convex/react';
import LightGallery from 'lightgallery';
import lgThumbnail from 'lightgallery/plugins/thumbnail';
import lgVideo from 'lightgallery/plugins/video';
import { AppImage } from '@/components/common/AppImage';
import { api } from "../../../../convex/_generated/api";
import 'lightgallery/css/lightgallery.css';
import 'lightgallery/css/lg-thumbnail.css';
import 'lightgallery/css/lg-video.css';

/** MIME type mapping for video formats */
const VIDEO_MIME_TYPES: Record<string, string> = {
  'mp4': 'video/mp4',
  'webm': 'video/webm',
  'mov': 'video/quicktime',
  'm4v': 'video/x-m4v',
  'ogv': 'video/ogg',
};

const getMimeType = (format: string) =>
  VIDEO_MIME_TYPES[format?.toLowerCase()] || `video/${format}`;

interface ReplicationGalleryProps {
  effectSlug: string;
  galleryOrder?: string[];
}

/**
 * ReplicationGallery component for displaying videos and images of effects.
 *
 * Features:
 * - Lightgallery integration with video/image support
 * - Artist attribution in captions
 * - Custom gallery ordering via gallery_order field
 * - Responsive thumbnails with lazy loading
 * - Keyboard navigation and accessibility
 */
export const ReplicationGallery = memo(function ReplicationGallery({ effectSlug, galleryOrder }: ReplicationGalleryProps) {
  const lightGalleryRef = useRef<HTMLDivElement>(null);
  const lgInstanceRef = useRef<ReturnType<typeof LightGallery> | null>(null);

  // Fetch replications for this effect
  const replications = useQuery(api.replications.getReplicationsByEffect, {
    effect_slug: effectSlug,
  });

  // Sort replications according to gallery_order if provided
  const sortedReplications = useMemo(() => {
    if (!replications) return [];

    if (galleryOrder && galleryOrder.length > 0) {
      const orderMap = new Map(galleryOrder.map((slug, index) => [slug, index]));
      return [...replications].sort((a, b) => {
        const aIndex = orderMap.get(a.slug) ?? Infinity;
        const bIndex = orderMap.get(b.slug) ?? Infinity;
        return aIndex - bIndex;
      });
    }

    return replications;
  }, [replications, galleryOrder]);

  // Initialize Lightgallery
  useEffect(() => {
    if (!lightGalleryRef.current || !sortedReplications || sortedReplications.length === 0) {
      return;
    }

    // Capture ref value for cleanup
    const galleryElement = lightGalleryRef.current;

    // Destroy previous instance if it exists
    if (lgInstanceRef.current) {
      try {
        lgInstanceRef.current.destroy();
      } catch {
        // Ignore errors during cleanup of previous instance
      }
      lgInstanceRef.current = null;
    }

    // Initialize new instance
    try {
      lgInstanceRef.current = LightGallery(galleryElement, {
        plugins: [lgThumbnail, lgVideo],
        speed: 500,
        loadYouTubeThumbnail: false,
        preload: 2,
        subHtmlFontSize: '14px',
        thumbWidth: 80,
        thumbHeight: '80px',
        thumbContmargin: 5,
        thumbMargin: 5,
      } as unknown as Parameters<typeof LightGallery>[1]);
    } catch (error) {
      console.error('Error initializing Lightgallery:', error);
    }

    return () => {
      // Only destroy if the gallery element is still in the DOM
      if (lgInstanceRef.current && galleryElement && document.body.contains(galleryElement)) {
        try {
          lgInstanceRef.current.destroy();
        } catch {
          // Ignore errors - element may already be removed
        }
      }
      lgInstanceRef.current = null;
    };
  }, [sortedReplications]);

  if (!replications) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-white/40"></div>
          <p className="mt-2 text-sm text-white/50">Loading replications...</p>
        </div>
      </div>
    );
  }

  if (sortedReplications.length === 0) {
    return null;
  }

  return (
    <div className="w-full">
      <div
        ref={lightGalleryRef}
        className="replication-gallery grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 sm:gap-4"
      >
        {sortedReplications.map((rep) => {
          const caption = `<h4 class="text-sm font-medium">${rep.title}</h4><p class="text-xs text-gray-400">by ${rep.artist}</p>`;
          const thumbnailUrl = rep.type === 'video' ? rep.thumbnail_url : rep.url;

          // For videos, use LightGallery video plugin
          if (rep.type === 'video') {
            // Skip videos without URLs
            if (!rep.url) {
              return null;
            }

            // LightGallery video plugin expects this JSON format
            const videoData = JSON.stringify({
              source: [{ src: rep.url, type: getMimeType(rep.format) }],
              attributes: { preload: 'none', controls: true, playsinline: true },
            });

            return (
              <a
                key={rep._id}
                href={rep.url}
                className="replication-item group relative overflow-hidden rounded-lg bg-white/5 hover:bg-white/10 transition-colors cursor-pointer aspect-square"
                data-video={videoData}
                data-poster={thumbnailUrl || ''}
                data-sub-html={caption}
              >
                {thumbnailUrl && (
                  <AppImage
                    src={thumbnailUrl}
                    alt={rep.title}
                    width={rep.width ?? 800}
                    height={rep.height ?? 800}
                    className="w-full h-full object-cover group-hover:opacity-75 transition-opacity"
                  />
                )}
                {!thumbnailUrl && (
                  <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-fuchsia-900/20 to-violet-900/20">
                    <div className="text-center px-2">
                      <svg
                        className="w-10 h-10 mx-auto mb-2 text-fuchsia-400/60"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={1.5}
                          d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"
                        />
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={1.5}
                          d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                        />
                      </svg>
                      <p className="text-xs text-white/70 font-medium truncate max-w-[90%] mx-auto">{rep.title}</p>
                      <p className="text-[10px] text-white/40 mt-0.5">by {rep.artist}</p>
                    </div>
                  </div>
                )}
              </a>
            );
          }

          // For images
          return (
            <a
              key={rep._id}
              href={rep.url}
              className="replication-item group relative overflow-hidden rounded-lg bg-white/5 hover:bg-white/10 transition-colors cursor-pointer aspect-square"
              data-src={rep.url}
              data-sub-html={caption}
              data-lg-size={rep.width && rep.height ? `${rep.width}-${rep.height}` : undefined}
            >
              <AppImage
                src={rep.url}
                alt={rep.title}
                width={rep.width ?? 800}
                height={rep.height ?? 800}
                className="w-full h-full object-cover group-hover:opacity-75 transition-opacity"
              />
            </a>
          );
        })}
      </div>

      <style>{`
        .lg-outer.replication-gallery {
          --lg-backdrop-color: color-mix(in srgb, var(--theme-page-end) 86%, black 14%);
        }

        .lg-backdrop.replication-gallery {
          background-color: color-mix(in srgb, var(--theme-page-end) 86%, black 14%);
          backdrop-filter: blur(4px);
        }

        .lg-sub-html {
          background: color-mix(in srgb, var(--theme-page-end) 72%, transparent);
          color: var(--theme-text-primary);
          padding: 12px 16px;
        }

        .lg-sub-html h4 {
          margin: 0;
          font-weight: 500;
          line-height: 1.4;
        }

        .lg-sub-html p {
          margin: 4px 0 0 0;
          line-height: 1.4;
        }

        .lg-img-wrap {
          background: var(--theme-page-end);
        }

        .lg-video-wrap {
          background: var(--theme-page-end);
        }

        .lg-video-cont {
          padding: 20px;
        }

        .lg-video-cont video {
          max-width: 90vw;
          max-height: 90vh;
        }

        .lg-thumb-item {
          border: 2px solid transparent;
          transition: border-color 0.2s;
        }

        .lg-thumb-item.active {
          border-color: var(--theme-text-primary);
        }

        .lg-thumb-item:hover {
          border-color: color-mix(in srgb, var(--theme-text-primary) 45%, transparent);
        }

        /* Mobile-specific styles */
        @media (max-width: 640px) {
          .lg-toolbar {
            top: auto;
            bottom: 0;
            background: linear-gradient(180deg, transparent 0%, color-mix(in srgb, var(--theme-page-end) 80%, black 20%) 100%);
          }

          .lg-sub-html {
            padding: 10px 12px;
            font-size: 12px;
          }
        }
      `}</style>
    </div>
  );
});
