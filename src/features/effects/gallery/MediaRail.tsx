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

/** How much of the visible rail one arrow press advances. */
const ARROW_SCROLL_RATIO = 0.8;

/**
 * Phone browse view. Two columns and hairline gutters, the same geometry the
 * search masonry uses, so a group reads as a continuous grid of work instead
 * of a rail that loads fourteen tiles and reveals one. Two rather than three:
 * a third column left every tile ~125px wide on a 390px phone while still
 * paying a full-resolution decode for each one.
 */
const GROUP_MASONRY_CLASS = "columns-2 gap-1.5 sm:columns-3 [column-fill:_balance]";
const GROUP_MASONRY_TILE_CLASS = "mb-1.5 w-full break-inside-avoid";

/**
 * Where a masonry group's label parks while its own tiles scroll past: below
 * the app header and the control bar that sticks under it. Every offset in the
 * stack derives from the same three tokens (src/styles/base.css), so a header
 * height change moves the whole stack at once.
 */
const STICKY_LABEL_TOP =
  "top-[calc(var(--site-header-height)+var(--site-header-sticky-gap)+var(--replications-control-bar-height))]";

const HEADING_LINK_CLASS =
  "theme-text-primary font-display text-lg font-semibold tracking-tight transition-colors hover:text-[var(--theme-accent-strong)]";

const EXTERNAL_ICON_CLASS =
  "theme-text-faint h-4 w-4 transition group-hover/heading:text-[var(--theme-accent-strong)]";

interface MediaRailProps {
  group: GalleryGroup;
  /** False while `group.count` covers only loaded continuation pages. */
  countIsComplete?: boolean;
  /**
   * Stable source page for this group — an Artist Page or effect article — so
   * "View all" remains crawlable and cmd-clickable instead of dead client state.
   */
  viewAllHref: string;
  /** Forwarded to each tile as `showByline`; artist rails already name the artist in the heading. */
  tileBylines?: boolean;
  /** Forwarded to each tile: tighten captions below `md`. */
  mobileCompact?: boolean;
  /**
   * `rail` is the horizontal scroller. `masonry` is the phone browse view: the
   * group's works in a continuous three-column grid under a sticky label,
   * which is the only layout on this page that puts more than one or two works
   * on a phone screen at a time.
   */
  layout?: "rail" | "masonry";
  /** Opens the canonical in-page viewer for an ordinary click. */
  onTileOpen?: (
    event: React.MouseEvent,
    replication: PublicGalleryReplicationPreview,
  ) => void;
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
    cn("theme-media-rail-arrow absolute top-1/2 z-10 hidden h-9 w-9 -translate-y-1/2 rounded-full transition-[opacity,transform] duration-[160ms] active:scale-95 disabled:opacity-0 motion-reduce:transition-none motion-reduce:active:scale-100 [@media(hover:hover)]:inline-flex", TOUCH_ICON);

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

  // The star follows the name inside its own link, so it never becomes a
  // second focus stop and reads as part of the name: "Loka, approved
  // replicator". Sized to the heading's text so it sits on the same optical
  // line as the letters, and pulled in because the link's portrait gap is
  // wider than a mark wants from its word. Only a linked heading can wear
  // it: the unattributed bucket, the one heading without an `href`, claims
  // no identity for anyone to approve.
  const star = group.approvedReplicator ? (
    <ApprovedReplicatorStar className="-ml-1 text-[0.85em]" />
  ) : null;

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
      <SmartLink
        href={group.href}
        className={cn(
          HEADING_LINK_CLASS,
          // The unnamed `group` is what the portrait's own hover lift reads.
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
          // A bare name sits on the baseline with "View all"; a portrait is
          // taller than the text it leads, so the row centers on it instead.
          portrait ? "items-center" : "items-baseline",
          // In the masonry view the label rides along above its own tiles:
          // fourteen works of one artist scroll past in three columns, and a
          // label that scrolls away with the first row leaves the rest of the
          // grid unattributed.
          masonry &&
            cn(
              "sticky z-10 -mx-1 rounded-lg px-2 py-0.5 backdrop-blur-md theme-frosted-control-bar",
              STICKY_LABEL_TOP,
            ),
        )}
      >
        {/* A real heading, not a styled span: the browse view is otherwise one
            h1 followed by sixteen unheaded regions, so nobody can navigate
            artist to artist by heading. */}
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
