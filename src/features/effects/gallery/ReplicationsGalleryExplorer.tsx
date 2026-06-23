'use client';

import { useCallback, useMemo, useState } from 'react';
import { Icon } from '@/components/common/Icon';
import { SearchEmptyState } from '@/components/common/SearchEmptyState';
import { Input } from '@/components/ui/input';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import type { GalleryReplication } from '@/types/replications';
import { ReplicationLightbox } from '../components/ReplicationLightbox';
import { GalleryMediaTile } from './GalleryMediaTile';
import { MediaRail } from './MediaRail';
import {
  countGallery,
  groupByArtist,
  groupByEffect,
  isDisplayable,
  matchesQuery,
  matchesType,
  selectSpotlight,
  sortWithinGroup,
  type GalleryArtistSort,
  type GalleryMode,
  type GalleryTypeFilter,
} from './galleryModel';

interface EffectSummary {
  slug: string;
  name: string;
  tags: string[];
}

interface ReplicationsGalleryExplorerProps {
  replications: GalleryReplication[];
  effects: EffectSummary[];
  effectHrefPrefix?: string;
}

const MASONRY_CLASS = 'columns-2 gap-3 sm:columns-3 lg:columns-4 [column-fill:_balance]';
const MASONRY_TILE_CLASS = 'mb-3 w-full break-inside-avoid';

