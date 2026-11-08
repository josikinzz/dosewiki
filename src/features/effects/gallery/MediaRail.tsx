"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { SmartLink } from "@/components/common/SmartLink";
import { Icon } from "@/components/common/Icon";
import { Button } from "@/components/ui/button";
import { focusRingClassName } from "@/components/ui/surface";
import { TOUCH_ICON } from "@/components/ui/touchTargets";
import { cn } from "@/lib/utils";
import { useT } from "@/i18n/client";
import { ContributorAvatar } from "@/components/layout/PublicPagePrimitives";
import { ApprovedReplicatorStar } from "@/features/replications/components/ApprovedReplicatorStar";
import type { PublicGalleryReplicationPreview } from "@/types/replications";
import { GalleryMediaTile } from "./GalleryMediaTile";
import { RAIL_PREVIEW_LIMIT, type GalleryGroup } from "./galleryTypes";

const ARROW_SCROLL_RATIO = 0.8;

const GROUP_MASONRY_CLASS = "columns-2 gap-1.5 sm:columns-3 [column-fill:_balance]";
const GROUP_MASONRY_TILE_CLASS = "mb-1.5 w-full break-inside-avoid";

const STICKY_LABEL_TOP =
  "top-[calc(var(--site-header-height)+var(--site-header-sticky-gap)+var(--replications-control-bar-height))]";

const HEADING_LINK_CLASS =
  "theme-text-primary font-display text-lg font-semibold tracking-tight transition-colors hover:text-[var(--theme-accent-strong)]";

const EXTERNAL_ICON_CLASS =
  "theme-text-faint h-4 w-4 transition group-hover/heading:text-[var(--theme-accent-strong)]";

interface MediaRailProps {
  group: GalleryGroup;
  countIsComplete?: boolean;
  viewAllHref: string;
  tileBylines?: boolean;
  mobileCompact?: boolean;
  layout?: "rail" | "masonry";
  onTileOpen?: (
    event: React.MouseEvent,
    replication: PublicGalleryReplicationPreview,
  ) => void;
  viewerHrefFor: (replication: PublicGalleryReplicationPreview) => string;
  avatarUrl?: string | null;
}

