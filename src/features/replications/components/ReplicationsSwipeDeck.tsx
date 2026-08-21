'use client';

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { AppImage } from '@/components/common/AppImage';
import { Icon } from '@/components/common/Icon';
import { PublicNameChip } from '@/components/common/PublicTokens';
import { focusRingClassName } from '@/components/ui/surface';
import { cn } from '@/lib/utils';
import { icons } from '@/utils/iconNames';
import { publicHref } from '@/utils/publicHref';
import type { PublicGalleryReplicationPreview } from '@/types/replications';
import type { GalleryGroup } from '@/features/effects/gallery/galleryModel';
import { galleryGroupUrlKey } from '@/features/effects/gallery/galleryModel';
import { getCreatorByline } from '@/features/effects/components/replicationCredit';
import { buildGalleryFocusUrl } from '../galleryUrlState';

/**
 * The immersive swipe deck: a fullscreen modal viewer over the replications
 * gallery. It covers the entire viewport (site header included), locks the
 * document's scroll for its lifetime, and is dismissed with Escape or the
 * close chip. Inside it, vertical swipes move between artists while
 * horizontal swipes move through one artist's works. Both axes are native
 * scroll-snap, so gestures inherit the platform's physics.
 *
 * Videos stream, autoplay (muted), and loop as soon as their pane approaches
 * the viewport; there is no play button to find. `prefers-reduced-motion`
 * keeps the deck fully usable but starts every video paused behind an
 * explicit tap, and tapping any playing video pauses it.
 *
 * Media mounting is windowed twice over: an artist section only renders its
 * panes once it is within a viewport of becoming visible, and a pane only
 * mounts its <video> element once it is within a pane's width of the reader.
 * A corpus of hundreds of works therefore costs a handful of live elements.
 */

/** Sections within this margin of the viewport mount their panes. */
const SECTION_MOUNT_MARGIN = '120% 0px';
/** Panes within this margin of the viewport mount their media element. */
const PANE_MOUNT_MARGIN = '0px 120%';
/** A pane must be this visible to count as the active, playing one. */
const ACTIVE_THRESHOLD = 0.7;

/** Round on-media control chip (same optics as the showcase's controls). */
const deckControlClassName = cn(
  'pointer-events-auto grid size-11 flex-none place-items-center rounded-full',
  'bg-black/55 theme-media-tile-title backdrop-blur-sm',
  'transition-opacity active:opacity-100 hover:opacity-100 opacity-80',
  'motion-reduce:transition-none',
  focusRingClassName,
);

const onMediaTextShadow = { textShadow: '0 1px 8px rgba(0,0,0,0.8)' } as const;

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReduced(query.matches);
    update();
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);
  return reduced;
}

