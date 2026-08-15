"use client";

import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { AppImage } from "@/components/common/AppImage";
import { Icon } from "@/components/common/Icon";
import { MediaPlaceholder } from "@/components/layout/PublicFeedbackPrimitives";
import { PublicNameChip } from "@/components/common/PublicTokens";
import { focusRingClassName } from "@/components/ui/surface";
import { cn } from "@/lib/utils";
import { icons } from "@/utils/iconNames";
import { publicHref } from "@/utils/publicHref";
import { resolveRouteChromeIcon } from "@/utils/routeChromeIcons";
import type { ShowcaseWork } from "./showcaseModel";

/**
 * The autoplay gate's device half: a real fine pointer and no reduced-motion
 * preference. Touch readers and motion-sensitive readers get the poster +
 * tap-to-play path instead — same media-query discipline as the gallery
 * tiles' hover preview.
 */
function useAutoplayGateAllowed(): boolean {
  const [allowed, setAllowed] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const pointer = window.matchMedia("(pointer: fine)");
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setAllowed(pointer.matches && !motion.matches);
    update();
    pointer.addEventListener("change", update);
    motion.addEventListener("change", update);
    return () => {
      pointer.removeEventListener("change", update);
      motion.removeEventListener("change", update);
    };
  }, []);
  return allowed;
}

/**
 * The autoplay gate's viewport half. Where IntersectionObserver does not
 * exist the gate stays closed, which degrades to poster + play rather than
 * to a video looping off-screen.
 */
