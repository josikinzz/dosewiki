"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { AppImage } from "@/components/common/AppImage";
import { Icon } from "@/components/common/Icon";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { focusRingClassName } from "@/components/ui/surface";
import {
  buildReplicationViewerUrl,
  closeReplicationViewerUrl,
  parseReplicationViewerSlug,
} from "@/features/replications/galleryUrlState";
import { cn } from "@/lib/utils";
import { publicHref } from "@/utils/publicHref";
import { ReplicationMediaStage } from "./ReplicationMediaStage";
import {
  findViewerPosition,
  moveViewerGroup,
  moveViewerWork,
  type ReplicationViewerCollection,
  type ReplicationViewerPosition,
} from "./viewerModel";

const SWIPE_THRESHOLD_PX = 48;
const SCREEN_EDGE_GUARD_PX = 24;

interface PublicReplicationDetails {
  slug: string;
  format: string;
  duration?: number;
  width?: number;
  height?: number;
  rights?: {
    status?: string;
    license_name?: string;
    source_url?: string;
    rightsholder?: string;
  };
}

export interface ReplicationViewerOverlayProps {
  collection: ReplicationViewerCollection;
  initialSlug: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ReplicationViewerOverlay({
  collection,
  initialSlug,
  open,
  onOpenChange,
}: ReplicationViewerOverlayProps) {
  const initialPosition = useMemo(
    () => findViewerPosition(collection, initialSlug),
    [collection, initialSlug],
  );
  const [position, setPosition] = useState<ReplicationViewerPosition | null>(
    initialPosition,
  );
  const [muted, setMuted] = useState(true);
  const [volume, setVolume] = useState(1);
  const [fullFrame, setFullFrame] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);
  const [details, setDetails] = useState<PublicReplicationDetails | null>(null);
  const [immersiveFallback, setImmersiveFallback] = useState(false);
  const rememberedSlugByGroupRef = useRef<Record<string, string>>({});
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  const group = position ? collection.groups[position.groupIndex] : null;
  const active = group && position ? group.items[position.itemIndex] : null;

  useEffect(() => {
    const next = findViewerPosition(collection, initialSlug);
    setPosition(next);
    setInfoOpen(false);
    setDetails(null);
  }, [collection, initialSlug]);

  useEffect(() => {
    if (!open || !active) return;
    rememberedSlugByGroupRef.current[group!.key] = active.replication.slug;
  }, [active, group, open]);

  useEffect(() => {
    if (!open) {
      setMuted(true);
      setVolume(1);
      setFullFrame(false);
      setInfoOpen(false);
      setImmersiveFallback(false);
      rememberedSlugByGroupRef.current = {};
    }
  }, [open]);

  const navigate = useCallback(
    (next: ReplicationViewerPosition | null) => {
      if (!next) return;
      const nextItem =
        collection.groups[next.groupIndex]?.items[next.itemIndex];
      if (!nextItem) return;
      setPosition(next);
      setInfoOpen(false);
      setDetails(null);
      const source = `${window.location.pathname}${window.location.search}${window.location.hash}`;
      window.history.replaceState(
        window.history.state,
        "",
        buildReplicationViewerUrl(source, nextItem.replication.slug),
      );
    },
    [collection],
  );