/** Observe an element against the viewport; report intersection at `threshold`. */
function useInViewport(
  ref: React.RefObject<Element | null>,
  options: { rootMargin?: string; threshold?: number },
  /** Once true, stay true (used for mount windows so media never unmounts mid-swipe). */
  sticky = false,
): boolean {
  const [inView, setInView] = useState(false);
  const { rootMargin, threshold } = options;
  useEffect(() => {
    const element = ref.current;
    if (!element || typeof IntersectionObserver === 'undefined') {
      // No observer support: err on the side of showing media.
      setInView(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        // Fast swipes batch several transitions into one callback; only the
        // newest entry reflects reality. Acting on the first would strand a
        // stale verdict (e.g. `active` stuck on after the pane left).
        const entry = entries[entries.length - 1];
        if (entry.isIntersecting) {
          setInView(true);
        } else if (!sticky) {
          setInView(false);
        }
      },
      { rootMargin, threshold },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref, rootMargin, threshold, sticky]);
  return inView;
}

interface DeckPaneProps {
  work: PublicGalleryReplicationPreview;
  /** Pane may mount its media (its section is near the viewport). */
  sectionNearby: boolean;
  muted: boolean;
  reducedMotion: boolean;
  effectName: (slug: string | undefined) => string;
}

/**
 * One full-viewport pane. Videos manage their own play state from viewport
 * dominance: ≥70% visible → play (unless reduced motion or the reader paused
 * it), anything less → pause and rewind the override so the next arrival
 * autoplays again.
 */
function DeckPane({ work, sectionNearby, muted, reducedMotion, effectName }: DeckPaneProps) {
  const paneRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  /**
   * The media window is a *sliding* window, not a sticky one. Browsers cap
   * concurrent media pipelines (Chrome and iOS both stall the overflow player
   * silently: `paused` stays false while the clock freezes), so a <video>
   * element may only exist while its pane is within ~1.2 viewports of the
   * reader. Panes that leave the window drop back to their poster; the
   * once-visited flag keeps that poster (or an image work) mounted so
   * re-entry crossfades from a frame instead of a spinner.
   */
  const nearby = useInViewport(paneRef, { rootMargin: PANE_MOUNT_MARGIN });
  const active = useInViewport(paneRef, { threshold: ACTIVE_THRESHOLD });
  const everNearbyRef = useRef(false);
  if (nearby) everNearbyRef.current = true;
  /** Reader's explicit pause/play verdict; cleared when the pane leaves. */
  const [pausedByUser, setPausedByUser] = useState<boolean | null>(null);
  const [buffering, setBuffering] = useState(false);
  const [mediaError, setMediaError] = useState(false);

  const isVideo = work.type === 'video';
  const mountVideo = isVideo && sectionNearby && nearby;
  const showStill = everNearbyRef.current && (!isVideo || (!mountVideo && Boolean(work.thumbnail_url)));
  const shouldPlay =
    isVideo && active && (pausedByUser === null ? !reducedMotion : !pausedByUser);

  useEffect(() => {
    if (!active) setPausedByUser(null);
  }, [active]);

  /** A fresh media mount is a fresh attempt: clear stale failures. */
  useEffect(() => {
    if (!mountVideo) setMediaError(false);
  }, [mountVideo]);

  /**
   * Play/pause + pipeline policy. Only the active pane may hold a media
   * pipeline: inactive videos are `preload="none"` (their poster covers
   * them), and a pane that *stops* being active surrenders its pipeline with
   * `load()` — browsers cap concurrent players, and a handful of leftover
   * pipelines is exactly what froze playback (clock stopped at
   * `paused === false`) before the sliding mount window bounded them.
   */
  const hadPipelineRef = useRef(false);
  useEffect(() => {
    const video = videoRef.current;
    if (!video) {
      hadPipelineRef.current = false;
      return;
    }
    video.muted = muted;
    if (shouldPlay) {
      hadPipelineRef.current = true;
      void video.play().catch(() => {});
      return;
    }
    video.pause();
    if (!active && hadPipelineRef.current) {
      // Back to preload="none": drops the decoder + network pipeline and
      // resets to the poster. Loops restart from 0 on return by design.
      hadPipelineRef.current = false;
      video.load();
    }
  }, [shouldPlay, active, muted, mountVideo]);

  /**
   * Stall watchdog for the active video. A suspended pipeline can leave the
   * element claiming to play while its clock is frozen; if no progress and no
   * fresh data arrive across two consecutive checks, rebuild the pipeline and
   * resume. Recovers the "video is unresponsive" state without user input.
   */
  useEffect(() => {
    if (!shouldPlay) return;
    let lastTime = -1;
    const interval = window.setInterval(() => {
      const video = videoRef.current;
      if (!video || video.paused) return;
      if (video.currentTime > lastTime + 0.1) {
        lastTime = video.currentTime;
        return;
      }
      if (video.readyState >= 3) {
        // Data is buffered but the clock is frozen: the player is wedged.
        video.load();
        void video.play().catch(() => {});
        lastTime = -1;
      }
    }, 1500);
    return () => window.clearInterval(interval);
  }, [shouldPlay]);

  const togglePlayback = () => {
    if (!isVideo) return;
    setPausedByUser(videoRef.current ? !videoRef.current.paused : true);
  };

  const byline = getCreatorByline(work);
  const showPausedBadge = isVideo && mountVideo && !shouldPlay && !mediaError;

  return (
    <div
      ref={paneRef}
      className="relative h-full w-full flex-none snap-start snap-always overflow-hidden"
      aria-label={`${work.title}, ${byline}`}
    >
      {/* Media layer */}
      {mediaError || (everNearbyRef.current && !mountVideo && !showStill) ? (
        // Broken media: a quiet placeholder instead of an infinite spinner.
        // No retry control — leaving the mount window and swiping back
        // remounts the media element, which is a fresh attempt.
        <div className="absolute inset-0 grid place-items-center">
          <div className="theme-media-loading-idle grid max-w-[80%] justify-items-center gap-2 text-center">
            <Icon icon="lucide:image-off" className="size-8" aria-hidden />
            <span className="max-w-full truncate text-sm">{work.title}</span>
          </div>
        </div>
      ) : mountVideo ? (
        <video
          ref={videoRef}
          src={work.url}
          poster={work.thumbnail_url}
          loop
          muted
          playsInline
          preload={active ? 'auto' : 'none'}
          onWaiting={() => setBuffering(true)}
          onPlaying={() => setBuffering(false)}
          onCanPlay={() => setBuffering(false)}
          onError={() => {
            setBuffering(false);
            setMediaError(true);
          }}
          className="absolute inset-0 h-full w-full object-contain"
        />
      ) : showStill ? (
        <AppImage
          src={isVideo ? work.thumbnail_url! : work.url}
          alt={work.title}
          width={work.width ?? 1200}
          height={work.height ?? 1200}
          className="absolute inset-0 h-full w-full object-contain"
        />
      ) : (
        <div className="absolute inset-0 grid place-items-center">
          <Icon icon="svg-spinners:ring-resize" className="theme-media-loading-idle size-8" aria-hidden />
        </div>
      )}

      {/* Tap target: toggles play/pause on videos. Sits under the caption
          controls, so links and chips stay tappable above it. */}
      {isVideo ? (
        <button
          type="button"
          onClick={togglePlayback}
          aria-label={shouldPlay ? `Pause ${work.title}` : `Play ${work.title}`}
          className="absolute inset-0 h-full w-full cursor-default focus-visible:outline-none"
        />
      ) : null}

      {/* Centered paused / buffering badge */}
      {showPausedBadge ? (
        <div className="pointer-events-none absolute inset-0 grid place-items-center">
          <span className="grid size-16 place-items-center rounded-full bg-black/50 backdrop-blur-sm">
            <Icon icon="lucide:play" className="theme-media-tile-title size-7 fill-current" aria-hidden />
          </span>
        </div>
      ) : buffering && shouldPlay ? (
        <div className="pointer-events-none absolute inset-0 grid place-items-center">
          <Icon icon="svg-spinners:ring-resize" className="theme-media-loading-active size-8" aria-hidden />
        </div>
      ) : null}

      {/* Caption: title, byline, effect chip, permalink */}
      <div
        className="pointer-events-none absolute inset-x-0 bottom-0 z-10 bg-gradient-to-t from-black/80 via-black/40 to-transparent px-4 pt-14"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 1.25rem)' }}
      >
        <Link
          href={publicHref.replication(work.slug)}
          className={cn(
            'theme-media-tile-title pointer-events-auto inline-flex min-h-11 max-w-full items-center gap-1.5 text-base font-semibold',
            focusRingClassName,
          )}
          style={onMediaTextShadow}
        >
          <span className="truncate">{work.title}</span>
          <Icon icon="lucide:arrow-up-right" size={14} className="theme-media-tile-creator shrink-0" aria-hidden />
        </Link>
        <p className="theme-media-tile-creator truncate text-sm" style={onMediaTextShadow}>
          {byline}
        </p>
        {work.effect_slug ? (
          <PublicNameChip
            as={Link}
            href={publicHref.effect(work.effect_slug)}
            interactive
            icon={icons.subjectiveEffectIndex}
            className="pointer-events-auto mt-2.5 bg-black/45 px-2.5 py-1 backdrop-blur-sm"
          >
            {effectName(work.effect_slug)}
          </PublicNameChip>
        ) : null}
      </div>
    </div>
  );
}

