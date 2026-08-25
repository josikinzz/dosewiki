"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Icon } from "@/components/common/Icon";
import { Button } from "@/components/ui/button";
import { focusRingClassName } from "@/components/ui/surface";
import { cn } from "@/lib/utils";
import { ContributorAvatar } from "@/components/layout/PublicPagePrimitives";
import type { PublicGalleryReplicationPreview } from "@/types/replications";
import { GalleryMediaTile } from "./GalleryMediaTile";
import type { GalleryGroup } from "./galleryModel";

/** Items shown inline in a rail before "View all" takes over. */
const RAIL_PREVIEW_LIMIT = 14;

/** How much of the visible rail one arrow press advances. */
const ARROW_SCROLL_RATIO = 0.8;

const HEADING_LINK_CLASS =
  "theme-text-primary font-display text-lg font-semibold tracking-tight transition-colors hover:text-[var(--theme-accent-strong)]";

const EXTERNAL_ICON_CLASS =
  "theme-text-faint h-4 w-4 transition group-hover/heading:text-[var(--theme-accent-strong)]";

interface MediaRailProps {
  group: GalleryGroup;
  /**
   * Stable source page for this group — an Artist Page or effect article — so
   * "View all" remains crawlable and cmd-clickable instead of dead client state.
   */
  viewAllHref: string;
  /** Forwarded to each tile as `showByline`; artist rails already name the artist in the heading. */
  tileBylines?: boolean;
  /** Forwarded to each tile: hide captions below `md` so phone rails are media-only. */
  mobileCompact?: boolean;
  /** Opens the canonical in-page viewer for an ordinary click. */
  onTileOpen?: (
    event: React.MouseEvent,
    replication: PublicGalleryReplicationPreview,
  ) => void;
  /**
   * Intercepts a plain click on either "View all" affordance (header link and
   * rail-end tile) to open the in-page viewer on this group instead of
   * navigating. The anchor keeps `viewAllHref` so modified clicks, new tabs,
   * and crawlers still reach the group's own page.
   */
  onViewAllOpen?: (event: React.MouseEvent) => void;
  /** Canonical source-collection viewer URL for each rail work. */
  viewerHrefFor: (replication: PublicGalleryReplicationPreview) => string;
  /**
   * The heading's identity portrait, shown left of the name.
   *
   * Absent means the heading names no person — an effect group, or the
   * unattributed bucket, which must not be handed a face. `null` means a
   * credited artist with no claimed profile image: their monogram holds the
   * slot, so every artist name in a browse column starts on the same edge
   * instead of stepping in and out as claimed profiles come and go.
   */
  avatarUrl?: string | null;
}

