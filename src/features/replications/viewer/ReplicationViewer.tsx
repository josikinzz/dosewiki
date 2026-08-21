'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';

import { AppImage } from '@/components/common/AppImage';
import { Icon } from '@/components/common/Icon';
import { proseLinkClassName } from '@/components/common/ProseLink';
import { PublicOverline } from '@/components/common/PublicTokens';
import { PublicContentShell } from '@/components/layout/PublicPagePrimitives';
import { focusRingClassName } from '@/components/ui/surface';
import { hasKnownCreator } from '@/features/effects/components/replicationCredit';
import { cn } from '@/lib/utils';
import { publicHref } from '@/utils/publicHref';
import {
  FIT_MODE_STORAGE_KEY,
  buildViewerPath,
  computeFillScale,
  parseViewerSetParam,
  resolveFitMode,
  viewerDocumentTitle,
  type FitMode,
  type ViewerSetParam,
} from './viewerLogic';
import {
  describeViewerSet,
  findViewerIndex,
  type ReplicationViewerItem,
  type ReplicationViewerSet,
} from './viewerModel';
import { ViewerMetadata } from './ViewerMetadata';

/**
 * The immersive permalink viewer: a full-bleed stage over the walk the server
 * chose (or the substance walk the URL opted into), a filmstrip of the whole
 * set, and instant client-side prev/next. Every position is a permanent URL —
 * navigation is `history.pushState` to the neighbor's canonical permalink, so
 * the address bar, the back button, and a copied link all keep meaning "this
 * exact work" while the reader flips through the set without document loads.
 */

export interface ReplicationViewerProps {
  initialSlug: string;
  set: ReplicationViewerSet;
}

/** The filmstrip nav takes its accessible name from the label it renders. */
const SET_LABEL_ID = 'replication-viewer-set-label';

const FALLBACK_IMAGE_RATIO = 4 / 3;
const FALLBACK_VIDEO_RATIO = 16 / 9;

/** Vertical travel that counts as a deliberate swipe rather than a tap. */
const SWIPE_THRESHOLD_PX = 48;

/**
 * How much of the stage must be visible before its video plays. The stage is
 * most of a small viewport, so this is looser than the deck's 0.7 — half the
 * stage on screen already means the reader is looking at it.
 */
const STAGE_PLAY_THRESHOLD = 0.5;

/** Round on-media control chip (same optics as the swipe deck's controls). */
const viewerControlClassName = cn(
  'grid size-11 flex-none place-items-center rounded-full',
  'bg-black/55 theme-media-tile-title backdrop-blur-sm',
  'transition-opacity active:opacity-100 hover:opacity-100 opacity-80',
  'motion-reduce:transition-none',
  focusRingClassName,
);

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

/** Observe an element against the viewport; drives autoplay-when-visible. */
function useInViewport(ref: React.RefObject<Element | null>, threshold: number): boolean {
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const element = ref.current;
    if (!element || typeof IntersectionObserver === 'undefined') {
      // No observer support: err on the side of playing media.
      setInView(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        // Batched transitions deliver several entries; only the newest
        // reflects reality (same reasoning as the swipe deck's observer).
        setInView(entries[entries.length - 1].isIntersecting);
      },
      { threshold },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref, threshold]);
  return inView;
}

/** Byline for the active item — same claims and link policy as the old page. */
function ViewerByline({ item }: { item: ReplicationViewerItem }) {
  const creator = hasKnownCreator(item.replication.artist)
    ? item.replication.artist.trim()
    : null;

  return (
    <p className="theme-text-secondary text-sm leading-6">
      {creator ? (
        <>
          by{' '}
          {item.artistProfileHref ? (
            // The credit resolves to a contributor, so the byline goes to
            // their profile: that is where their other work, their bio, and
            // now their own website live. Their external site is one link on
            // that page rather than the destination of every credit.
            <Link href={item.artistProfileHref} className={proseLinkClassName}>
              {creator}
            </Link>
          ) : item.replication.artist_url ? (
            // No profile claims this credit. The row's own external link is
            // then the only destination that exists, so it stays — the
            // alternative is a byline that links nowhere.
            <a
              href={item.replication.artist_url}
              target="_blank"
              rel="noopener noreferrer"
              className={proseLinkClassName}
            >
              {creator}
            </a>
          ) : (
            <span className="theme-text-primary font-medium">{creator}</span>
          )}
        </>
      ) : (
        <span className="theme-text-muted">Creator unknown</span>
      )}
    </p>
  );
}

