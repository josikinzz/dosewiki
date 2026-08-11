'use client';

import Link from 'next/link';
import { Icon } from '@/components/common/Icon';
import { cn } from '@/lib/utils';
import { GalleryMediaTile } from './GalleryMediaTile';
import type { GalleryGroup } from './galleryModel';

/** Items shown inline in a rail before "View all" takes over. */
const RAIL_PREVIEW_LIMIT = 14;

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

  const heading = group.href ? (
    <Link
      href={group.href}
      className="theme-text-primary font-display text-lg font-semibold tracking-tight transition-colors hover:text-[var(--theme-accent-strong)]"
    >
      {group.label}
    </Link>
  ) : group.externalUrl ? (
    <a
      href={group.externalUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="theme-text-primary font-display group/heading inline-flex items-center gap-1.5 text-lg font-semibold tracking-tight transition-colors hover:text-[var(--theme-accent-strong)]"
    >
      {group.label}
      <Icon
        icon="lucide:arrow-up-right"
        className="theme-text-faint h-4 w-4 transition group-hover/heading:text-[var(--theme-accent-strong)]"
      />
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