export function MediaRail({
  group,
  viewAllHref,
  tileBylines = true,
  mobileCompact,
  onTileOpen,
  onViewAllOpen,
  avatarUrl,
  viewerHrefFor,
}: MediaRailProps) {
  const preview = group.items.slice(0, RAIL_PREVIEW_LIMIT);
  const hasMore = group.count > preview.length;

  /**
   * Desktop arrow affordances. Wheel-less mice cannot comfortably drag a
   * horizontal scroller, so hover-capable pointers get prev/next buttons that
   * page the rail; they hide entirely at either end (and both, when the rail
   * does not overflow). Touch keeps native swiping and never sees them —
   * the buttons are display:none outside `@media (hover: hover)`.
   */
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

  // `disabled:opacity-0` (not a bare `opacity-0`) so it outranks the base
  // Button's `disabled:opacity-50`; disabled already kills pointer events.
  const arrowClass =
    "theme-media-rail-arrow absolute top-1/2 z-10 hidden h-9 w-9 -translate-y-1/2 rounded-full disabled:opacity-0 [@media(hover:hover)]:inline-flex";

  /**
   * A person's face is the fastest way to recognize their section in a column
   * of sixteen, so an artist heading leads with their portrait. An artist with
   * no claimed profile image still gets the frame with their monogram in it:
   * the alternative — a portrait only where a profile happens to exist — makes
   * the names step in and out along the left edge as you scroll.
   */
  const portrait =
    avatarUrl === undefined ? null : (
      // Decorative: the name it leads sits inside the same link, so an
      // announced portrait would just be a second copy of that name.
      <span aria-hidden="true" className="flex">
        <ContributorAvatar imageUrl={avatarUrl} name={group.label} size="xs" />
      </span>
    );

  /**
   * What the group's name does.
   *
   * An artist's name belongs to their Artist Page: every credited artist's one
   * public surface, where their whole body of work, their bio and their own
   * links live (decorated by a claimed Contributor Profile), and where every
   * other credit line on the site already points. Their personal site is still
   * worth reaching — it just is not what their *name* means — so when both
   * exist it becomes a separate arrow beside the name rather than disappearing.
   *
   * Dropping the external link entirely was the tempting simplification, since
   * a claimed profile renders `links[]` on the page. It is wrong on this data:
   * of the fifty artists carrying an `artist_url`, nineteen have a URL that is
   * not on their profile at all, so removing it here would quietly make those
   * unreachable.
   *
   * Only the unattributed bucket has no `href` at all — its heading claims no
   * identity — so it keeps the external link or plain text, and it is the one
   * artist heading with no portrait beside it. Effect groups only ever have an
   * `href`, so the fallback branches are inert for them.
   */
  const heading = group.href ? (
    <span className="flex min-w-0 items-center gap-1.5">
      <Link
        href={group.href}
        className={cn(
          HEADING_LINK_CLASS,
          // The unnamed `group` is what the portrait's own hover lift reads.
          "group flex min-w-0 items-center gap-2.5",
        )}
      >
        {portrait}
        <span className="min-w-0 truncate">{group.label}</span>
      </Link>
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
            {group.label}&rsquo;s own site (opens in a new tab)
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
      {group.label}
      <Icon icon="lucide:arrow-up-right" className={EXTERNAL_ICON_CLASS} />
    </a>
  ) : (
    <span className="theme-text-primary font-display text-lg font-semibold tracking-tight">
      {group.label}
    </span>
  );

  return (
    <section className="space-y-3" aria-label={group.label}>
      <div
        className={cn(
          "flex flex-wrap justify-between gap-x-4 gap-y-1 px-1",
          // A bare name sits on the baseline with "View all"; a portrait is
          // taller than the text it leads, so the row centers on it instead.
          portrait ? "items-center" : "items-baseline",
        )}
      >
        <div className="flex min-w-0 flex-col gap-0.5">{heading}</div>
        {hasMore ? (
          <Link
            href={viewAllHref}
            onClick={onViewAllOpen}
            className="theme-text-muted group/all inline-flex min-h-11 items-center gap-1 rounded-full px-2 py-1 text-sm font-medium transition-colors hover:text-[var(--theme-accent-strong)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--theme-accent-strong)]"
          >
            View all {group.count}
            <Icon
              icon="lucide:arrow-right"
              className="h-4 w-4 transition group-hover/all:translate-x-0.5 motion-reduce:transition-none"
            />
          </Link>
        ) : null}
      </div>

      <div className="relative">
        <div
          ref={scrollerRef}
          onScroll={updateScrollability}
          className={cn(
            // px/scroll-px keep resting tiles off the clipping edge, aligned
            // with the header's own px-1 inset.
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
            <Link
              href={viewAllHref}
              onClick={onViewAllOpen}
              style={{ aspectRatio: "4 / 5" }}
              className="theme-text-muted flex h-44 shrink-0 snap-start self-start flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-[color:var(--theme-border-strong)] bg-[var(--theme-surface-soft)] px-4 text-sm font-medium transition-colors hover:text-[var(--theme-accent-strong)] hover:border-[color:var(--theme-card-border-strong)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--theme-accent-strong)] sm:h-52 motion-reduce:transition-none"
            >
              <Icon icon="lucide:arrow-right" className="h-5 w-5" />
              View all {group.count}
            </Link>
          ) : null}
        </div>

        <Button
          type="button"
          variant="glass"
          size="icon"
          onClick={() => scrollByPage(-1)}
          disabled={!canScroll.left}
          aria-label={`Scroll ${group.label} back`}
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
          aria-label={`Scroll ${group.label} forward`}
          className={cn(arrowClass, "right-1")}
        >
          <Icon icon="lucide:chevron-right" className="h-4 w-4" aria-hidden />
        </Button>
      </div>
    </section>
  );
}
