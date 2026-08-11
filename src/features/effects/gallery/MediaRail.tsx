'use client';

import Link from 'next/link';
import { Icon } from '@/components/common/Icon';
import { focusRingClassName } from '@/components/ui/surface';
import { cn } from '@/lib/utils';
import { GalleryMediaTile } from './GalleryMediaTile';
import type { GalleryGroup } from './galleryModel';

/** Items shown inline in a rail before "View all" takes over. */
const RAIL_PREVIEW_LIMIT = 14;

const HEADING_LINK_CLASS =
  'theme-text-primary font-display text-lg font-semibold tracking-tight transition-colors hover:text-[var(--theme-accent-strong)]';

const EXTERNAL_ICON_CLASS =
  'theme-text-faint h-4 w-4 transition group-hover/heading:text-[var(--theme-accent-strong)]';

function CountChips({ group }: { group: GalleryGroup }) {
  const parts: string[] = [];
  if (group.imageCount > 0) parts.push(`${group.imageCount} image${group.imageCount === 1 ? '' : 's'}`);
  if (group.videoCount > 0) parts.push(`${group.videoCount} video${group.videoCount === 1 ? '' : 's'}`);
  return (
    <span className="theme-text-faint text-xs tabular-nums">
      {group.count} work{group.count === 1 ? '' : 's'}
      {parts.length ? <span className="theme-text-ghost"> · {parts.join(' · ')}</span> : null}
    </span>
  );
}

interface MediaRailProps {
  group: GalleryGroup;
  /** Switch to the focused, full-masonry view for this group. */
  onViewAll: () => void;
}

export function MediaRail({ group, onViewAll }: MediaRailProps) {
  const preview = group.items.slice(0, RAIL_PREVIEW_LIMIT);
  const hasMore = group.count > preview.length;

  /**
   * What the group's name does.
   *
   * An artist's name belongs to their profile page: that is where their whole
   * body of work, their bio and their own links live, and it is where every
   * other credit line on the site already points. Their personal site is still
   * worth reaching — it just is not what their *name* means — so when both
   * exist it becomes a separate arrow beside the name rather than disappearing.
   *
   * Dropping the external link entirely was the tempting simplification, since
   * the profile page renders `links[]`. It is wrong on this data: of the fifty
   * artists carrying an `artist_url`, nineteen have a URL that is not on their
   * profile at all, so removing it here would quietly make those unreachable.
   *
   * An artist with no profile keeps exactly today's behaviour — external link if
   * they have a usable one, plain text otherwise. Effect groups only ever have
   * an `href`, so this whole branch is inert for them.
   */
  const heading = group.href ? (
    <span className="flex min-w-0 items-center gap-1.5">
      <Link href={group.href} className={cn(HEADING_LINK_CLASS, 'min-w-0 truncate')}>
        {group.label}
      </Link>
      {group.externalUrl ? (
        <a
          href={group.externalUrl}
          target="_blank"
          rel="noopener noreferrer"
          className={cn('group/heading inline-flex shrink-0 items-center rounded-sm', focusRingClassName)}
        >
          <Icon icon="lucide:arrow-up-right" className={EXTERNAL_ICON_CLASS} />
          <span className="sr-only">{group.label}&rsquo;s own site (opens in a new tab)</span>
        </a>
      ) : null}
    </span>
  ) : group.externalUrl ? (
    <a
      href={group.externalUrl}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(HEADING_LINK_CLASS, 'group/heading inline-flex items-center gap-1.5')}
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
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-1">
        <div className="flex min-w-0 flex-col gap-0.5">
          {heading}
          <CountChips group={group} />
        </div>
        {hasMore ? (
          <button
            type="button"
            onClick={onViewAll}
            className="theme-text-muted group/all inline-flex items-center gap-1 rounded-full px-2 py-1 text-sm font-medium transition-colors hover:text-[var(--theme-accent-strong)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--theme-accent-strong)]"
          >
            View all {group.count}
            <Icon icon="lucide:arrow-right" className="h-4 w-4 transition group-hover/all:translate-x-0.5" />
          </button>
        ) : null}
      </div>

      <div
        className={cn(
          'flex snap-x snap-mandatory gap-3 overflow-x-auto pb-2',
          '[scrollbar-width:thin] [-webkit-overflow-scrolling:touch]',
        )}
      >
        {preview.map((replication) => (
          <GalleryMediaTile
            key={replication._id}
            replication={replication}
            className="shrink-0 snap-start"
            frameClassName="h-44 sm:h-52"
          />
        ))}
        {hasMore ? (
          <button
            type="button"
            onClick={onViewAll}
            style={{ aspectRatio: '4 / 5' }}
            className="theme-text-muted flex h-44 shrink-0 snap-start self-start flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-[color:var(--theme-border-strong)] bg-[var(--theme-surface-soft)] px-4 text-sm font-medium transition-colors hover:text-[var(--theme-accent-strong)] hover:border-[color:var(--theme-card-border-strong)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--theme-accent-strong)] sm:h-52"
          >
            <Icon icon="lucide:arrow-right" className="h-5 w-5" />
            View all {group.count}
          </button>
        ) : null}
      </div>
    </section>
  );
}