interface DeckSectionProps {
  group: GalleryGroup;
  index: number;
  total: number;
  muted: boolean;
  reducedMotion: boolean;
  effectName: (slug: string | undefined) => string;
  /** Reports itself as the vertically active section. */
  onActive: (index: number) => void;
  /** Sections at or before this index mount immediately (initial position). */
  eagerUpTo: number;
}

/** One artist: a horizontal snap row of their works plus the artist header. */
function DeckSection({ group, index, total, muted, reducedMotion, effectName, onActive, eagerUpTo }: DeckSectionProps) {
  const sectionRef = useRef<HTMLElement>(null);
  const rowRef = useRef<HTMLDivElement>(null);
  const nearbyObserved = useInViewport(sectionRef, { rootMargin: SECTION_MOUNT_MARGIN }, true);
  const nearby = nearbyObserved || index <= eagerUpTo;
  const active = useInViewport(sectionRef, { threshold: ACTIVE_THRESHOLD });
  const [workIndex, setWorkIndex] = useState(0);
  const scrollFrame = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (active) onActive(index);
  }, [active, index, onActive]);

  useEffect(() => () => cancelAnimationFrame(scrollFrame.current ?? 0), []);

  const handleRowScroll = () => {
    cancelAnimationFrame(scrollFrame.current ?? 0);
    scrollFrame.current = requestAnimationFrame(() => {
      const row = rowRef.current;
      if (!row || row.clientWidth === 0) return;
      setWorkIndex(
        Math.max(0, Math.min(group.items.length - 1, Math.round(row.scrollLeft / row.clientWidth))),
      );
    });
  };

  const artistHref = buildGalleryFocusUrl({
    kind: 'artist',
    key: galleryGroupUrlKey('artist', group),
  });
  const count = group.items.length;

  return (
    <section
      ref={sectionRef}
      className="relative h-full w-full snap-start snap-always"
      aria-label={`${group.label}, ${count} ${count === 1 ? 'work' : 'works'}, artist ${index + 1} of ${total}`}
    >
      <div
        ref={rowRef}
        data-deck-row
        onScroll={handleRowScroll}
        className="flex h-full snap-x snap-mandatory overflow-x-auto overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {nearby ? (
          group.items.map((work) => (
            <DeckPane
              key={work._id}
              work={work}
              sectionNearby={nearby}
              muted={muted}
              reducedMotion={reducedMotion}
              effectName={effectName}
            />
          ))
        ) : (
          <div className="h-full w-full flex-none" />
        )}
      </div>

      {/* Artist header — scrolls with its section; right padding clears the
          floating mute/close chips. */}
      <div
        className="pointer-events-none absolute inset-x-0 top-0 z-10 bg-gradient-to-b from-black/75 via-black/35 to-transparent px-4 pb-10 pr-28"
        style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 0.75rem)' }}
      >
        <Link
          href={artistHref}
          className={cn(
            'theme-media-tile-title pointer-events-auto inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold',
            focusRingClassName,
          )}
          style={onMediaTextShadow}
        >
          <Icon icon="lucide:user-round" size={14} className="theme-media-tile-creator" aria-hidden />
          <span className="max-w-[15rem] truncate">{group.label}</span>
          <Icon icon="lucide:chevron-right" size={14} className="theme-media-tile-creator opacity-70" aria-hidden />
        </Link>
        {/* Per-artist progress bar */}
        {count > 1 ? (
          <div className="theme-media-progress-track mt-2 h-0.5 w-full overflow-hidden rounded-full">
            <div
              className="theme-media-progress-fill h-full rounded-full transition-[width] duration-200 motion-reduce:transition-none"
              style={{ width: `${((workIndex + 1) / count) * 100}%` }}
            />
          </div>
        ) : null}
      </div>
    </section>
  );
}