  const previousWork = position
    ? moveViewerWork(collection, position, -1)
    : null;
  const nextWork = position ? moveViewerWork(collection, position, 1) : null;
  const previousGroup = position
    ? moveViewerGroup(
        collection,
        position,
        -1,
        rememberedSlugByGroupRef.current,
      )
    : null;
  const nextGroup = position
    ? moveViewerGroup(collection, position, 1, rememberedSlugByGroupRef.current)
    : null;

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey)
        return;
      const target = event.target as HTMLElement | null;
      if (
        target?.isContentEditable ||
        (target && /^(INPUT|TEXTAREA|SELECT|VIDEO|AUDIO)$/.test(target.tagName))
      ) {
        return;
      }
      const next =
        event.key === "ArrowLeft"
          ? previousWork
          : event.key === "ArrowRight"
            ? nextWork
            : event.key === "ArrowUp"
              ? previousGroup
              : event.key === "ArrowDown"
                ? nextGroup
                : null;
      if (!next) return;
      event.preventDefault();
      navigate(next);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [navigate, nextGroup, nextWork, open, previousGroup, previousWork]);

  useEffect(() => {
    if (!open) return;
    const onPopState = () => {
      const slug = parseReplicationViewerSlug(
        new URLSearchParams(window.location.search),
      );
      if (!slug) {
        onOpenChange(false);
        return;
      }
      const restored = findViewerPosition(collection, slug);
      if (restored) setPosition(restored);
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [collection, onOpenChange, open]);

  useEffect(() => {
    if (!infoOpen || !active) return;
    const controller = new AbortController();
    void fetch(`/api/v1/replications/${active.replication.slug}`, {
      signal: controller.signal,
    })
      .then((response) => (response.ok ? response.json() : null))
      .then((body) => {
        if (body?.data?.slug === active.replication.slug) {
          setDetails(body.data as PublicReplicationDetails);
        }
      })
      .catch(() => {});
    return () => controller.abort();
  }, [active, infoOpen]);

  const close = useCallback(() => {
    const finish = () => {
      if (window.history.state?.replicationViewer === true) {
        window.history.back();
      } else {
        const source = `${window.location.pathname}${window.location.search}${window.location.hash}`;
        window.history.replaceState(
          window.history.state,
          "",
          closeReplicationViewerUrl(source),
        );
        onOpenChange(false);
      }
    };

    if (document.fullscreenElement && document.exitFullscreen) {
      void document.exitFullscreen().finally(finish);
    } else {
      finish();
    }
  }, [onOpenChange]);

  const fullscreenSupported =
    typeof document !== "undefined" &&
    Boolean(document.documentElement.requestFullscreen);
  const requestFullscreen = useCallback(() => {
    const content = contentRef.current;
    if (content?.requestFullscreen) {
      void content.requestFullscreen().catch(() => setImmersiveFallback(true));
      return;
    }
    const video = content?.querySelector("video") as
      | (HTMLVideoElement & { webkitEnterFullscreen?: () => void })
      | null;
    if (video?.webkitEnterFullscreen) {
      video.webkitEnterFullscreen();
      return;
    }
    setImmersiveFallback(true);
  }, []);

  if (!active || !position || !group) return null;

  const workPosition = `${position.itemIndex + 1} of ${group.items.length}`;
  const groupPosition =
    collection.groups.length > 1
      ? `${position.groupIndex + 1} of ${collection.groups.length}`
      : null;

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) close();
      }}
    >
      <DialogContent
        ref={contentRef}
        showClose={false}
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          contentRef.current?.focus();
        }}
        onTouchStart={(event) => {
          const touch = event.changedTouches[0];
          if (
            touch.clientX <= SCREEN_EDGE_GUARD_PX ||
            touch.clientX >= window.innerWidth - SCREEN_EDGE_GUARD_PX
          ) {
            touchStartRef.current = null;
            return;
          }
          touchStartRef.current = { x: touch.clientX, y: touch.clientY };
        }}
        onTouchEnd={(event) => {
          const start = touchStartRef.current;
          touchStartRef.current = null;
          if (!start) return;
          const touch = event.changedTouches[0];
          const dx = touch.clientX - start.x;
          const dy = touch.clientY - start.y;
          if (Math.max(Math.abs(dx), Math.abs(dy)) < SWIPE_THRESHOLD_PX) return;
          if (Math.abs(dx) >= Math.abs(dy)) {
            navigate(dx > 0 ? previousWork : nextWork);
          } else {
            navigate(dy > 0 ? previousGroup : nextGroup);
          }
        }}
        tabIndex={-1}
        aria-describedby="replication-viewer-description"
        className={cn(
          "theme-media-tile-title theme-elevation-none left-0 top-0 z-[70] h-[100svh] max-h-none w-screen max-w-none translate-x-0 translate-y-0 grid-rows-[auto_minmax(0,1fr)] gap-0 overflow-hidden border-0 bg-black p-0 duration-150 sm:rounded-none",
          immersiveFallback && "fixed inset-0",
        )}
      >
        <header className="theme-media-thumbnail-border relative z-10 flex min-h-20 items-center gap-3 border-b bg-black px-4 py-3 pr-16 sm:px-6">
          <div className="min-w-0 flex-1">
            <DialogTitle className="truncate font-display text-base font-semibold sm:text-lg">
              {collection.label}
            </DialogTitle>
            <DialogDescription
              id="replication-viewer-description"
              className="theme-media-tile-creator mt-1 flex min-w-0 flex-wrap gap-x-2 text-xs sm:text-sm"
            >
              <span className="theme-media-tile-title truncate">
                {active.replication.title}
              </span>
              <span aria-hidden>·</span>
              <span className="truncate">
                {active.replication.artist || "Unattributed"}
              </span>
              <span aria-hidden>·</span>
              <span className="tabular-nums">{workPosition}</span>
              {groupPosition ? (
                <>
                  <span aria-hidden>·</span>
                  <span className="truncate">{group.label}</span>
                  <span className="tabular-nums">{groupPosition}</span>
                </>
              ) : null}
            </DialogDescription>
          </div>
          <button
            type="button"
            onClick={close}
            aria-label="Close replication viewer"
            className={cn(
              "theme-media-tile-title theme-media-control-soft absolute right-4 top-1/2 grid size-11 -translate-y-1/2 place-items-center rounded-full",
              focusRingClassName,
            )}
          >
            <Icon icon="lucide:x" className="size-5" />
          </button>
        </header>

        <div className="grid min-h-0 flex-1 grid-rows-[minmax(0,1fr)_auto]">
          <ReplicationMediaStage
            item={active}
            muted={muted}
            volume={volume}
            fullFrame={fullFrame}
            onMutedChange={setMuted}
            onVolumeChange={setVolume}
            onFullFrameChange={setFullFrame}
            onPrevious={previousWork ? () => navigate(previousWork) : undefined}
            onNext={nextWork ? () => navigate(nextWork) : undefined}
            onInfo={() => setInfoOpen((current) => !current)}
            onFullscreen={requestFullscreen}
            fullscreenLabel={
              fullscreenSupported ? "Fullscreen" : "Immersive view"
            }
            previousLabel={
              previousWork
                ? `Previous: ${group.items[previousWork.itemIndex].replication.title}`
                : "First work"
            }
            nextLabel={
              nextWork
                ? `Next: ${group.items[nextWork.itemIndex].replication.title}`
                : "Final work"
            }
            className="min-h-0"
          />

          {group.items.length > 1 ? (
            <nav
              aria-label={`${group.label} works`}
              className="theme-media-thumbnail-border border-t bg-black px-3 py-2 sm:px-5"
            >
              <ul className="flex snap-x gap-2 overflow-x-auto">
                {group.items.map((item, itemIndex) => {
                  const selected = itemIndex === position.itemIndex;
                  const thumb =
                    item.replication.motion_poster_url ??
                    item.replication.thumbnail_url ??
                    item.replication.url;
                  return (
                    <li key={item.replication.slug} className="snap-start">
                      <button
                        type="button"
                        aria-label={`Show ${item.replication.title}`}
                        aria-current={selected ? "true" : undefined}
                        onClick={() =>
                          navigate({
                            groupIndex: position.groupIndex,
                            itemIndex,
                          })
                        }
                        className={cn(
                          "relative block size-14 overflow-hidden rounded-md border transition-opacity motion-reduce:transition-none",
                          selected
                            ? "theme-media-thumbnail-selected opacity-100"
                            : "theme-media-thumbnail-border opacity-65 hover:opacity-100",
                          focusRingClassName,
                        )}
                      >
                        <AppImage
                          src={thumb}
                          alt=""
                          width={80}
                          height={80}
                          unoptimized={
                            item.replication.format.toLowerCase() === "gif"
                          }
                          className="h-full w-full object-contain"
                        />
                      </button>
                    </li>
                  );
                })}
              </ul>
            </nav>
          ) : null}
        </div>

        {infoOpen ? (
          <aside className="theme-media-tile-title theme-media-thumbnail-border theme-media-overlay-shadow absolute bottom-0 right-0 top-20 z-20 w-full max-w-md overflow-y-auto border-l bg-black/95 p-5 text-sm sm:w-[26rem]">
            <div className="flex items-center justify-between gap-3">
              <h2 className="font-display text-lg font-semibold">
                Information
              </h2>
              <button
                type="button"
                aria-label="Close information"
                onClick={() => setInfoOpen(false)}
                className={cn(
                  "theme-media-control-soft grid size-10 place-items-center rounded-full",
                  focusRingClassName,
                )}
              >
                <Icon icon="lucide:x" className="size-5" />
              </button>
            </div>
            <dl className="theme-media-tile-creator mt-5 grid grid-cols-[auto_1fr] gap-x-4 gap-y-3">
              <dt>Format</dt>
              <dd className="theme-media-tile-title">
                {details?.format ?? active.replication.format}
              </dd>
              {(details?.width ?? active.replication.width) &&
              (details?.height ?? active.replication.height) ? (
                <>
                  <dt>Dimensions</dt>
                  <dd className="theme-media-tile-title">
                    {details?.width ?? active.replication.width} ×{" "}
                    {details?.height ?? active.replication.height}
                  </dd>
                </>
              ) : null}
              {details?.rights?.license_name ? (
                <>
                  <dt>Licence</dt>
                  <dd className="theme-media-tile-title">
                    {details.rights.license_name}
                  </dd>
                </>
              ) : null}
              {details?.rights?.rightsholder ? (
                <>
                  <dt>Rights holder</dt>
                  <dd className="theme-media-tile-title">
                    {details.rights.rightsholder}
                  </dd>
                </>
              ) : null}
            </dl>
            <a
              href={publicHref.replication(active.replication.slug)}
              className={cn(
                "theme-media-action mt-6 inline-flex min-h-11 items-center rounded-full px-4 font-semibold",
                focusRingClassName,
              )}
            >
              Open full details
            </a>
          </aside>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
