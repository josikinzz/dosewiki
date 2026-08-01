'use client';

import { useEffect, useRef, useState } from 'react';
import { AppImage } from '@/components/common/AppImage';
import { Icon } from '@/components/common/Icon';
import { MediaPlaceholder } from '@/components/layout/PublicFeedbackPrimitives';
import { cn } from '@/lib/utils';
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
  onOpen: () => void;
  /** Sizing/context classes from the parent layout (masonry vs rail). */
  className?: string;
}

export function GalleryMediaTile({ replication, onOpen, className }: GalleryMediaTileProps) {
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
    <button
      type="button"
      onClick={onOpen}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setHovered(true)}
      onBlur={() => setHovered(false)}
      aria-label={`Open ${isVideo ? 'video' : 'image'}: ${replication.title}`}
      style={{ aspectRatio: ratio }}
      className={cn(
        'group relative block overflow-hidden rounded-xl border text-left',
        'border-[color:var(--theme-border-subtle)] bg-[var(--theme-surface-strong)]',
        'transition duration-300 hover:border-[color:var(--theme-card-border-strong)]',
        'hover:-translate-y-0.5 hover:shadow-[var(--theme-elevation-tile-hover)]',
        'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--theme-accent-strong)]',
        'motion-reduce:transition-none motion-reduce:hover:translate-y-0',
        className,
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
            'group-hover:scale-[1.03]',
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

      {isVideo ? (
        <span
          className={cn(
            'absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full',
            'bg-[var(--theme-overlay-strong,rgba(8,4,16,0.62))] text-white backdrop-blur-sm',
            'transition-opacity duration-300',
            showPreview ? 'opacity-0' : 'opacity-90',
          )}
          aria-hidden
        >
          <Icon icon="lucide:play" className="h-3.5 w-3.5 translate-x-px fill-current" />
        </span>
      ) : null}

      <div className="pointer-events-none absolute inset-x-0 bottom-0 translate-y-1.5 bg-gradient-to-t from-black/85 via-black/35 to-transparent px-3 pb-2 pt-6 opacity-0 transition duration-300 group-hover:translate-y-0 group-hover:opacity-100 motion-reduce:translate-y-0">
        <p className="truncate text-sm font-medium text-white">{replication.title}</p>
        <p className="truncate text-xs text-white/70">{byline}</p>
      </div>
    </button>
  );
}