export function ReplicationsGalleryExplorer({
  replications,
  effects,
  effectHrefPrefix = '/effects',
}: ReplicationsGalleryExplorerProps) {
  const [mode, setMode] = useState<GalleryMode>('artist');
  const [query, setQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<GalleryTypeFilter>('all');
  const [artistSort, setArtistSort] = useState<GalleryArtistSort>('count');
  const [focusedKey, setFocusedKey] = useState<string | null>(null);
  const [lightbox, setLightbox] = useState<{ items: GalleryReplication[]; index: number } | null>(null);

  const displayable = useMemo(() => replications.filter(isDisplayable), [replications]);

  const effectName = useMemo(() => {
    const map = new Map(effects.map((effect) => [effect.slug, effect.name]));
    return (slug: string) => map.get(slug) ?? slug.replace(/-/g, ' ');
  }, [effects]);

  const effectHref = useCallback(
    (slug: string) => `${(effectHrefPrefix || '/effects').replace(/\/$/, '')}/${slug}`,
    [effectHrefPrefix],
  );

  const counts = useMemo(() => countGallery(displayable), [displayable]);

  const filtered = useMemo(
    () => displayable.filter((item) => matchesType(item, typeFilter) && matchesQuery(item, query, effectName)),
    [displayable, typeFilter, query, effectName],
  );

  const groups = useMemo(() => {
    if (mode === 'artist') return groupByArtist(filtered, artistSort);
    return groupByEffect(filtered, effectName, effectHref);
  }, [mode, filtered, artistSort, effectName, effectHref]);

  const spotlight = useMemo(() => selectSpotlight(displayable), [displayable]);

  const searching = query.trim().length > 0;
  const focusedGroup = focusedKey ? groups.find((group) => group.key === focusedKey) ?? null : null;

  const switchMode = (next: GalleryMode) => {
    setMode(next);
    setFocusedKey(null);
  };

  const updateQuery = (next: string) => {
    setQuery(next);
    if (next.trim().length > 0) setFocusedKey(null);
  };

  const openLightbox = (items: GalleryReplication[], index: number) => setLightbox({ items, index });

  const renderMasonry = (items: GalleryReplication[]) => (
    <div className={MASONRY_CLASS}>
      {items.map((replication, index) => (
        <GalleryMediaTile
          key={replication._id}
          replication={replication}
          onOpen={() => openLightbox(items, index)}
          className={MASONRY_TILE_CLASS}
        />
      ))}
    </div>
  );

  const hasMedia = counts.total > 0;

  return (
    <section
      aria-label="Replications gallery"
      className="mx-auto mt-6 w-full max-w-7xl rounded-[2rem] border border-[color:var(--theme-border-subtle)] bg-[var(--theme-page-end)] px-4 py-6 shadow-[inset_0_1px_0_rgb(255_255_255/0.04)] sm:px-6 sm:py-8"
    >
      {/* Heading + live counts */}
      <header className="mx-auto max-w-3xl px-1 text-center">
        <p className="theme-text-faint text-[0.6875rem] font-semibold uppercase tracking-[0.28em]">
          Replications Gallery
        </p>
        <p className="theme-text-secondary mt-2 text-sm leading-6">
          Image and video replications of subjective effects, by the artists who make them.
        </p>
        {hasMedia ? (
          <p className="theme-text-faint mt-2 text-xs tabular-nums">
            {counts.total} works · {counts.artists} artists · {counts.effects} effects
          </p>
        ) : null}
      </header>

      {!hasMedia ? (
        <SearchEmptyState
          className="mt-6"
          icon="lucide:image-off"
          title="No replications yet"
          description="Replication media has not been published yet. Check back soon."
        />
      ) : (
        <>
          {/* Sticky control bar */}
          <div className="sticky top-2 z-20 mt-6">
            <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-center gap-2 rounded-2xl border border-[color:var(--theme-frosted-control-border)] bg-[var(--theme-frosted-control-bg)] p-2 shadow-[var(--theme-frosted-control-shadow,0_10px_30px_-24px_rgb(0_0_0/0.6))] backdrop-blur-md sm:gap-3">
              <ToggleGroup
                type="single"
                variant="pill"
                value={mode}
                onValueChange={(value) => value && switchMode(value as GalleryMode)}
                aria-label="Browse by"
              >
                <ToggleGroupItem value="artist">By artist</ToggleGroupItem>
                <ToggleGroupItem value="effect">By effect</ToggleGroupItem>
              </ToggleGroup>

              <div className="relative min-w-[10rem] flex-1">
                <Icon
                  icon="lucide:search"
                  className="theme-text-faint pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2"
                />
                <Input
                  value={query}
                  onChange={(event) => updateQuery(event.target.value)}
                  placeholder="Search art, artist, effect"
                  className="h-9 pl-9"
                  inputMode="search"
                  aria-label="Search replications"
                />
              </div>

              <ToggleGroup
                type="single"
                variant="pill"
                value={typeFilter}
                onValueChange={(value) => value && setTypeFilter(value as GalleryTypeFilter)}
                aria-label="Filter by media type"
              >
                <ToggleGroupItem value="all">All</ToggleGroupItem>
                <ToggleGroupItem value="image">Images</ToggleGroupItem>
                <ToggleGroupItem value="video">Videos</ToggleGroupItem>
              </ToggleGroup>

              {mode === 'artist' && !searching ? (
                <ToggleGroup
                  type="single"
                  variant="pill"
                  value={artistSort}
                  onValueChange={(value) => value && setArtistSort(value as GalleryArtistSort)}
                  aria-label="Sort artists"
                >
                  <ToggleGroupItem value="count">Most works</ToggleGroupItem>
                  <ToggleGroupItem value="alpha">A–Z</ToggleGroupItem>
                </ToggleGroup>
              ) : null}
            </div>
          </div>

          {/* Spotlight — only on the unfiltered browse view */}
          {!searching && !focusedGroup && spotlight.length > 0 ? (
            <div className="mt-8 space-y-3">
              <div className="flex items-center justify-center gap-2 px-1">
                <Icon icon="lucide:sparkles" className="h-4 w-4 text-[var(--theme-accent-strong)]" />
                <h2 className="theme-text-muted text-xs font-semibold uppercase tracking-[0.22em]">
                  Spotlight
                </h2>
              </div>
              <div className="flex snap-x snap-mandatory justify-center gap-3 overflow-x-auto pb-2 [scrollbar-width:thin]">
                {spotlight.map((replication, index) => (
                  <GalleryMediaTile
                    key={replication._id}
                    replication={replication}
                    onOpen={() => openLightbox(spotlight, index)}
                    className="h-56 shrink-0 snap-start sm:h-72"
                  />
                ))}
              </div>
            </div>
          ) : null}

          {/* Focused single-group view */}
          {focusedGroup ? (
            <div className="mt-8 space-y-4">
              <div className="flex flex-wrap items-baseline justify-between gap-3 px-1">
                <div>
                  <button
                    type="button"
                    onClick={() => setFocusedKey(null)}
                    className="theme-text-muted group inline-flex items-center gap-1 rounded-full text-sm font-medium transition-colors hover:text-[var(--theme-accent-strong)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--theme-accent-strong)]"
                  >
                    <Icon icon="lucide:arrow-left" className="h-4 w-4 transition group-hover:-translate-x-0.5" />
                    All {mode === 'artist' ? 'artists' : 'effects'}
                  </button>
                  <h2 className="theme-text-primary font-display mt-1 text-2xl font-bold tracking-tight">
                    {focusedGroup.label}
                  </h2>
                </div>
                <span className="theme-text-faint text-xs tabular-nums">
                  {focusedGroup.count} works
                </span>
              </div>
              {renderMasonry(focusedGroup.items)}
            </div>
          ) : searching ? (
            /* Search results — flat masonry */
            filtered.length > 0 ? (
              <div className="mt-8 space-y-4">
                <p className="theme-text-faint px-1 text-xs tabular-nums">
                  {filtered.length} result{filtered.length === 1 ? '' : 's'} for “{query.trim()}”
                </p>
                {renderMasonry(sortWithinGroup(filtered))}
              </div>
            ) : (
              <SearchEmptyState
                className="mt-8"
                icon="lucide:search-x"
                title="No art matches your search"
                description={`Nothing found for “${query.trim()}”. Try a different artist, effect, or title.`}
              />
            )
          ) : (
            /* Browse — rails per group */
            <div className="mt-8 space-y-10">
              {groups.map((group) => (
                <MediaRail
                  key={group.key}
                  group={group}
                  onOpenItem={(index) => openLightbox(group.items, index)}
                  onViewAll={() => setFocusedKey(group.key)}
                />
              ))}
            </div>
          )}

          {/* Rights footnote */}
          <p className="theme-text-ghost mx-auto mt-10 max-w-3xl px-1 text-center text-xs leading-5">
            Replication media is credited to its creator when known. Rights remain with the original
            creator or rightsholder unless an individual item states another license.
          </p>
        </>
      )}

      <ReplicationLightbox
        replications={lightbox?.items ?? []}
        index={lightbox?.index ?? -1}
        onIndexChange={(index) => setLightbox((current) => (current ? { ...current, index } : current))}
        onClose={() => setLightbox(null)}
      />
    </section>
  );
}