function useStageInView() {
  const ref = useRef<HTMLDivElement | null>(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const node = ref.current;
    if (!node || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      (entries) => setInView(entries.some((entry) => entry.isIntersecting)),
      { threshold: 0.25 },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  return { ref, inView };
}

/**
 * The crossfade: 240ms ease-out-quart between works. Reduced motion collapses
 * it to a short linear fade — an opacity-only change with no eased flourish —
 * and the gate above separately kills autoplay.
 */
const slideFadeClassName =
  "absolute inset-0 transition-opacity duration-[240ms] ease-[cubic-bezier(0.25,1,0.5,1)] motion-reduce:duration-100 motion-reduce:ease-linear";

/**
 * The round on-media control chip shared by arrows, pause, mute, and the +N
 * tile. Literal black + `--theme-text-on-media`, not surface tokens: the stage
 * below is a theme-invariant dark media well, so its chrome must not follow
 * the page theme either — the same reasoning as MediaTile's black scrim.
 */
const mediaControlClassName = cn(
  "grid flex-none place-items-center rounded-full bg-black/60 text-[color:var(--theme-text-on-media)]",
  "opacity-70 backdrop-blur-sm transition-opacity hover:opacity-100 focus-visible:opacity-100",
  "motion-reduce:transition-none",
  focusRingClassName,
);

interface ReplicationShowcaseProps {
  /** The visible works — the curated head, already capped by the caller. */
  works: readonly ShowcaseWork[];
  /** The full matched-corpus size; drives the "See all" / "+N" affordances. */
  totalCount?: number;
}

/**
 * The Replication Showcase: a height-capped 16:9 stage carrying every control
 * as a compact on-media overlay, rendered as the last child of the Subjective
 * Effects visual group. Figure scale, not hero scale: callers cap `works`
 * (SHOWCASE_WORK_CAP) and the rail closes with a "+N" gallery link.
 *
 * Overlay anatomy — none of it changes the stage's shape or size:
 *  - top scrim: title (→ permalink), artist (→ profile / own site), the
 *    demonstrated effect chip, and the rights glyph;
 *  - mid rails: wrap-around previous/next arrows, far left and right;
 *  - bottom scrim: the manual-activation thumbnail tablist plus the video
 *    controls (pause and mute/unmute) on the right.
 *
 * Selection is static — no auto-advance timer; the only motion loop is the
 * active video itself, under the autoplay gate (in viewport ∧ fine pointer ∧
 * motion-ok) unless the reader's own play/pause verdict overrides it. Videos
 * always start muted; unmuting is an explicit gesture, so the article never
 * makes sound on its own. Media is letterboxed with `object-contain`, never
 * cropped: a replication's composition is the content.
 */
export function ReplicationShowcase({ works, totalCount }: ReplicationShowcaseProps) {
  const baseId = useId();
  const [activeIndex, setActiveIndex] = useState(0);
  /**
   * The reader's explicit play/pause verdict for one work; it outranks the
   * autoplay gate in both directions until the selection changes.
   */
  const [playOverride, setPlayOverride] = useState<{
    slug: string;
    playing: boolean;
  } | null>(null);
  /**
   * Sound is a showcase-wide verdict rather than a per-work one: a reader who
   * unmutes wants to hear the next animation too. Autoplay itself is always
   * muted until this flips.
   */
  const [muted, setMuted] = useState(true);
  const [liveMessage, setLiveMessage] = useState("");
  const autoplayAllowed = useAutoplayGateAllowed();
  const { ref: stageRef, inView } = useStageInView();
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);

  if (works.length === 0) return null;

  const count = works.length;
  const total = totalCount ?? count;
  const clampedIndex = Math.min(activeIndex, count - 1);
  const active = works[clampedIndex];
  const stageId = `${baseId}-stage`;
  const tabId = `${baseId}-tab`;
  const autoplayGateOpen = autoplayAllowed && inView;
  const activeIsVideo = active.type === "video";
  const activePlaying =
    activeIsVideo &&
    (playOverride?.slug === active.slug ? playOverride.playing : autoplayGateOpen);

  const activate = (index: number) => {
    setActiveIndex(index);
    setPlayOverride(null);
    const work = works[index];
    setLiveMessage(
      `Replication ${index + 1} of ${count}: ${work.title}, demonstrates ${work.effectName}`,
    );
    tabRefs.current[index]?.scrollIntoView?.({
      inline: "nearest",
      block: "nearest",
      behavior: window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
        ? "auto"
        : "smooth",
    });
  };

  /**
   * Horizontal swipe on the stage: left → next work, right → previous.
   * Recognised only when the gesture is decisively horizontal (1.5× the
   * vertical travel) and long enough (48px) that vertical page scrolling and
   * plain taps on the overlaid controls never mis-trigger it.
   */
  const swipeStart = useRef<{ x: number; y: number } | null>(null);
  const handleTouchStart = (event: React.TouchEvent) => {
    const touch = event.touches[0];
    swipeStart.current = { x: touch.clientX, y: touch.clientY };
  };
  const handleTouchEnd = (event: React.TouchEvent) => {
    const start = swipeStart.current;
    swipeStart.current = null;
    if (!start || count < 2) return;
    const touch = event.changedTouches[0];
    const dx = touch.clientX - start.x;
    const dy = touch.clientY - start.y;
    if (Math.abs(dx) < 48 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
    activate(dx < 0 ? (clampedIndex + 1) % count : (clampedIndex - 1 + count) % count);
  };

  /** Manual-activation tablist: arrows/Home/End move focus, Enter/Space activates. */
  const handleTabKeyDown = (
    event: React.KeyboardEvent<HTMLButtonElement>,
    index: number,
  ) => {
    let target: number | null = null;
    if (event.key === "ArrowRight") target = (index + 1) % count;
    else if (event.key === "ArrowLeft") target = (index - 1 + count) % count;
    else if (event.key === "Home") target = 0;
    else if (event.key === "End") target = count - 1;

    if (target !== null) {
      event.preventDefault();
      tabRefs.current[target]?.focus();
      return;
    }
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      activate(index);
    }
  };

  /**
   * Pause and mute/unmute for the active video, overlaid on the stage's
   * bottom-right corner in every context — on phones the info and thumb rows
   * leave the media, but transport controls belong on the thing they control.
   */
  const videoControls = activeIsVideo && activePlaying ? (
    <div className="absolute bottom-2 right-2 z-10 flex items-center gap-1.5">
      <button
        type="button"
        aria-label={muted ? `Unmute ${active.title}` : `Mute ${active.title}`}
        onClick={() => setMuted((value) => !value)}
        className={cn(mediaControlClassName, "size-8")}
      >
        <Icon icon={muted ? "lucide:volume-x" : "lucide:volume-2"} size={15} />
      </button>
      <button
        type="button"
        aria-label={`Pause ${active.title}`}
        onClick={() => {
          setPlayOverride({ slug: active.slug, playing: false });
          setLiveMessage(`Paused ${active.title}`);
        }}
        className={cn(mediaControlClassName, "size-8")}
      >
        <Icon icon="lucide:pause" size={15} className="fill-current" />
      </button>
    </div>
  ) : null;

  return (
    <section aria-label="Replications" className="space-y-2">
      {/* No count or "See all" here: the rail's +N tile already says how much
          more exists and is the gallery link. */}
      <span className="theme-text-secondary inline-flex items-center gap-1.5 text-sm font-semibold">
        <Icon
          icon={resolveRouteChromeIcon("replications")}
          size={16}
          className="self-center"
          aria-hidden
        />
        Replications
      </span>

      {/* One dark media card. On phones the on-media chrome leaves the
          artwork entirely: the info row sits above the media and the thumb
          band below it, as compact card rows. From `sm` up both float over
          the stage as scrim overlays (absolute positioning ignores the DOM
          order, which is kept caption-first for readers). */}
      <div className="border-dose-border relative overflow-hidden rounded-2xl border bg-[oklch(0.14_0.024_318)]">
        {/* Title, artist, demonstrated effect, rights — compact, spread
            across the card's width, never resizing the media. */}
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-0.5 px-2.5 py-1.5 sm:gap-y-1 sm:px-3 sm:pb-7 sm:pt-2 sm:pointer-events-none sm:absolute sm:inset-x-0 sm:top-0 sm:z-10 sm:bg-gradient-to-b sm:from-black/75 sm:via-black/35 sm:to-transparent">
          <div className="flex min-w-0 flex-wrap items-baseline gap-x-2">
            <Link
              href={publicHref.replication(active.slug)}
              className={cn(
                "theme-media-tile-title pointer-events-auto inline-flex min-w-0 items-center gap-1 text-[13px] font-semibold leading-tight sm:text-sm",
                "transition-opacity hover:opacity-80",
                focusRingClassName,
              )}
            >
              <span className="truncate">{active.title}</span>
              <Icon
                icon="lucide:arrow-up-right"
                size={12}
                className="theme-media-tile-creator shrink-0"
                aria-hidden
              />
            </Link>
            {active.artistName ? (
              <span className="theme-media-tile-creator min-w-0 truncate text-[11px] sm:text-xs">
                by{" "}
                {active.artistHref ? (
                  active.artistHrefExternal ? (
                    <a
                      href={active.artistHref}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={cn(
                        "pointer-events-auto underline decoration-current/40 underline-offset-2",
                        "transition-opacity hover:opacity-80",
                        focusRingClassName,
                      )}
                    >
                      {active.artistName}
                    </a>
                  ) : (
                    <Link
                      href={active.artistHref}
                      className={cn(
                        "pointer-events-auto underline decoration-current/40 underline-offset-2",
                        "transition-opacity hover:opacity-80",
                        focusRingClassName,
                      )}
                    >
                      {active.artistName}
                    </Link>
                  )
                ) : (
                  active.artistName
                )}
              </span>
            ) : (
              <span className="theme-media-tile-creator text-[11px] sm:text-xs">{active.byline}</span>
            )}
          </div>
          <div className="flex flex-none items-center gap-2">
            <PublicNameChip
              as={Link}
              href={publicHref.effect(active.effectSlug)}
              interactive
              icon={icons.subjectiveEffectIndex}
              aria-label={`Demonstrates: ${active.effectName}`}
              className="pointer-events-auto max-sm:px-2 max-sm:py-0.5 max-sm:text-[11px] sm:px-2.5 sm:py-1"
            >
              {active.effectName}
            </PublicNameChip>
          </div>
        </div>
      <div
        ref={stageRef}
        role="tabpanel"
        id={stageId}
        aria-labelledby={count > 1 ? `${tabId}-${clampedIndex}` : undefined}
        aria-label={count > 1 ? undefined : active.title}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        className="relative aspect-video max-h-[380px] w-full touch-pan-y"
      >
        {works.map((work, index) => {
          const isActive = index === clampedIndex;
          const isVideo = work.type === "video";
          const posterUrl = isVideo ? work.thumbnailUrl : work.url;
          const playing = isVideo && isActive && activePlaying;

          return (
            <div
              key={work.slug}
              aria-hidden={!isActive}
              className={cn(
                slideFadeClassName,
                isActive ? "opacity-100" : "pointer-events-none opacity-0",
              )}
            >
              {posterUrl ? (
                <AppImage
                  src={posterUrl}
                  alt={work.title}
                  width={1280}
                  height={800}
                  className="absolute inset-0 h-full w-full object-contain"
                />
              ) : (
                <MediaPlaceholder
                  icon={isVideo ? "lucide:play" : "lucide:image"}
                  title={work.title}
                />
              )}

              {playing ? (
                // The corpus is abstract visual loops with ambient audio at
                // most; no caption tracks exist, and the work's title, effect,
                // and credit are all announced through the surrounding overlay.
                // eslint-disable-next-line jsx-a11y/media-has-caption
                <video
                  src={work.url}
                  poster={work.thumbnailUrl}
                  ref={(element) => {
                    // React's `muted` prop does not reliably reach the DOM
                    // attribute; the property write is what the browser obeys.
                    if (element) element.muted = muted;
                  }}
                  autoPlay
                  muted={muted}
                  loop
                  playsInline
                  preload="none"
                  className="absolute inset-0 h-full w-full object-contain"
                />
              ) : null}

              {isVideo && isActive && !playing ? (
                <div className="absolute inset-0 grid place-items-center bg-black/40">
                  <button
                    type="button"
                    aria-label={`Play ${work.title}`}
                    onClick={() => {
                      setPlayOverride({ slug: work.slug, playing: true });
                      setLiveMessage(`Playing ${work.title}`);
                    }}
                    className={cn(
                      "grid size-14 place-items-center rounded-full bg-black/60 text-[color:var(--theme-text-on-media)]",
                      "backdrop-blur-sm transition-opacity hover:opacity-85",
                      "motion-reduce:transition-none",
                      focusRingClassName,
                    )}
                  >
                    <Icon icon="lucide:play" size={24} className="fill-current" />
                  </button>
                </div>
              ) : null}
            </div>
          );
        })}

        {count > 1 ? (
          <>
            <button
              type="button"
              aria-label="Previous replication"
              onClick={() => activate((clampedIndex - 1 + count) % count)}
              className={cn(
                mediaControlClassName,
                "absolute left-2 top-1/2 size-8 -translate-y-1/2 max-sm:hidden",
              )}
            >
              <Icon icon={icons.chevronLeft} size={18} aria-hidden />
            </button>
            <button
              type="button"
              aria-label="Next replication"
              onClick={() => activate((clampedIndex + 1) % count)}
              className={cn(
                mediaControlClassName,
                "absolute right-2 top-1/2 size-8 -translate-y-1/2 max-sm:hidden",
              )}
            >
              <Icon icon={icons.chevronRight} size={18} aria-hidden />
            </button>
          </>
        ) : null}
        {videoControls}
      </div>

        {/* The thumbnail rail: below the media on phones, a bottom scrim
            overlay from `sm` up. */}
        {count > 1 ? (
          <div className="flex items-end gap-2 px-2 pb-2 pt-1 sm:pointer-events-none sm:absolute sm:inset-x-0 sm:bottom-0 sm:bg-gradient-to-t sm:from-black/75 sm:via-black/35 sm:to-transparent sm:pt-8">
            <div
              className={cn(
                "pointer-events-auto flex min-w-0 flex-1 snap-x snap-mandatory items-center gap-1.5 overflow-x-auto px-0.5 py-0.5",
                // Keep scrolled thumbs from sliding under the overlaid video
                // controls where the band and the stage corner coincide.
                videoControls ? "sm:pr-20" : undefined,
              )}
            >
                <div role="tablist" aria-label="Replications" className="flex gap-1.5">
                  {works.map((work, index) => {
                    const selected = index === clampedIndex;
                    const thumbUrl = work.type === "video" ? work.thumbnailUrl : work.url;
                    return (
                      <button
                        key={work.slug}
                        ref={(element) => {
                          tabRefs.current[index] = element;
                        }}
                        type="button"
                        role="tab"
                        id={`${tabId}-${index}`}
                        aria-selected={selected}
                        aria-controls={stageId}
                        aria-label={`${work.title} — demonstrates ${work.effectName}, ${work.byline}`}
                        tabIndex={selected ? 0 : -1}
                        onClick={() => activate(index)}
                        onKeyDown={(event) => handleTabKeyDown(event, index)}
                        className={cn(
                          "relative size-9 flex-none snap-start overflow-hidden rounded-md border pointer-coarse:size-11",
                          "transition-opacity duration-150 motion-reduce:transition-none",
                          focusRingClassName,
                          selected
                            ? "border-dose-accent-strong ring-dose-accent-strong opacity-100 ring-1"
                            : "border-white/20 opacity-70 hover:opacity-100 focus-visible:opacity-100",
                        )}
                      >
                        {thumbUrl ? (
                          <AppImage
                            src={thumbUrl}
                            alt=""
                            width={128}
                            height={128}
                            className="absolute inset-0 h-full w-full object-cover"
                          />
                        ) : (
                          <span className="theme-media-tile-creator absolute inset-0 grid place-items-center">
                            <Icon
                              icon={work.type === "video" ? "lucide:play" : "lucide:image"}
                              size={14}
                            />
                          </span>
                        )}
                        {work.type === "video" ? (
                          <span className="absolute bottom-0.5 right-0.5 grid size-3.5 place-items-center rounded-full bg-black/60 text-[color:var(--theme-text-on-media)]">
                            <Icon icon="lucide:play" size={8} className="fill-current" />
                          </span>
                        ) : null}
                      </button>
                    );
                  })}
                </div>
                {total > count ? (
                  <Link
                    href="/replications"
                    aria-label={`${total - count} more replications in the gallery`}
                    className={cn(
                      "grid size-9 flex-none snap-start place-items-center rounded-md pointer-coarse:size-11",
                      "bg-black/60 text-[11px] font-semibold tabular-nums text-[color:var(--theme-text-on-media)]",
                      "opacity-70 backdrop-blur-sm transition-opacity hover:opacity-100 focus-visible:opacity-100",
                      focusRingClassName,
                    )}
                  >
                    +{total - count}
                  </Link>
                ) : null}
              </div>
          </div>
        ) : null}
      </div>

      <div aria-live="polite" role="status" className="sr-only">
        {liveMessage}
      </div>
    </section>
  );
}
