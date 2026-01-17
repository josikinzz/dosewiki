'use client';

import { useEffect, useRef, useMemo } from 'react';
import { useQuery } from 'convex/react';
import LightGallery from 'lightgallery';
import lgThumbnail from 'lightgallery/plugins/thumbnail';
import lgZoom from 'lightgallery/plugins/zoom';
import lgVideo from 'lightgallery/plugins/video';
import { api } from '../../../convex/_generated/api';
import { type ReplicationWithUrl } from '../../types/replications';
import 'lightgallery/css/lightgallery.css';
import 'lightgallery/css/lg-thumbnail.css';
import 'lightgallery/css/lg-zoom.css';

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
export function ReplicationGallery({ effectSlug, galleryOrder }: ReplicationGalleryProps) {
  const lightGalleryRef = useRef<HTMLDivElement>(null);
  const lgInstanceRef = useRef<any>(null);

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

    // Destroy previous instance if it exists
    if (lgInstanceRef.current) {
      lgInstanceRef.current.destroy();
    }

    // Initialize new instance
    try {
      lgInstanceRef.current = LightGallery(lightGalleryRef.current, {
        plugins: [lgThumbnail, lgZoom, lgVideo],
        speed: 500,
        elementClassNames: 'replication-item',
        loadYoutubeThumbnail: false,
        preload: 2,
        subHtmlFontSize: '14px',
        thumbWidth: 80,
        thumbHeight: 80,
        thumbContmargin: 5,
        thumbMargin: 5,
      });
    } catch (error) {
      console.error('Error initializing Lightgallery:', error);
    }

    return () => {
      if (lgInstanceRef.current) {
        try {
          lgInstanceRef.current.destroy();
        } catch (error) {
          console.error('Error destroying Lightgallery:', error);
        }
      }
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

          // For videos, use lightgallery's video player
          if (rep.type === 'video') {
            return (
              <a
                key={rep._id}
                href={rep.url}
                className="replication-item group relative overflow-hidden rounded-lg bg-white/5 hover:bg-white/10 transition-colors cursor-pointer aspect-square"
                data-src={rep.url}
                data-sub-html={caption}
                data-lg-size={rep.width && rep.height ? `${rep.width}-${rep.height}` : undefined}
                data-video={JSON.stringify({
                  source: [
                    {
                      src: rep.url,
                      type: `video/${rep.format}`,
                    },
                  ],
                  attributes: {
                    preload: false,
                    controlsList: 'nodownload',
                    disablePictureInPicture: true,
                  },
                })}
              >
                {thumbnailUrl && (
                  <img
                    src={thumbnailUrl}
                    alt={rep.title}
                    className="w-full h-full object-cover group-hover:opacity-75 transition-opacity"
                    loading="lazy"
                  />
                )}
                {!thumbnailUrl && (
                  <div className="w-full h-full flex items-center justify-center">
                    <div className="text-center px-2">
                      <svg
                        className="w-8 h-8 mx-auto mb-1 text-white/40"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"
                        />
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                        />
                      </svg>
                      <p className="text-xs text-white/40">Video</p>
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
              <img
                src={rep.url}
                alt={rep.title}
                className="w-full h-full object-cover group-hover:opacity-75 transition-opacity"
                loading="lazy"
              />
            </a>
          );
        })}
      </div>

      <style>{`
        .lg-outer.replication-gallery {
          --lg-backdrop-color: rgba(0, 0, 0, 0.85);
        }

        .lg-backdrop.replication-gallery {
          background-color: rgba(0, 0, 0, 0.85);
          backdrop-filter: blur(4px);
        }

        .lg-sub-html {
          background: rgba(0, 0, 0, 0.6);
          color: white;
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
          background: #000;
        }

        .lg-video-wrap {
          background: #000;
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
          border-color: #fff;
        }

        .lg-thumb-item:hover {
          border-color: rgba(255, 255, 255, 0.5);
        }

        /* Mobile-specific styles */
        @media (max-width: 640px) {
          .lg-toolbar {
            top: auto;
            bottom: 0;
            background: linear-gradient(180deg, transparent 0%, rgba(0, 0, 0, 0.8) 100%);
          }

          .lg-sub-html {
            padding: 10px 12px;
            font-size: 12px;
          }
        }
      `}</style>
    </div>
  );
}
