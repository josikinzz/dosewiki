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
import type { GalleryReplication } from '@/types/replications';
import type { GalleryGroup } from '@/features/effects/gallery/galleryModel';
import { galleryGroupUrlKey } from '@/features/effects/gallery/galleryModel';
import { getCreatorByline } from '@/features/effects/components/replicationCredit';
import { buildGalleryFocusUrl } from '../galleryUrlState';

/**
 * The immersive swipe deck: the replications gallery's default surface on
 * phones. It sits *in the page flow* below the section intro and tabs — the
 * reader swipes down past them, the document's proximity snap frames the deck
 * under the sticky site header, and from there vertical swipes move between
 * artists while horizontal swipes move through one artist's works. Both axes
 * are native scroll-snap, so gestures inherit the platform's physics.
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
/** SSR fallback for the sticky site header's height; measured after mount. */
const HEADER_HEIGHT_FALLBACK = 57;

/** Round on-media control chip (same optics as the showcase's controls). */
const deckControlClassName = cn(
  'pointer-events-auto grid size-11 flex-none place-items-center rounded-full',
  'bg-black/55 text-[color:var(--theme-text-on-media)] backdrop-blur-sm',
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

/**
 * The sticky `.app-header`'s live height: the deck fills exactly the viewport
 * below it, and the deck's scroll-margin makes the document snap frame the
 * deck under it rather than behind it.
 */
function useSiteHeaderHeight(): number {
  const [height, setHeight] = useState(HEADER_HEIGHT_FALLBACK);
  useLayoutEffect(() => {
    const header = document.querySelector('.app-header');
    if (!(header instanceof HTMLElement)) {
      setHeight(0);
      return;
    }
    const update = () => setHeight(header.offsetHeight);
    update();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(update);
    observer.observe(header);
    return () => observer.disconnect();
  }, []);
  return height;
}

interface DeckPaneProps {
  work: GalleryReplication;
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

  const isVideo = work.type === 'video';
  const mountVideo = isVideo && sectionNearby && nearby;
  const showStill = everNearbyRef.current && (!isVideo || (!mountVideo && Boolean(work.thumbnail_url)));
  const shouldPlay =
    isVideo && active && (pausedByUser === null ? !reducedMotion : !pausedByUser);

  useEffect(() => {
    if (!active) setPausedByUser(null);
  }, [active]);

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
  const showPausedBadge = isVideo && mountVideo && !shouldPlay;

  return (
    <div
      ref={paneRef}
      className="relative h-full w-full flex-none snap-start snap-always overflow-hidden"
      aria-label={`${work.title}, ${byline}`}
    >
      {/* Media layer */}
      {mountVideo ? (
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
          <Icon icon="svg-spinners:ring-resize" className="size-8 text-white/40" aria-hidden />
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
            <Icon icon="lucide:play" className="size-7 fill-current text-white" aria-hidden />
          </span>
        </div>
      ) : buffering && shouldPlay ? (
        <div className="pointer-events-none absolute inset-0 grid place-items-center">
          <Icon icon="svg-spinners:ring-resize" className="size-8 text-white/60" aria-hidden />
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
            'pointer-events-auto inline-flex min-h-11 max-w-full items-center gap-1.5 text-base font-semibold text-white',
            focusRingClassName,
          )}
          style={onMediaTextShadow}
        >
          <span className="truncate">{work.title}</span>
          <Icon icon="lucide:arrow-up-right" size={14} className="shrink-0 text-white/70" aria-hidden />
        </Link>
        <p className="truncate text-sm text-white/75" style={onMediaTextShadow}>
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
          floating mute/grid chips. */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 bg-gradient-to-b from-black/75 via-black/35 to-transparent px-4 pb-10 pr-28 pt-3">
        <Link
          href={artistHref}
          className={cn(
            'pointer-events-auto inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-white',
            focusRingClassName,
          )}
          style={onMediaTextShadow}
        >
          <Icon icon="lucide:user-round" size={14} className="text-white/70" aria-hidden />
          <span className="max-w-[15rem] truncate">{group.label}</span>
          <Icon icon="lucide:chevron-right" size={14} className="text-white/50" aria-hidden />
        </Link>
        <p className="text-xs tabular-nums text-white/60" style={onMediaTextShadow}>
          {workIndex + 1} / {count} · artist {index + 1} of {total}
        </p>
        {/* Per-artist progress bar */}
        {count > 1 ? (
          <div className="mt-2 h-0.5 w-full overflow-hidden rounded-full bg-white/20">
            <div
              className="h-full rounded-full bg-white/80 transition-[width] duration-200 motion-reduce:transition-none"
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
  /** Switch the gallery to the browsable grid (search, filters, masonry). */
  onShowGrid: () => void;
}

export function ReplicationsSwipeDeck({
  groups,
  effectName,
  initialGroupIndex = 0,
  onShowGrid,
}: ReplicationsSwipeDeckProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [muted, setMuted] = useState(true);
  const [scrollUnlocked, setScrollUnlocked] = useState(false);
  const unlockScrollRef = useRef(false);
  const reducedMotion = usePrefersReducedMotion();
  const headerHeight = useSiteHeaderHeight();
  const startIndex = Math.max(0, Math.min(initialGroupIndex, groups.length - 1));
  const activeSectionRef = useRef(startIndex);
  const handleActive = useCallback((index: number) => {
    activeSectionRef.current = index;
  }, []);

  /**
   * Document-level proximity snap: swiping most of the way past the intro
   * settles with the deck framed exactly under the sticky header (the deck's
   * scroll-margin), while shallow scrolls within the intro stay free. The
   * site footer gets its own snap stop for the same lifetime — the deck's
   * frame position sits within proximity range of the document's end, so
   * without one the snap would drag the reader back off the footer and make
   * it unreachable. Scoped to the deck's lifetime so the grid view keeps
   * normal document scrolling.
   */
  useLayoutEffect(() => {
    const root = document.documentElement;
    const footer = document.querySelector('.app-footer');
    const previousSnap = root.style.scrollSnapType;
    const previousFooterAlign = footer instanceof HTMLElement ? footer.style.scrollSnapAlign : '';
    root.style.scrollSnapType = 'y proximity';
    if (footer instanceof HTMLElement) footer.style.scrollSnapAlign = 'end';
    return () => {
      root.style.scrollSnapType = previousSnap;
      if (footer instanceof HTMLElement) footer.style.scrollSnapAlign = previousFooterAlign;
    };
  }, []);

  /** Land on the deep-linked artist, with the deck framed. */
  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller || startIndex === 0) return;
    scroller.scrollTop = startIndex * scroller.clientHeight;
    rootRef.current?.scrollIntoView({ block: 'start' });
    // Initial position only — deliberately not reactive to later scrolling.
  }, []);

  /**
   * One-shot vertical-scroll unlock. The deck fills most of the phone screen
   * on arrival, so the reader's first "swipe into the gallery" would otherwise
   * land on this scroller and — because it is `snap-mandatory` — skip the
   * first artist. Until the deck is framed under the header the scroller stays
   * inert (`overflow: hidden`), routing that first swipe to the document, whose
   * proximity snap frames the deck. Once framed, unlock for the deck's whole
   * life so scrolling back up out of it (chaining into the intro) is never
   * gated.
   */
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const unlock = () => {
      if (unlockScrollRef.current) return;
      if (Math.abs(root.getBoundingClientRect().top - headerHeight) < 8) {
        unlockScrollRef.current = true;
        setScrollUnlocked(true);
      }
    };
    // Covers an already-framed arrival (a deep link that framed the deck
    // synchronously) without waiting for a scroll event.
    unlock();
    window.addEventListener('scroll', unlock, { passive: true });
    window.addEventListener('resize', unlock, { passive: true });
    return () => {
      window.removeEventListener('scroll', unlock);
      window.removeEventListener('resize', unlock);
    };
  }, [headerHeight]);

  /**
   * Frame-alignment assist. The document only frames the deck when *page*
   * scrolling settles near it; interacting with the deck's own scrollers
   * while it is misframed (parked at the footer, or the intro half-dismissed)
   * would otherwise leave it cut off indefinitely. Any scroll inside a
   * misframed deck glides the page back to the framed position. Scroll events
   * do not bubble, so this arrives via capture on the root; the document's
   * own scrolling never passes through it, so the assist cannot fight a page
   * swipe. The cooldown keeps one smooth glide per gesture.
   */
  const alignCooldownRef = useRef(false);
  const handleInnerScrollCapture = () => {
    const root = rootRef.current;
    if (!root || alignCooldownRef.current) return;
    if (Math.abs(root.getBoundingClientRect().top - headerHeight) < 8) return;
    alignCooldownRef.current = true;
    window.setTimeout(() => {
      alignCooldownRef.current = false;
    }, 700);
    root.scrollIntoView({ block: 'start', behavior: reducedMotion ? 'auto' : 'smooth' });
  };

  /** Arrow keys drive both axes when focus is inside the deck. */
  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
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
    <div
      ref={rootRef}
      onScrollCapture={handleInnerScrollCapture}
      className="relative w-full overflow-hidden bg-black"
      style={{
        height: `calc(100dvh - ${headerHeight}px)`,
        scrollSnapAlign: 'start',
        scrollMarginTop: headerHeight,
      }}
    >
      {/* A focusable, keyboard-scrollable region is the documented exception to
          both rules: without tabIndex a keyboard user cannot reach or scroll
          the deck at all, and the arrow-key handler mirrors the touch axes. */}
      {/* eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions, jsx-a11y/no-noninteractive-tabindex */}
      <div ref={scrollerRef} tabIndex={0}
        role="region"
        aria-label={`Replications swipe gallery, ${totalWorks} works by ${groups.length} artists. Swipe up or down to change artist, left or right to browse an artist's works.`}
        onKeyDown={handleKeyDown}
        className={cn(
          'h-full snap-y snap-mandatory [scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
          scrollUnlocked ? 'overflow-y-auto' : 'overflow-y-hidden',
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

      {/* Floating deck controls: mute + grid view, above every section. */}
      <div className="pointer-events-none absolute right-3 top-2 z-20 flex items-center gap-2">
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
          onClick={onShowGrid}
          aria-label="Show grid view with search and filters"
          className={deckControlClassName}
        >
          <Icon icon="lucide:layout-grid" size={18} />
        </button>
      </div>
    </div>
  );
}
