'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { AppImage } from '@/components/common/AppImage';
import { Icon } from '@/components/common/Icon';
import { MediaPlaceholder } from '@/components/layout/PublicFeedbackPrimitives';
import { cn } from '@/lib/utils';
import { publicHref } from '@/utils/publicHref';
import type { GalleryReplication } from '@/types/replications';
import { getCreatorByline } from '../components/replicationCredit';

/**
 * True when the device has a real hover-capable, fine pointer (desktop mouse).
 * Gates hover-to-play so touch devices never autoload video on tap.
 */
function useHoverPreviewAllowed(): boolean {
  const [allowed, setAllowed] = useState(false);
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const pointer = window.matchMedia('(hover: hover) and (pointer: fine)');
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setAllowed(pointer.matches && !motion.matches);
    update();
    pointer.addEventListener('change', update);
    motion.addEventListener('change', update);
    return () => {
      pointer.removeEventListener('change', update);
      motion.removeEventListener('change', update);
    };
  }, []);
  return allowed;
}

interface GalleryMediaTileProps {
  replication: GalleryReplication;
  /** Layout classes for the whole tile (flow, snap, break-inside). */
  className?: string;
  /** Sizing classes for the media frame itself (height in rails, width in masonry). */
  frameClassName?: string;
  /**
   * `natural` keeps the work's own proportions (masonry, rails). `square`
   * hands the ratio to `frameClassName` so a uniform grid stays uniform.
   */
  frameAspect?: 'natural' | 'square';
}

/**
 * A gallery tile: framed media with its title and credit *underneath*.
 *
 * Nothing is drawn over the artwork. The previous hover-gradient caption made
 * attribution unreachable on touch and put white text over unpredictable image
 * content; a real caption row is legible on every device and in both themes.
 *
 * The tile is an anchor, not a button, so each work can be linked, opened in a
 * new tab, and crawled.
 */
export function GalleryMediaTile({
  replication,
  className,
  frameClassName,
  frameAspect = 'natural',
}: GalleryMediaTileProps) {
  const hoverPreviewAllowed = useHoverPreviewAllowed();
  const [hovered, setHovered] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const isVideo = replication.type === 'video';
  const thumbnailUrl = isVideo ? replication.thumbnail_url : replication.url;
  const byline = getCreatorByline(replication);
  const ratio =
    replication.width && replication.height
      ? `${replication.width} / ${replication.height}`
      : '4 / 3';

  const showPreview = isVideo && hoverPreviewAllowed && hovered && Boolean(replication.url);

  useEffect(() => {
    if (showPreview && videoRef.current) {
      videoRef.current.currentTime = 0;
      void videoRef.current.play().catch(() => {});
    }
  }, [showPreview]);

  return (
    <figure className={cn('min-w-0', className)}>
      <Link
        href={publicHref.replication(replication.slug)}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        onFocus={() => setHovered(true)}
        onBlur={() => setHovered(false)}
        style={frameAspect === 'natural' ? { aspectRatio: ratio } : undefined}
        className={cn(
          // Scoped to the frame, not the whole figure, so hovering the caption
          // text below does not zoom the artwork.
          'group/frame relative block overflow-hidden rounded-xl border',
          'border-[color:var(--theme-border-subtle)] bg-[var(--theme-surface-strong)]',
          'transition duration-300 hover:border-[color:var(--theme-card-border-strong)]',
          'hover:-translate-y-0.5 hover:shadow-[var(--theme-elevation-tile-hover)]',
          'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--theme-accent-strong)]',
          'motion-reduce:transition-none motion-reduce:hover:translate-y-0',
          frameClassName,
        )}
      >
        {thumbnailUrl ? (
          <AppImage
            src={thumbnailUrl}
            alt={replication.title}
            width={replication.width ?? 800}
            height={replication.height ?? 800}
            className={cn(
              'absolute inset-0 h-full w-full object-cover transition duration-500',
              'group-hover/frame:scale-[1.03] motion-reduce:transition-none motion-reduce:group-hover/frame:scale-100',
              showPreview ? 'opacity-0' : 'opacity-100',
            )}
          />
        ) : (
          <MediaPlaceholder
            icon={isVideo ? 'lucide:play' : 'lucide:image'}
            title={replication.title}
          />
        )}

        {showPreview ? (
          <video
            ref={videoRef}
            src={replication.url}
            poster={replication.thumbnail_url}
            muted
            loop
            playsInline
            preload="none"
            className="absolute inset-0 h-full w-full object-cover"
          />
        ) : null}
      </Link>

      <figcaption className="mt-2 min-w-0 px-0.5">
        <p className="theme-text-secondary truncate text-sm font-medium">
          {isVideo ? (
            <Icon
              icon="lucide:play"
              className="theme-text-faint mr-1.5 inline-block h-3 w-3 align-[-0.1em] fill-current"
              aria-label="Video"
            />
          ) : null}
          {replication.title}
        </p>
        <p className="theme-text-faint truncate text-xs">{byline}</p>
      </figcaption>
    </figure>
  );
}
