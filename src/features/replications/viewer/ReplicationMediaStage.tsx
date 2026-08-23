"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { Icon } from "@/components/common/Icon";
import { focusRingClassName } from "@/components/ui/surface";
import { cn } from "@/lib/utils";
import type { ReplicationViewerMediaItem } from "./viewerModel";
import { useStageFit } from "./useStageFit";
import { ReplicationStillStage } from "./ReplicationStillStage";
import { shouldLoopReplicationMotion } from "./viewerLogic";

const controlClassName = cn(
  "theme-media-tile-title grid size-11 flex-none place-items-center rounded-full bg-black/65 backdrop-blur-sm",
  "transition-opacity hover:opacity-100 active:opacity-100 motion-reduce:transition-none",
  focusRingClassName,
);

function reducedMotionRequested(): boolean {
  return (
    typeof window !== "undefined" &&
    Boolean(window.matchMedia) &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(reducedMotionRequested);
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  return reduced;
}

function browserRequestsDataSaving(): boolean {
  if (typeof navigator === "undefined") return false;
  const connection = (
    navigator as Navigator & { connection?: { saveData?: boolean } }
  ).connection;
  return connection?.saveData === true;
}

export interface ReplicationMediaStageProps {
  item: ReplicationViewerMediaItem;
  muted: boolean;
  volume: number;
  fullFrame: boolean;
  onMutedChange: (muted: boolean) => void;
  onVolumeChange: (volume: number) => void;
  onFullFrameChange: (fullFrame: boolean) => void;
  previousHref?: string;
  nextHref?: string;
  onPrevious?: () => void;
  onNext?: () => void;
  onInfo?: () => void;
  onFullscreen?: () => void;
  fullscreenLabel?: string;
  previousLabel?: string;
  nextLabel?: string;
  className?: string;
}

export function ReplicationMediaStage({
  item,
  muted,
  volume,
  fullFrame,
  onMutedChange,
  onVolumeChange,
  onFullFrameChange,
  onPrevious,
  onNext,
  previousHref,
  nextHref,
  onInfo,
  onFullscreen,
  fullscreenLabel = "Fullscreen",
  previousLabel = "Previous work",
  nextLabel = "Next work",
  className,
}: ReplicationMediaStageProps) {
  const replication = item.replication;
  const gifLike = replication.format.toLowerCase() === "gif";
  const motionSource = gifLike ? replication.motion_url : replication.url;
  const moving =
    replication.type === "video" ||
    (gifLike && Boolean(replication.motion_url));
  const hasSafeGifFallback = gifLike && !replication.motion_url;
  const poster = gifLike
    ? (replication.motion_poster_url ?? replication.thumbnail_url)
    : replication.thumbnail_url;
  const stageRef = useRef<HTMLElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const hideTimerRef = useRef<number | undefined>(undefined);
  const reducedMotion = useReducedMotion();
  const [playing, setPlaying] = useState(false);
  const [ended, setEnded] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [error, setError] = useState(false);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [measuredDuration, setMeasuredDuration] = useState<number | null>(null);
  const { canEnlarge, scaleStyle, toggleFit, probeAspect } = useStageFit({
    stageRef,
    mediaKey: replication.slug,
    type: replication.type,
    moving,
    width: replication.width,
    height: replication.height,
    fullFrame,
    onFullFrameChange,
  });
  const knownDuration = replication.duration ?? measuredDuration;
  const shouldLoop = shouldLoopReplicationMotion(
    replication.format,
    knownDuration,
  );
  const autoplayAllowed = !reducedMotion && !browserRequestsDataSaving();

  const scheduleControlHide = useCallback(() => {
    window.clearTimeout(hideTimerRef.current);
    hideTimerRef.current = window.setTimeout(
      () => setControlsVisible(false),
      2600,
    );
  }, []);

  const showControls = useCallback(() => {
    setControlsVisible(true);
    const video = videoRef.current;
    if (!moving || (video && !video.paused && !video.ended)) {
      scheduleControlHide();
    } else {
      window.clearTimeout(hideTimerRef.current);
    }
  }, [moving, scheduleControlHide]);

  const toggleStillControls = useCallback(() => {
    setControlsVisible((current) => {
      window.clearTimeout(hideTimerRef.current);
      if (!current) scheduleControlHide();
      return !current;
    });
  }, [scheduleControlHide]);

  useEffect(() => {
    return () => window.clearTimeout(hideTimerRef.current);
  }, []);

  useEffect(() => {
    if (!moving) showControls();
  }, [moving, replication.slug, showControls]);

  useEffect(() => {
    setEnded(false);
    setBlocked(false);
    setError(false);
    setPlaying(false);
    setMeasuredDuration(null);
    setControlsVisible(true);
  }, [replication.slug]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = muted;
    video.volume = volume;
  }, [muted, volume, replication.slug]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (!autoplayAllowed) {
      if (!video.paused) video.pause();
      return;
    }
    const attempt = video.play();
    if (attempt) {
      void attempt.catch(() => {
        setBlocked(true);
        setPlaying(false);
        setControlsVisible(true);
      });
    }
  }, [autoplayAllowed, replication.slug]);

  const togglePlayback = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    showControls();
    if (video.paused || video.ended) {
      setEnded(false);
      const attempt = video.play();
      if (attempt) {
        void attempt.catch(() => {
          setBlocked(true);
          setPlaying(false);
        });
      }
    } else {
      video.pause();
    }
  }, [showControls]);

  const width = replication.width ?? 1600;
  const height = replication.height ?? Math.round(width / (4 / 3));
  const transportVisible = moving
    ? controlsVisible || !playing || ended || blocked || error
    : controlsVisible;
  const showWorkNavigation = Boolean(
    previousHref || nextHref || onPrevious || onNext,
  );

  return (
    <section
      ref={stageRef}
      aria-label={`${replication.title} media`}
      data-controls-visible={transportVisible || undefined}
      onPointerMove={showControls}
      onFocusCapture={showControls}
      className={cn(
        "relative h-full min-h-[22rem] w-full overflow-hidden bg-black",
        className,
      )}
    >
      {moving && motionSource ? (
        // Replications are non-verbal visual artworks; title, effect, creator,
        // and rights context are exposed by the surrounding viewer.
        // eslint-disable-next-line jsx-a11y/media-has-caption
        <video
          key={replication.slug}
          ref={videoRef}
          src={motionSource}
          poster={poster}
          muted={muted}
          loop={shouldLoop}
          playsInline
          preload="metadata"
          onClick={togglePlayback}
          onLoadedMetadata={(event) => {
            const video = event.currentTarget;
            probeAspect(video.videoWidth, video.videoHeight);
            if (Number.isFinite(video.duration))
              setMeasuredDuration(video.duration);
            video.volume = volume;
            video.muted = muted;
          }}
          onPlay={() => {
            setPlaying(true);
            setBlocked(false);
            showControls();
          }}
          onPause={() => {
            setPlaying(false);
            setControlsVisible(true);
          }}
          onEnded={() => {
            setPlaying(false);
            setEnded(true);
            setControlsVisible(true);
          }}
          onError={() => {
            setError(true);
            setPlaying(false);
            setControlsVisible(true);
          }}
          className="absolute inset-0 h-full w-full object-contain transition-transform duration-200 motion-reduce:transition-none"
          style={scaleStyle}
        />
      ) : hasSafeGifFallback ? (
        poster ? (
          <ReplicationStillStage
            src={poster}
            alt={replication.title}
            width={width}
            height={height}
            controlsVisible={controlsVisible}
            onToggleControls={toggleStillControls}
          />
        ) : (
          <div className="theme-media-tile-creator absolute inset-0 grid place-items-center px-8 text-center text-sm">
            Animation unavailable until its controllable rendition is ready.
          </div>
        )
      ) : (
        <ReplicationStillStage
          src={replication.url}
          alt={replication.title}
          width={width}
          height={height}
          controlsVisible={controlsVisible}
          onToggleControls={toggleStillControls}
        />
      )}

      {error ? (
        <div
          role="alert"
          className="theme-media-tile-title absolute inset-x-6 top-1/2 -translate-y-1/2 rounded-lg bg-black/80 p-4 text-center text-sm"
        >
          This media could not be loaded. You can still open information or
          continue browsing.
        </div>
      ) : null}

      <div
        className={cn(
          "pointer-events-none absolute inset-0 flex flex-col justify-between p-3 transition-opacity duration-200 motion-reduce:transition-none sm:p-4",
          transportVisible
            ? "opacity-100"
            : "opacity-0 [&_*]:!pointer-events-none",
        )}
      >
        <div className="flex justify-end gap-2">
          {canEnlarge ? (
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                toggleFit();
              }}
              className={cn(
                controlClassName,
                "pointer-events-auto w-auto px-3 text-xs font-semibold",
              )}
            >
              {fullFrame ? "Slightly larger" : "Full frame"}
            </button>
          ) : null}
          {onInfo ? (
            <button
              type="button"
              aria-label="Show information"
              onClick={(event) => {
                event.stopPropagation();
                onInfo();
              }}
              className={cn(controlClassName, "pointer-events-auto")}
            >
              <Icon icon="lucide:info" className="size-5" />
            </button>
          ) : null}
          {onFullscreen ? (
            <button
              type="button"
              aria-label={fullscreenLabel}
              onClick={(event) => {
                event.stopPropagation();
                onFullscreen();
              }}
              className={cn(controlClassName, "pointer-events-auto")}
            >
              <Icon icon="lucide:maximize" className="size-5" />
            </button>
          ) : null}
        </div>

        <div
          className={cn(
            "flex items-center gap-3",
            showWorkNavigation ? "justify-between" : "justify-center",
          )}
        >
          {showWorkNavigation ? (
            previousHref && onPrevious ? (
              <a
                href={previousHref}
                rel="prev"
                aria-label={previousLabel}
                onClick={(event) => {
                  if (
                    event.button !== 0 ||
                    event.metaKey ||
                    event.ctrlKey ||
                    event.shiftKey ||
                    event.altKey
                  ) {
                    return;
                  }
                  event.preventDefault();
                  onPrevious();
                }}
                className={cn(controlClassName, "pointer-events-auto")}
              >
                <Icon icon="lucide:chevron-left" className="size-6" />
              </a>
            ) : (
              <button
                type="button"
                aria-label={previousLabel}
                disabled={!onPrevious}
                onClick={(event) => {
                  event.stopPropagation();
                  onPrevious?.();
                }}
                className={cn(
                  controlClassName,
                  "pointer-events-auto disabled:cursor-not-allowed disabled:opacity-30",
                )}
              >
                <Icon icon="lucide:chevron-left" className="size-6" />
              </button>
            )
          ) : null}

          <div className="theme-media-tile-title pointer-events-auto flex items-center gap-2 rounded-full bg-black/65 px-2 py-1.5 backdrop-blur-sm">
            {moving ? (
              <>
                <button
                  type="button"
                  aria-label={playing ? "Pause" : ended ? "Replay" : "Play"}
                  onClick={(event) => {
                    event.stopPropagation();
                    togglePlayback();
                  }}
                  className={cn(
                    "grid size-9 place-items-center rounded-full",
                    focusRingClassName,
                  )}
                >
                  <Icon
                    icon={
                      playing
                        ? "lucide:pause"
                        : ended
                          ? "lucide:rotate-ccw"
                          : "lucide:play"
                    }
                    className="size-5"
                  />
                </button>
                <button
                  type="button"
                  aria-label={muted ? "Unmute" : "Mute"}
                  onClick={(event) => {
                    event.stopPropagation();
                    onMutedChange(!muted);
                  }}
                  className={cn(
                    "grid size-9 place-items-center rounded-full",
                    focusRingClassName,
                  )}
                >
                  <Icon
                    icon={muted ? "lucide:volume-x" : "lucide:volume-2"}
                    className="size-5"
                  />
                </button>
                <label
                  className="sr-only"
                  htmlFor={`replication-volume-${replication.slug}`}
                >
                  Volume
                </label>
                <input
                  id={`replication-volume-${replication.slug}`}
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={volume}
                  onChange={(event) =>
                    onVolumeChange(Number(event.currentTarget.value))
                  }
                  className="hidden w-24 accent-white sm:block"
                />
              </>
            ) : (
              <span className="px-2 text-xs font-medium">Still image</span>
            )}
          </div>

          {showWorkNavigation ? (
            nextHref && onNext ? (
              <a
                href={nextHref}
                rel="next"
                aria-label={nextLabel}
                onClick={(event) => {
                  if (
                    event.button !== 0 ||
                    event.metaKey ||
                    event.ctrlKey ||
                    event.shiftKey ||
                    event.altKey
                  ) {
                    return;
                  }
                  event.preventDefault();
                  onNext();
                }}
                className={cn(controlClassName, "pointer-events-auto")}
              >
                <Icon icon="lucide:chevron-right" className="size-6" />
              </a>
            ) : (
              <button
                type="button"
                aria-label={nextLabel}
                disabled={!onNext}
                onClick={(event) => {
                  event.stopPropagation();
                  onNext?.();
                }}
                className={cn(
                  controlClassName,
                  "pointer-events-auto disabled:cursor-not-allowed disabled:opacity-30",
                )}
              >
                <Icon icon="lucide:chevron-right" className="size-6" />
              </button>
            )
          ) : null}
        </div>
      </div>
    </section>
  );
}
