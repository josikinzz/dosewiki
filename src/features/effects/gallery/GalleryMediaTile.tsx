'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { AppImage } from '@/components/common/AppImage';
import { Icon } from '@/components/common/Icon';
import { MediaPlaceholder } from '@/components/layout/PublicFeedbackPrimitives';
import { cn } from '@/lib/utils';
import { publicHref } from '@/utils/publicHref';
import type { PublicGalleryReplicationPreview } from '@/types/replications';
import { getCreatorByline } from '../components/replicationCredit';
import { useInView, useMotionAllowed, usePlaybackSlot } from './inViewPlayback';

/** `duration` in seconds as `m:ss`, or null when unusable. */
function formatVideoDuration(seconds: number | undefined): string | null {
  if (seconds === undefined || !Number.isFinite(seconds) || seconds <= 0) return null;
  const total = Math.round(seconds);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

interface GalleryMediaTileProps {
  replication: PublicGalleryReplicationPreview;
  /** Layout classes for the whole tile (flow, snap, break-inside). */
  className?: string;
  /** Sizing classes for the media frame itself (height in rails, width in masonry). */
  frameClassName?: string;
  /**
   * `natural` keeps the work's own proportions (masonry, rails). `square`
   * hands the ratio to `frameClassName` so a uniform grid stays uniform.
   */
  frameAspect?: 'natural' | 'square';
  /**
   * Phones open works in the fullscreen deck instead of navigating, so the
   * tile takes an optional click interceptor. The handler decides whether to
   * `preventDefault()`; the tile stays a real anchor either way so every work
   * remains crawlable and cmd/middle-clickable into a new tab.
   */
  onOpen?: (event: React.MouseEvent, replication: PublicGalleryReplicationPreview) => void;
  /** Omit the creator byline under the title (artist rails already name the artist once, above). */
  showByline?: boolean;
  /**
   * Hide the whole caption below `md`: phone rails and masonry read as pure
   * media, and the deck (where taps land anyway) carries title and credit.
   */
  mobileCompact?: boolean;
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
  onOpen,
  showByline = true,
  mobileCompact = false,
}: GalleryMediaTileProps) {
  const { autoplay: autoplayAllowed, hoverPreview: hoverPreviewAllowed } = useMotionAllowed();
  const [hovered, setHovered] = useState(false);
  const [playing, setPlaying] = useState(false);
  const frameRef = useRef<HTMLAnchorElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const isVideo = replication.type === 'video';
  const thumbnailUrl = isVideo ? replication.thumbnail_url : replication.url;
  const byline = getCreatorByline(replication);
  const ratio =
    replication.width && replication.height
      ? `${replication.width} / ${replication.height}`
      : '4 / 3';

  // Two mutually exclusive playback paths. Rows with a preview rendition
  // autoplay it while at least half in view (muted, low-res, capped at five
  // concurrent players); rows without one keep the legacy hover-to-play of
  // the full source. The autoplay path always wins when a preview exists so
  // hover and in-view playback never fight over the same <video>.
  const previewUrl = isVideo ? replication.preview_url : undefined;
  const autoplayEligible = Boolean(previewUrl) && autoplayAllowed;
  const inView = useInView(frameRef, 0.5, autoplayEligible);
  // Hover refreshes the claim, so the tile under the pointer wins a slot back
  // even after being revoked by five fresher tiles.
  const slotGranted = usePlaybackSlot(autoplayEligible && inView, hovered);
  const showAutoplay = autoplayEligible && inView && slotGranted;

  const showHoverPreview =
    isVideo && !previewUrl && hoverPreviewAllowed && hovered && Boolean(replication.url);
  const showPreview = showAutoplay || showHoverPreview;

  useEffect(() => {
    if (showPreview && videoRef.current) {
      videoRef.current.currentTime = 0;
      void videoRef.current.play().catch(() => {});
    }
    if (!showPreview) setPlaying(false);
  }, [showPreview]);

  const durationLabel = isVideo ? formatVideoDuration(replication.duration) : null;

  return (
    <figure className={cn('min-w-0', className)}>
      <Link
        ref={frameRef}
        href={publicHref.replication(replication.slug)}
        onClick={onOpen ? (event) => onOpen(event, replication) : undefined}
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
            src={showAutoplay ? previewUrl : replication.url}
            poster={replication.thumbnail_url}
            muted
            loop
            playsInline
            preload={showAutoplay ? 'metadata' : 'none'}
            onPlaying={() => setPlaying(true)}
            onPause={() => setPlaying(false)}
            // The preview covers the whole anchor and paints last, so without this
            // it swallows every click on a video tile. Browsers do not forward a
            // media element's click to an ancestor link the way they do for images.
            className="pointer-events-none absolute inset-0 h-full w-full object-cover"
          />
        ) : null}

        {isVideo ? (
          // Always-visible "this is a video" marker: play glyph plus duration
          // when known. Same on-media optics as the swipe deck's control chips.
          // Fades out while a preview is actually rendering frames, so it never
          // sits over moving footage.
          <span
            className={cn(
              'pointer-events-none absolute bottom-2 right-2 z-10 flex items-center gap-1 rounded-full',
              'bg-black/55 px-2 py-1 backdrop-blur-sm',
              'theme-media-tile-title text-[11px] font-medium leading-none tabular-nums',
              'transition-opacity duration-300 motion-reduce:transition-none',
              playing ? 'opacity-0' : 'opacity-100',
            )}
          >
            <Icon icon="lucide:play" className="h-3 w-3 fill-current" aria-hidden />
            {durationLabel ? <span>{durationLabel}</span> : null}
            <span className="sr-only">Video</span>
          </span>
        ) : null}
      </Link>

      {/* max-md:hidden removes the caption *and* its mt-2 so compact phone
          tiles pay no spacing cost for a caption they never show. */}
      <figcaption className={cn('mt-2 min-w-0 px-0.5', mobileCompact && 'max-md:hidden')}>
        <p className="theme-text-secondary truncate text-sm font-medium">
          {replication.title}
        </p>
        {showByline ? <p className="theme-text-faint truncate text-xs">{byline}</p> : null}
      </figcaption>
    </figure>
  );
}