export function ReplicationViewer({ initialSlug, set }: ReplicationViewerProps) {
  const [walk, setWalk] = useState(set);
  const [activeSlug, setActiveSlug] = useState(initialSlug);
  /** Live only while a URL-scoped walk actually replaced the server one. */
  const [setParam, setSetParam] = useState<ViewerSetParam | null>(null);
  const [fitOverride, setFitOverride] = useState<FitMode | null>(null);
  /** Aspect ratios probed from loaded media, for rows missing dimensions. */
  const [probedAspects, setProbedAspects] = useState<Record<string, number>>({});
  const [stageAspect, setStageAspect] = useState(FALLBACK_VIDEO_RATIO);
  const [userPaused, setUserPaused] = useState(false);

  const stageRef = useRef<HTMLElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const stripRef = useRef<HTMLUListElement>(null);
  /** Distinguishes our own pause() from the reader pressing pause. */
  const programmaticPauseRef = useRef(false);
  /** Mute survives navigation even though the <video> element remounts. */
  const mutedRef = useRef(true);
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  const walkRef = useRef(walk);
  walkRef.current = walk;
  const activeSlugRef = useRef(activeSlug);
  activeSlugRef.current = activeSlug;

  const reducedMotion = usePrefersReducedMotion();
  const stageInView = useInViewport(stageRef, STAGE_PLAY_THRESHOLD);

  const index = Math.max(0, findViewerIndex(walk, activeSlug));
  const active = walk.items[index];
  const previous = index > 0 ? walk.items[index - 1] : null;
  const next = index < walk.items.length - 1 ? walk.items[index + 1] : null;

  /**
   * A `?set=substance:<slug>` URL opts into the substance's own gallery walk.
   * The server cannot build that set (the permalink is statically rendered
   * for the scope-free URL), so it is fetched here and swapped in only when
   * it actually contains the item on screen — any failure, absence, or
   * mismatch silently keeps the server-chosen walk, which is always valid.
   */
  useEffect(() => {
    const param = parseViewerSetParam(window.location.search);
    if (!param) return;

    const controller = new AbortController();
    void (async () => {
      try {
        const response = await fetch(`/api/v1/substances/${param.slug}/replications`, {
          signal: controller.signal,
        });
        if (!response.ok) return;
        const body = (await response.json()) as {
          scopeLabel?: unknown;
          items?: unknown;
        };
        if (!Array.isArray(body.items)) return;
        const items = body.items.filter(
          (candidate): candidate is ReplicationViewerItem =>
            typeof candidate?.replication?.slug === 'string' &&
            typeof candidate?.replication?.url === 'string',
        );
        // The reader may have navigated while the fetch was in flight, so the
        // membership check runs against wherever they are *now*.
        if (!items.some((item) => item.replication.slug === activeSlugRef.current)) return;
        setWalk({
          scope: 'substance',
          scopeLabel: typeof body.scopeLabel === 'string' ? body.scopeLabel : null,
          items,
        });
        setSetParam(param);
      } catch {
        // Keep the server set: the page is already showing a coherent walk.
      }
    })();
    return () => controller.abort();
  }, []);

  /** The reader's explicit fit/fill choice outlives navigation for the session. */
  useEffect(() => {
    try {
      const stored = window.sessionStorage.getItem(FIT_MODE_STORAGE_KEY);
      if (stored === 'fit' || stored === 'fill') setFitOverride(stored);
    } catch {
      // Storage may be denied (private mode); the per-type defaults stand.
    }
  }, []);

  /** Track the stage's own aspect — the crop is against it, not the viewport. */
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage || typeof ResizeObserver === 'undefined') return;
    const update = () => {
      if (stage.clientHeight > 0) setStageAspect(stage.clientWidth / stage.clientHeight);
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(stage);
    return () => observer.disconnect();
  }, []);

  const goTo = useCallback(
    (targetIndex: number) => {
      const item = walk.items[targetIndex];
      if (!item || item.replication.slug === activeSlug) return;
      setActiveSlug(item.replication.slug);
      // Native pushState rather than the router: the neighbor is already in
      // memory, so a server round-trip would only re-fetch what is on screen.
      window.history.pushState({}, '', buildViewerPath(item.replication.slug, setParam));
      document.title = viewerDocumentTitle(item);
    },
    [walk, activeSlug, setParam],
  );

  /** Back/forward re-enter entries this component pushed: restore from the path. */
  useEffect(() => {
    const onPopState = () => {
      const segments = window.location.pathname.split('/').filter(Boolean);
      const slug = decodeURIComponent(segments[segments.length - 1] ?? '');
      const restoredIndex = findViewerIndex(walkRef.current, slug);
      // Every entry we push names a walk member; an entry that stopped being
      // one (pushed before a substance re-scope swapped the walk) is left to
      // the browser rather than guessed at.
      if (restoredIndex < 0) return;
      const item = walkRef.current.items[restoredIndex];
      setActiveSlug(item.replication.slug);
      document.title = viewerDocumentTitle(item);
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  /**
   * Arrow-key paging between replications, with the guards the old
   * `ReplicationNeighborKeys` had: ignores keystrokes aimed at a field, a
   * contenteditable region, a media element, or combined with a modifier, so
   * it never steals browser or text-caret navigation.
   */
  useEffect(() => {
    if (walk.items.length < 2) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
      if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;

      const target = event.target as HTMLElement | null;
      if (
        target?.isContentEditable ||
        (target && /^(INPUT|TEXTAREA|SELECT|VIDEO|AUDIO)$/.test(target.tagName))
      ) {
        return;
      }

      // The walk is finite, not circular: reaching an end is how a reader
      // knows they have seen the set, and wrap-around turns "next" into a
      // sequence that never visibly ends.
      const targetIndex = index + (event.key === 'ArrowLeft' ? -1 : 1);
      if (targetIndex < 0 || targetIndex >= walk.items.length) return;

      event.preventDefault();
      goTo(targetIndex);
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [walk, index, goTo]);

  /** A fresh item is a fresh playback question; the old verdict doesn't carry. */
  useEffect(() => {
    setUserPaused(false);
  }, [activeSlug]);

  /**
   * Autoplay-when-visible, muted — same policy as the swipe deck: the loop
   * plays while the stage dominates the viewport unless the reader paused it
   * or prefers reduced motion, and pauses when scrolled away so the licence
   * reader below isn't paying for playback they can't see.
   */
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = mutedRef.current;
    if (stageInView && !reducedMotion && !userPaused) {
      const attempt = video.play();
      // Autoplay-policy rejections are expected; jsdom returns no promise.
      if (attempt) void attempt.catch(() => {});
    } else if (!video.paused) {
      programmaticPauseRef.current = true;
      video.pause();
    }
  }, [activeSlug, stageInView, reducedMotion, userPaused]);

  /** Keep the active thumb in sight without yanking the page vertically. */
  useEffect(() => {
    const activeThumb = stripRef.current?.querySelector('[data-active]');
    activeThumb?.scrollIntoView?.({
      behavior: reducedMotion ? 'auto' : 'smooth',
      inline: 'center',
      block: 'nearest',
    });
  }, [index, reducedMotion]);

  if (!active) return null;

  const isVideo = active.replication.type === 'video';
  const fitMode = resolveFitMode(active.replication.type, fitOverride);
  const mediaAspect =
    probedAspects[active.replication.slug] ??
    (active.replication.width && active.replication.height
      ? active.replication.width / active.replication.height
      : isVideo
        ? FALLBACK_VIDEO_RATIO
        : FALLBACK_IMAGE_RATIO);
  const scale = fitMode === 'fill' ? computeFillScale(mediaAspect, stageAspect) : 1;
  const scaleStyle = scale > 1.001 ? { transform: `scale(${scale.toFixed(3)})` } : undefined;

  const width = active.replication.width ?? 1600;
  const height = active.replication.height ?? Math.round(width / FALLBACK_IMAGE_RATIO);

  const toggleFit = () => {
    const nextMode: FitMode = fitMode === 'fill' ? 'fit' : 'fill';
    setFitOverride(nextMode);
    try {
      window.sessionStorage.setItem(FIT_MODE_STORAGE_KEY, nextMode);
    } catch {
      // Session-only preference; losing it costs one extra tap.
    }
  };

  /** Plain left clicks become client-side moves; modifier clicks keep their meaning. */
  const interceptNavigate = (event: React.MouseEvent, targetIndex: number) => {
    if (event.defaultPrevented || event.button !== 0) return;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    goTo(targetIndex);
  };

  const onTouchStart = (event: React.TouchEvent) => {
    touchStartRef.current =
      event.touches.length === 1
        ? { x: event.touches[0].clientX, y: event.touches[0].clientY }
        : null;
  };

  const onTouchEnd = (event: React.TouchEvent) => {
    const start = touchStartRef.current;
    touchStartRef.current = null;
    const touch = event.changedTouches[0];
    if (!start || !touch) return;
    const dx = touch.clientX - start.x;
    const dy = touch.clientY - start.y;
    // Mostly-vertical travel past the threshold; anything else is a tap or a
    // horizontal gesture (e.g. scrubbing the video's controls).
    if (Math.abs(dy) < SWIPE_THRESHOLD_PX || Math.abs(dy) <= Math.abs(dx)) return;
    const targetIndex = index + (dy < 0 ? 1 : -1);
    if (targetIndex < 0 || targetIndex >= walk.items.length) return;
    goTo(targetIndex);
  };

  return (
    <>
      {/* Above the stage: where you are, what this is, who made it — the same
          claims the old page opened with, compacted so the work stays the
          first thing a shared-link arrival actually sees. */}
      <header className="mx-auto w-full max-w-6xl px-4 pb-4 pt-8 md:px-8">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <PublicOverline as={Link} href={publicHref.replications()} className={proseLinkClassName}>
            Replications
          </PublicOverline>
          {active.effectName && active.effectSlug ? (
            <>
              <span className="theme-text-ghost text-[0.6875rem]" aria-hidden>
                /
              </span>
              <PublicOverline
                as={Link}
                href={publicHref.effect(active.effectSlug)}
                className={proseLinkClassName}
              >
                {active.effectName}
              </PublicOverline>
            </>
          ) : null}
        </div>

        <h1 className="theme-accent-heading font-display mt-2 text-xl font-bold tracking-tight sm:text-2xl">
          {active.replication.title}
        </h1>

        <ViewerByline item={active} />
      </header>

      {/* The work itself: an edge-to-edge dark stage. No caption burned into
          the frame — title and credit sit above, provenance below. Vertical
          pan is claimed for the swipe gesture (pan-x/pinch stay native), so
          on touch the stage itself flips between items. */}
      <section
        ref={stageRef}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
        className="relative h-[62svh] max-h-[88vh] w-full overflow-hidden bg-black sm:h-[70vh] xl:h-[76vh] [touch-action:pan-x_pinch-zoom]"
      >
        {isVideo ? (
          // No caption track: replications are wordless visual recreations and
          // the schema carries no caption asset to point at. Muting the player
          // would satisfy the rule but would misrepresent the work.
          // Loops because replications are seamless loops; ending on a
          // freeze-frame misrepresents the work. Controls still allow pause.
          // Keyed by slug so navigation surrenders the old media pipeline
          // instead of retargeting a live one.
          <video
            key={active.replication.slug}
            ref={videoRef}
            src={active.replication.url}
            poster={active.replication.thumbnail_url}
            controls
            loop
            playsInline
            muted
            preload="metadata"
            onPlay={() => setUserPaused(false)}
            onPause={() => {
              // Our own visibility pause must not read as a reader verdict.
              if (programmaticPauseRef.current) {
                programmaticPauseRef.current = false;
                return;
              }
              setUserPaused(true);
            }}
            onVolumeChange={(event) => {
              mutedRef.current = event.currentTarget.muted;
            }}
            onLoadedMetadata={(event) => {
              const { videoWidth, videoHeight } = event.currentTarget;
              if (videoWidth > 0 && videoHeight > 0) {
                setProbedAspects((prev) =>
                  prev[active.replication.slug]
                    ? prev
                    : { ...prev, [active.replication.slug]: videoWidth / videoHeight },
                );
              }
            }}
            className="absolute inset-0 h-full w-full object-contain"
            style={scaleStyle}
          />
        ) : (
          <AppImage
            src={active.replication.url}
            alt={active.replication.title}
            width={width}
            height={height}
            priority
            sizes="100vw"
            className="absolute inset-0 h-full w-full object-contain"
            style={scaleStyle}
          />
        )}

        {/* Desktop paging chevrons. Real anchors so rel=prev/next and
            middle-click survive; a plain click stays client-side. Hidden
            below `sm`, where the vertical swipe owns the gesture. Absent at
            the ends: the walk is finite, not circular — reaching an end is
            how a reader knows they have seen the set. */}
        {previous ? (
          <a
            href={buildViewerPath(previous.replication.slug, setParam)}
            rel="prev"
            aria-label={`Previous: ${previous.replication.title}`}
            onClick={(event) => interceptNavigate(event, index - 1)}
            className={cn(viewerControlClassName, 'absolute left-3 top-1/2 hidden -translate-y-1/2 sm:grid')}
          >
            <Icon icon="lucide:chevron-left" className="size-6" />
          </a>
        ) : null}
        {next ? (
          <a
            href={buildViewerPath(next.replication.slug, setParam)}
            rel="next"
            aria-label={`Next: ${next.replication.title}`}
            onClick={(event) => interceptNavigate(event, index + 1)}
            className={cn(viewerControlClassName, 'absolute right-3 top-1/2 hidden -translate-y-1/2 sm:grid')}
          >
            <Icon icon="lucide:chevron-right" className="size-6" />
          </a>
        ) : null}

        {/* Fit/fill: bounded cover-crop versus the whole frame. */}
        <button
          type="button"
          onClick={toggleFit}
          aria-pressed={fitMode === 'fill'}
          aria-label={fitMode === 'fill' ? 'Fit the whole frame' : 'Fill the stage (crops the frame)'}
          className={cn(viewerControlClassName, 'absolute right-3 top-3')}
        >
          <Icon icon={fitMode === 'fill' ? 'lucide:shrink' : 'lucide:expand'} className="size-5" />
        </button>
      </section>

      {/* Warm the next item while the reader looks at this one: arriving on a
          loop that is already buffering is what makes prev/next feel like
          flipping pages rather than loading pages. Hidden and muted so it
          never competes with the active player for attention — one element,
          so the pipeline overhead stays bounded. */}
      {next ? (
        next.replication.type === 'video' ? (
          <video
            key={`preload-${next.replication.slug}`}
            src={next.replication.url}
            preload="auto"
            muted
            playsInline
            tabIndex={-1}
            aria-hidden
            className="hidden"
          />
        ) : (
          <link
            key={`preload-${next.replication.slug}`}
            rel="preload"
            as="image"
            href={next.replication.url}
          />
        )
      ) : null}

      {/* The filmstrip: the whole walk, visible. A strip of one thumbnail
          would advertise navigation that doesn't exist, so singleton sets
          show the stage alone. */}
      {walk.items.length > 1 ? (
        <nav aria-labelledby={SET_LABEL_ID} className="mx-auto w-full max-w-6xl px-4 pt-3 md:px-8">
          <div className="flex items-baseline justify-between gap-3">
            <p
              id={SET_LABEL_ID}
              className="theme-text-faint text-[0.6875rem] uppercase tracking-[0.18em]"
            >
              {describeViewerSet(walk)}
            </p>
            <p className="theme-text-faint text-xs tabular-nums">
              {index + 1} / {walk.items.length}
            </p>
          </div>

          <ul ref={stripRef} className="mt-2 flex snap-x gap-2 overflow-x-auto pb-2">
            {walk.items.map((item, itemIndex) => {
              const isActiveThumb = itemIndex === index;
              const isVideoThumb = item.replication.type === 'video';
              const thumbSrc = item.replication.thumbnail_url ?? item.replication.url;
              return (
                <li key={item.replication.slug} className="snap-start">
                  <a
                    href={buildViewerPath(item.replication.slug, setParam)}
                    aria-current={isActiveThumb ? 'true' : undefined}
                    data-active={isActiveThumb || undefined}
                    onClick={(event) => interceptNavigate(event, itemIndex)}
                    className={cn(
                      'relative block size-16 shrink-0 overflow-hidden rounded-lg border border-dose-border transition-opacity motion-reduce:transition-none',
                      focusRingClassName,
                      isActiveThumb
                        ? 'ring-2 ring-dose-accent-strong'
                        : 'opacity-75 hover:opacity-100',
                    )}
                  >
                    {isVideoThumb && !item.replication.thumbnail_url ? (
                      // A video row with no poster has no frame to thumbnail;
                      // pointing <img> at the video file renders nothing.
                      <span className="grid h-full w-full place-items-center bg-black/40">
                        <Icon icon="lucide:video" className="theme-text-faint size-5" />
                      </span>
                    ) : (
                      <AppImage
                        src={thumbSrc}
                        alt={item.replication.title}
                        width={96}
                        height={96}
                        className="h-full w-full object-cover"
                      />
                    )}
                    {isVideoThumb ? (
                      <span
                        aria-hidden
                        className="theme-media-tile-title absolute bottom-1 right-1 grid size-4 place-items-center rounded-full bg-black/55 backdrop-blur-sm"
                      >
                        <Icon icon="lucide:repeat" size={10} />
                      </span>
                    ) : null}
                  </a>
                </li>
              );
            })}
          </ul>
        </nav>
      ) : null}

      {/* Below the fold: subject, provenance, licence — everything a reuser
          or a rights-checker came for, driven by the *active* item so it
          never describes a work other than the one on the stage. */}
      <PublicContentShell as="div" width="standard" className="min-h-0 pb-0 pt-8">
        <ViewerMetadata item={active} />
      </PublicContentShell>
    </>
  );
}