export function MediaRail({
  group,
  countIsComplete = true,
  viewAllHref,
  tileBylines = true,
  mobileCompact,
  layout = "rail",
  onTileOpen,
  avatarUrl,
  viewerHrefFor,
}: MediaRailProps) {
  const t = useT();
  const preview = group.items.slice(0, RAIL_PREVIEW_LIMIT);
  const hasMore = !countIsComplete || group.count > preview.length;
  const viewAllLabel = countIsComplete
    ? t("View all {{count}}", { count: group.count })
    : t("View all");

  const scrollerRef = useRef<HTMLDivElement>(null);
  const [canScroll, setCanScroll] = useState({ left: false, right: false });

  const updateScrollability = useCallback(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    const next = { left: el.scrollLeft > 1, right: el.scrollLeft < max - 1 };
    setCanScroll((prev) =>
      prev.left === next.left && prev.right === next.right ? prev : next,
    );
  }, []);

  useEffect(() => {
    updateScrollability();
    window.addEventListener("resize", updateScrollability);
    return () => window.removeEventListener("resize", updateScrollability);
  }, [updateScrollability]);

  const scrollByPage = (direction: 1 | -1) => {
    const el = scrollerRef.current;
    if (!el) return;
    const reduceMotion =
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    el.scrollBy({
      left: direction * el.clientWidth * ARROW_SCROLL_RATIO,
      behavior: reduceMotion ? "auto" : "smooth",
    });
  };

  const arrowClass =
    cn("theme-media-rail-arrow absolute top-1/2 z-10 hidden h-9 w-9 -translate-y-1/2 rounded-full transition-[opacity,transform] duration-[160ms] active:scale-95 disabled:opacity-0 motion-reduce:transition-none motion-reduce:active:scale-100 [@media(hover:hover)]:inline-flex", TOUCH_ICON);

  const portrait =
    avatarUrl === undefined ? null : (
      <span aria-hidden="true" className="flex">
        <ContributorAvatar imageUrl={avatarUrl} name={group.label} size="xs" />
      </span>
    );

  const star = group.approvedReplicator ? (
    <ApprovedReplicatorStar className="-ml-1 text-[0.85em]" />
  ) : null;

  const heading = group.href ? (
    <span className="flex min-w-0 items-center gap-1.5">
      <SmartLink
        href={group.href}
        className={cn(
          HEADING_LINK_CLASS,
          "group flex min-w-0 items-center gap-2.5",
        )}
      >
        {portrait}
        <span className="min-w-0 truncate">{t(group.label)}</span>
        {star}
      </SmartLink>
      {group.externalUrl ? (
        <a
          href={group.externalUrl}
          target="_blank"
          rel="noopener noreferrer"
          className={cn(
            "group/heading inline-flex shrink-0 items-center rounded-sm",
            focusRingClassName,
          )}
        >
          <Icon icon="lucide:arrow-up-right" className={EXTERNAL_ICON_CLASS} />
          <span className="sr-only">
            {t("{{artist}}’s own site (opens in a new tab)", { artist: group.label })}
          </span>
        </a>
      ) : null}
    </span>
  ) : group.externalUrl ? (
    <a
      href={group.externalUrl}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        HEADING_LINK_CLASS,
        "group/heading inline-flex items-center gap-1.5",
      )}
    >
      {t(group.label)}
      <Icon icon="lucide:arrow-up-right" className={EXTERNAL_ICON_CLASS} />
    </a>
  ) : (
    <span className="theme-text-primary font-display text-lg font-semibold tracking-tight">
      {t(group.label)}
    </span>
  );

  const masonry = layout === "masonry";

  return (
    <section className={masonry ? "space-y-2" : "space-y-3"} aria-label={t(group.label)}>
      <div
        className={cn(
          "flex flex-wrap justify-between gap-x-4 gap-y-1 px-1",
          portrait ? "items-center" : "items-baseline",
          masonry &&
            cn(
              "sticky z-10 -mx-1 rounded-lg px-2 py-0.5 backdrop-blur-md theme-frosted-control-bar",
              STICKY_LABEL_TOP,
            ),
        )}
      >
        <h2 className="flex min-w-0 flex-col gap-0.5">{heading}</h2>
        {hasMore ? (
          <SmartLink
            href={viewAllHref}
            className="theme-text-muted group/all inline-flex min-h-11 items-center gap-1 rounded-full px-2 py-1 text-sm font-medium transition-colors hover:text-[var(--theme-accent-strong)] theme-focus-ring"
          >
            {viewAllLabel}
            <Icon
              icon="lucide:arrow-right"
              className="h-4 w-4 transition group-hover/all:translate-x-0.5 motion-reduce:transition-none"
            />
          </SmartLink>
        ) : null}
      </div>

      {masonry ? (
        <div className={GROUP_MASONRY_CLASS}>
          {preview.map((replication) => (
            <GalleryMediaTile
              key={replication._id}
              replication={replication}
              className={GROUP_MASONRY_TILE_CLASS}
              frameClassName="w-full"
              sizes="(max-width: 639px) 50vw, 33vw"
              showByline={tileBylines}
              mobileCompact={mobileCompact}
              onOpen={onTileOpen}
              viewerHref={viewerHrefFor(replication)}
            />
          ))}
        </div>
      ) : (
      <div className="relative">
        <div
          ref={scrollerRef}
          onScroll={updateScrollability}
          className={cn(
            "flex snap-x snap-mandatory gap-3 overflow-x-auto px-1 pb-2 scroll-px-1",
            "[scrollbar-width:thin] [-webkit-overflow-scrolling:touch]",
          )}
        >
          {preview.map((replication) => (
            <GalleryMediaTile
              key={replication._id}
              replication={replication}
              className="shrink-0 snap-start"
              frameClassName="h-44 sm:h-52"
              showByline={tileBylines}
              mobileCompact={mobileCompact}
              onOpen={onTileOpen}
              viewerHref={viewerHrefFor(replication)}
            />
          ))}
          {hasMore ? (
            <SmartLink
              href={viewAllHref}
              style={{ aspectRatio: "4 / 5" }}
              className="theme-text-muted flex h-44 shrink-0 snap-start self-start flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-[color:var(--theme-border-strong)] bg-[var(--theme-surface-soft)] px-4 text-sm font-medium transition-colors hover:text-[var(--theme-accent-strong)] hover:border-[color:var(--theme-card-border-strong)] theme-focus-ring sm:h-52 motion-reduce:transition-none"
            >
              <Icon icon="lucide:arrow-right" className="h-5 w-5" />
              {viewAllLabel}
            </SmartLink>
          ) : null}
        </div>

        <Button
          type="button"
          variant="glass"
          size="icon"
          onClick={() => scrollByPage(-1)}
          disabled={!canScroll.left}
          aria-label={t("Scroll {{group}} back", { group: t(group.label) })}
          className={cn(arrowClass, "left-1")}
        >
          <Icon icon="lucide:chevron-left" className="h-4 w-4" aria-hidden />
        </Button>
        <Button
          type="button"
          variant="glass"
          size="icon"
          onClick={() => scrollByPage(1)}
          disabled={!canScroll.right}
          aria-label={t("Scroll {{group}} forward", { group: t(group.label) })}
          className={cn(arrowClass, "right-1")}
        >
          <Icon icon="lucide:chevron-right" className="h-4 w-4" aria-hidden />
        </Button>
      </div>
      )}
    </section>
  );
}
