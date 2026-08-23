"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import { AppImage } from "@/components/common/AppImage";
import { focusRingClassName } from "@/components/ui/surface";
import { cn } from "@/lib/utils";
import { publicHref } from "@/utils/publicHref";
import { ReplicationMediaStage } from "./ReplicationMediaStage";
import {
  buildViewerPath,
  viewerDocumentTitle,
  type ViewerSetParam,
} from "./viewerLogic";
import {
  describeViewerSet,
  findViewerIndex,
  type ReplicationViewerSet,
} from "./viewerModel";
import { ViewerMetadata } from "./ViewerMetadata";

export interface ReplicationViewerProps {
  initialSlug: string;
  set: ReplicationViewerSet;
  initialSetParam?: ViewerSetParam | null;
}

/**
 * Detail-page presentation of the same media stage used by the collection
 * overlay. The page keeps permanent work URLs and full rights metadata; it no
 * longer owns a second playback or framing implementation.
 */
export function ReplicationViewer({
  initialSlug,
  set,
  initialSetParam = null,
}: ReplicationViewerProps) {
  const [activeSlug, setActiveSlug] = useState(initialSlug);
  const [muted, setMuted] = useState(true);
  const [volume, setVolume] = useState(1);
  const [fullFrame, setFullFrame] = useState(false);
  const [immersiveFallback, setImmersiveFallback] = useState(false);
  const stageShellRef = useRef<HTMLDivElement>(null);
  const stripRef = useRef<HTMLUListElement>(null);
  const index = Math.max(0, findViewerIndex(set, activeSlug));
  const active = set.items[index];
  const previous = index > 0 ? set.items[index - 1] : null;
  const next = index < set.items.length - 1 ? set.items[index + 1] : null;

  const goTo = useCallback(
    (targetIndex: number) => {
      const item = set.items[targetIndex];
      if (!item || item.replication.slug === activeSlug) return;
      setActiveSlug(item.replication.slug);
      window.history.pushState(
        { replicationDetail: true },
        "",
        buildViewerPath(item.replication.slug, initialSetParam),
      );
      document.title = viewerDocumentTitle(item);
    },
    [activeSlug, initialSetParam, set.items],
  );

  useEffect(() => {
    const onPopState = () => {
      const segments = window.location.pathname.split("/").filter(Boolean);
      const slug = decodeURIComponent(segments[segments.length - 1] ?? "");
      const restoredIndex = findViewerIndex(set, slug);
      if (restoredIndex >= 0) {
        const restored = set.items[restoredIndex];
        setActiveSlug(slug);
        if (restored) document.title = viewerDocumentTitle(restored);
      }
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [set]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey)
        return;
      const target = event.target as HTMLElement | null;
      if (
        target?.isContentEditable ||
        (target && /^(INPUT|TEXTAREA|SELECT|VIDEO|AUDIO)$/.test(target.tagName))
      ) {
        return;
      }
      const targetIndex = index + (event.key === "ArrowLeft" ? -1 : 1);
      if (targetIndex < 0 || targetIndex >= set.items.length) return;
      event.preventDefault();
      goTo(targetIndex);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [goTo, index, set.items.length]);

  useEffect(() => {
    const activeThumb = stripRef.current?.querySelector("[data-active]");
    activeThumb?.scrollIntoView?.({ inline: "center", block: "nearest" });
  }, [activeSlug]);

  if (!active) return null;

  const label =
    set.scope === "artist"
      ? set.scopeLabel
        ? `Works by ${set.scopeLabel}`
        : "Unattributed works"
      : set.scopeLabel
        ? `${set.scopeLabel} replications`
        : "Replications";
  const fullscreenSupported =
    typeof document !== "undefined" &&
    Boolean(document.documentElement.requestFullscreen);

  return (
    <>
      <header className="theme-page-canvas border-b border-dose-border px-4 py-4 md:px-8">
        <div className="mx-auto flex max-w-6xl items-center gap-4">
          <Link
            href={publicHref.replications()}
            className={cn(
              "theme-text-secondary rounded-full text-sm",
              focusRingClassName,
            )}
          >
            Back to replications
          </Link>
          <div className="min-w-0 flex-1 text-right">
            <p className="theme-text-faint truncate text-xs uppercase tracking-[0.16em]">
              {label}
            </p>
            <h1 className="theme-text-primary truncate font-display text-xl font-semibold">
              {active.replication.title}
            </h1>
            <div className="theme-text-muted mt-1 flex items-center justify-end gap-2 text-sm">
              {active.artistProfileHref || active.replication.artist_url ? (
                <a
                  href={
                    active.artistProfileHref ?? active.replication.artist_url
                  }
                  target={active.artistProfileHref ? undefined : "_blank"}
                  rel={
                    active.artistProfileHref ? undefined : "noopener noreferrer"
                  }
                  className={cn(
                    "inline-flex items-center gap-2 truncate underline decoration-current/40 underline-offset-2",
                    focusRingClassName,
                  )}
                >
                  {active.avatarUrl ? (
                    <AppImage
                      src={active.avatarUrl}
                      alt=""
                      width={24}
                      height={24}
                      className="size-6 rounded-full object-cover"
                    />
                  ) : null}
                  {active.replication.artist}
                </a>
              ) : (
                <span className="truncate">
                  {active.replication.artist || "Unattributed"}
                </span>
              )}
              <span aria-hidden>·</span>
              <span className="tabular-nums">
                {index + 1} / {set.items.length}
              </span>
            </div>
          </div>
        </div>
      </header>

      <div
        ref={stageShellRef}
        className={cn(
          "h-[70svh] min-h-[28rem] w-full bg-black xl:h-[76vh]",
          immersiveFallback &&
            "fixed inset-0 z-[70] h-[100svh] min-h-0 xl:h-[100svh]",
        )}
      >
        <ReplicationMediaStage
          item={active}
          muted={muted}
          volume={volume}
          fullFrame={fullFrame}
          onMutedChange={setMuted}
          onVolumeChange={setVolume}
          onFullFrameChange={setFullFrame}
          previousHref={
            previous
              ? buildViewerPath(previous.replication.slug, initialSetParam)
              : undefined
          }
          nextHref={
            next
              ? buildViewerPath(next.replication.slug, initialSetParam)
              : undefined
          }
          onPrevious={previous ? () => goTo(index - 1) : undefined}
          onNext={next ? () => goTo(index + 1) : undefined}
          onFullscreen={() => {
            if (stageShellRef.current?.requestFullscreen) {
              void stageShellRef.current.requestFullscreen();
              return;
            }
            setImmersiveFallback((current) => !current);
          }}
          fullscreenLabel={
            fullscreenSupported
              ? "Fullscreen"
              : immersiveFallback
                ? "Exit immersive view"
                : "Immersive view"
          }
          previousLabel={
            previous ? `Previous: ${previous.replication.title}` : "First work"
          }
          nextLabel={next ? `Next: ${next.replication.title}` : "Final work"}
        />
      </div>

      {set.items.length > 1 ? (
        <nav
          aria-label={describeViewerSet(set)}
          className="theme-page-canvas border-b border-dose-border px-4 py-3 md:px-8"
        >
          <ul
            ref={stripRef}
            className="mx-auto flex max-w-6xl snap-x gap-2 overflow-x-auto"
          >
            {set.items.map((item, itemIndex) => {
              const selected = itemIndex === index;
              const thumb =
                item.replication.motion_poster_url ??
                item.replication.thumbnail_url ??
                item.replication.url;
              return (
                <li key={item.replication.slug} className="snap-start">
                  <a
                    href={buildViewerPath(
                      item.replication.slug,
                      initialSetParam,
                    )}
                    aria-label={item.replication.title}
                    aria-current={selected ? "true" : undefined}
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
                      goTo(itemIndex);
                    }}
                    className={cn(
                      "relative block size-16 overflow-hidden rounded-lg border transition-opacity motion-reduce:transition-none",
                      selected
                        ? "border-dose-accent-strong ring-2 ring-dose-accent-strong"
                        : "border-dose-border opacity-70 hover:opacity-100",
                      focusRingClassName,
                    )}
                  >
                    <AppImage
                      src={thumb}
                      alt=""
                      width={96}
                      height={96}
                      unoptimized={
                        item.replication.format.toLowerCase() === "gif"
                      }
                      className="h-full w-full object-contain"
                    />
                  </a>
                </li>
              );
            })}
          </ul>
        </nav>
      ) : null}

      {"storage_id" in active.replication ? (
        <div className="theme-page-canvas px-4 py-8 md:px-8">
          <div className="mx-auto max-w-4xl">
            <ViewerMetadata
              item={{ ...active, replication: active.replication }}
            />
          </div>
        </div>
      ) : null}
    </>
  );
}
