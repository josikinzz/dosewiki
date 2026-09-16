"use client";

import { useEffect, useRef, useState } from "react";
import type { MouseEvent } from "react";
import { Button } from "@/components/ui/button";
import { ExpandIndicator } from "@/components/common/ExpandButton";
import { GalleryMediaTile } from "@/features/effects/gallery/GalleryMediaTile";
import { buildReplicationViewerUrl } from "@/features/replications/galleryUrlState";
import { useT } from "@/i18n/client";
import type { PublicGalleryReplicationPreview } from "@/types/replications";
import { prefersReducedMotion } from "@/utils/navigation";

const MASONRY_CLASS =
  "columns-2 gap-1.5 sm:columns-3 sm:gap-3 lg:columns-4 [column-fill:_balance]";
const MASONRY_TILE_CLASS = "mb-1.5 w-full break-inside-avoid sm:mb-3";
const MASONRY_PAGE = 60;

interface IncrementalMasonryProps {
  items: PublicGalleryReplicationPreview[];
  showByline?: boolean;
  onOpen: (
    event: MouseEvent,
    replication: PublicGalleryReplicationPreview,
  ) => void;
  viewerSourcePath: string;
}

/** Mounts a large, already-loaded result set in bounded rendering pages. */
export function IncrementalMasonry({
  items,
  showByline = true,
  onOpen,
  viewerSourcePath,
}: IncrementalMasonryProps) {
  const t = useT();
  const [visibleCount, setVisibleCount] = useState(MASONRY_PAGE);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const gridRef = useRef<HTMLDivElement | null>(null);
  const previousItemsRef = useRef(items);
  const seenRef = useRef<Set<string> | null>(null);
  if (!seenRef.current) {
    seenRef.current = new Set(items.slice(0, MASONRY_PAGE).map((item) => item._id));
  }

  useEffect(() => {
    const previous = previousItemsRef.current;
    previousItemsRef.current = items;
    const appended = items.length >= previous.length &&
      previous.every((item, index) => item._id === items[index]._id);
    if (!appended) {
      setVisibleCount(MASONRY_PAGE);
      seenRef.current = new Set(items.slice(0, MASONRY_PAGE).map((item) => item._id));
    }
  }, [items]);

  const visible =
    items.length > visibleCount ? items.slice(0, visibleCount) : items;
  const exhausted = visible.length === items.length;

  useEffect(() => {
    const seen = seenRef.current!;
    const reduceMotion = prefersReducedMotion();
    const nodes = gridRef.current?.children;
    visible.forEach((item, index) => {
      if (seen.has(item._id)) return;
      seen.add(item._id);
      const node = nodes?.[index];
      if (!node || reduceMotion) return;
      const rect = node.getBoundingClientRect();
      // Never choreograph a whole masonry column or queue offscreen entrances.
      if (rect.top < window.innerHeight && rect.bottom > 0) {
        node.classList.add("theme-reveal-enter");
      }
    });
  }, [visible]);

  useEffect(() => {
    if (exhausted) return;
    const node = sentinelRef.current;
    if (!node || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setVisibleCount((count) => count + MASONRY_PAGE);
        }
      },
      { rootMargin: "1200px 0px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [exhausted, visibleCount, items]);

  return (
    <>
      <div ref={gridRef} className={MASONRY_CLASS}>
        {visible.map((replication) => (
          <GalleryMediaTile
            key={replication._id}
            replication={replication}
            className={MASONRY_TILE_CLASS}
            frameClassName="w-full"
            sizes="(max-width: 639px) 50vw, (max-width: 1024px) 33vw, 320px"
            showByline={showByline}
            mobileCompact
            onOpen={onOpen}
            viewerHref={buildReplicationViewerUrl(
              viewerSourcePath,
              replication.slug,
            )}
          />
        ))}
      </div>
      {!exhausted ? (
        <div
          ref={sentinelRef}
          className="flex flex-col items-center gap-1.5 pt-2"
        >
          <Button
            type="button"
            variant="pill"
            size="pill"
            onClick={() => setVisibleCount((count) => count + MASONRY_PAGE)}
            className="min-h-11 gap-1.5"
          >
            {t("Show more works")}
            <ExpandIndicator isExpanded={false} />
          </Button>
          <span className="theme-text-faint text-xs tabular-nums">
            {t("Showing {{visible}} of {{total}} works", {
              visible: visible.length,
              total: items.length,
            })}
          </span>
        </div>
      ) : null}
    </>
  );
}