export interface ReplicationsSwipeDeckProps {
  /** Artist-grouped works (the deck is always organized by artist). */
  groups: GalleryGroup[];
  /** Display-name lookup for effect slugs (see `effectNameLookup`). */
  effectName: (slug: string | undefined) => string;
  /** Start at this group index (e.g. a /replications/artist/<key> deep link). */
  initialGroupIndex?: number;
  /** Start at this work within the starting group (clamped to its length). */
  initialWorkIndex?: number;
  /** Dismiss the fullscreen viewer (Escape or the close chip). */
  onClose: () => void;
}

export function ReplicationsSwipeDeck({
  groups,
  effectName,
  initialGroupIndex = 0,
  initialWorkIndex = 0,
  onClose,
}: ReplicationsSwipeDeckProps) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [muted, setMuted] = useState(true);
  const reducedMotion = usePrefersReducedMotion();
  const startIndex = Math.max(0, Math.min(initialGroupIndex, groups.length - 1));
  const activeSectionRef = useRef(startIndex);
  const handleActive = useCallback((index: number) => {
    activeSectionRef.current = index;
  }, []);

  /**
   * Body scroll lock. The deck is a fullscreen overlay, so the document
   * behind it must not scroll (iOS would happily rubber-band the page under
   * the reader's deck swipes). Save and restore the previous inline value so
   * any outer scroll management survives the round trip.
   */
  useLayoutEffect(() => {
    const root = document.documentElement;
    const previousOverflow = root.style.overflow;
    root.style.overflow = 'hidden';
    return () => {
      root.style.overflow = previousOverflow;
    };
  }, []);

  /** Escape closes the viewer no matter where focus has wandered. */
  useEffect(() => {
    const handleWindowKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleWindowKeyDown);
    return () => window.removeEventListener('keydown', handleWindowKeyDown);
  }, [onClose]);

  /**
   * Land on the deep-linked artist and work, and move focus to the scroller
   * so arrow keys and Escape work immediately without a preliminary tab.
   * The starting section mounts its panes eagerly (`eagerUpTo`), so the row
   * has its full width to scroll on first commit.
   */
  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    scroller.focus({ preventScroll: true });
    if (startIndex > 0) scroller.scrollTop = startIndex * scroller.clientHeight;
    const startGroup = groups[startIndex];
    const workIndex = Math.max(0, Math.min(initialWorkIndex, (startGroup?.items.length ?? 1) - 1));
    if (workIndex > 0) {
      const row = scroller.querySelectorAll<HTMLElement>('[data-deck-row]')[startIndex];
      if (row) row.scrollLeft = workIndex * row.clientWidth;
    }
    // Initial position only — deliberately not reactive to later scrolling.
  }, []);

  /** Escape dismisses; arrow keys drive both axes when focus is in the deck. */
  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      onClose();
      return;
    }
    const scroller = scrollerRef.current;
    if (!scroller) return;
    const behavior: ScrollBehavior = reducedMotion ? 'auto' : 'smooth';
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      scroller.scrollBy({
        top: event.key === 'ArrowDown' ? scroller.clientHeight : -scroller.clientHeight,
        behavior,
      });
    } else if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
      event.preventDefault();
      const row = scroller.querySelectorAll<HTMLElement>('[data-deck-row]')[activeSectionRef.current];
      row?.scrollBy({
        left: event.key === 'ArrowRight' ? row.clientWidth : -row.clientWidth,
        behavior,
      });
    }
  };

  const totalWorks = useMemo(() => groups.reduce((sum, group) => sum + group.items.length, 0), [groups]);

  if (groups.length === 0) return null;

  return (
    // The keyboard handler lives on the overlay root so Escape and the arrow
    // keys work from the chips as well as the scroller region below.
    // eslint-disable-next-line jsx-a11y/no-static-element-interactions
    <div
      onKeyDown={handleKeyDown}
      className="fixed inset-0 z-[70] overflow-hidden bg-black"
    >
      {/* A focusable, keyboard-scrollable region is the documented exception:
          without tabIndex a keyboard user cannot reach or scroll the deck at
          all, and the root's arrow-key handler mirrors the touch axes. */}
      {/* eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex */}
      <div ref={scrollerRef} tabIndex={0}
        role="region"
        aria-label={`Replications swipe gallery, ${totalWorks} works by ${groups.length} artists. Swipe up or down to change artist, left or right to browse an artist's works.`}
        className={cn(
          'h-full snap-y snap-mandatory overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
          focusRingClassName,
        )}
      >
        {groups.map((group, index) => (
          <DeckSection
            key={group.key}
            group={group}
            index={index}
            total={groups.length}
            muted={muted}
            reducedMotion={reducedMotion}
            effectName={effectName}
            onActive={handleActive}
            eagerUpTo={startIndex}
          />
        ))}
      </div>

      {/* Floating deck controls: mute + close, above every section; padded
          past the iOS notch/status bar so the chips stay reachable. */}
      <div
        className="pointer-events-none absolute right-3 top-2 z-20 flex items-center gap-2"
        style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}
      >
        <button
          type="button"
          onClick={() => setMuted((value) => !value)}
          aria-label={muted ? 'Unmute videos' : 'Mute videos'}
          className={deckControlClassName}
        >
          <Icon icon={muted ? 'lucide:volume-x' : 'lucide:volume-2'} size={18} />
        </button>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close the gallery"
          className={deckControlClassName}
        >
          <Icon icon="lucide:x" size={18} />
        </button>
      </div>
    </div>
  );
}
