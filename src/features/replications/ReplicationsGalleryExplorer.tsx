'use client';

import { useEffect, useMemo, useRef } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Icon } from '@/components/common/Icon';
import { proseLinkClassName } from '@/components/common/ProseLink';
import { SearchEmptyState } from '@/components/common/SearchEmptyState';
import { Input } from '@/components/ui/input';
import { focusRingClassName } from '@/components/ui/surface';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { cn } from '@/lib/utils';
import type { ContributorDirectory } from '@server/contributorDirectory';
import type { GalleryReplication } from '@/types/replications';
import { GalleryMediaTile } from '@/features/effects/gallery/GalleryMediaTile';
import { MediaRail } from '@/features/effects/gallery/MediaRail';
import {
  countGallery,
  effectHrefBuilder,
  effectNameLookup,
  galleryGroupUrlKey,
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
} from '@/features/effects/gallery/galleryModel';
import { resolveGalleryFocus } from './galleryFocus';
import {
  buildGalleryBrowseUrl,
  buildGalleryFocusUrl,
  parseGalleryBrowseState,
  type GalleryFocus,
} from './galleryUrlState';

interface EffectSummary {
  slug: string;
  name: string;
  tags: string[];
}

export interface ReplicationsGalleryExplorerProps {
  replications: GalleryReplication[];
  effects: EffectSummary[];
  effectHrefPrefix?: string;
  /**
   * Read on the server and passed down, so an artist heading can link to their
   * profile. `lib/contributorDirectory` is deliberately free of `server-only`
   * imports — it is just the shared matcher plus `publicHref` — so the lookup
   * itself is safe on this side of the boundary; the *data* is not, which is why
   * it arrives as a prop rather than a fetch.
   */
  contributorDirectory?: ContributorDirectory;
  /**
   * Set by the /replications/artist/<key> and /replications/effect/<slug>
   * routes, which have already 404'd unresolvable keys server-side. Everything
   * else — view mode, search, media type, artist sort — lives in query params
   * (see galleryUrlState), so every state of this component is a URL.
   */
  focus?: GalleryFocus;
}

const MASONRY_CLASS = 'columns-2 gap-3 sm:columns-3 lg:columns-4 [column-fill:_balance]';
const MASONRY_TILE_CLASS = 'mb-5 w-full break-inside-avoid';

/** Control-bar toggles keep their compact height but honor 44px on touch. */
const COARSE_TARGET_CLASS = '[@media(pointer:coarse)]:min-h-11';

/** Debounce for search keystrokes → URL writes (history stays clean). */
const QUERY_WRITE_DELAY_MS = 250;

export function ReplicationsGalleryExplorer({
  replications,
  effects,
  effectHrefPrefix = '/effects',
  contributorDirectory,
  focus,
}: ReplicationsGalleryExplorerProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const browse = parseGalleryBrowseState(searchParams);

  const mode: GalleryMode = focus ? focus.kind : browse.view;
  const typeFilter = browse.type;
  const artistSort = browse.sort;

  /**
   * The search box needs a per-keystroke value while the URL write debounces
   * behind it, so the input is a controlled mirror of `?q=` rather than being
   * driven by it directly. `lastWrittenQuery` tells our own replace() echoing
   * back through useSearchParams apart from an external navigation
   * (back/forward, a pasted URL): only the latter may reset the input, and it
   * also cancels any pending write so a stale keystroke cannot undo history.
   */
  const inputRef = useRef<HTMLInputElement>(null);
  const lastWrittenQueryRef = useRef(browse.query);
  const debounceRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (browse.query === lastWrittenQueryRef.current) {
      return;
    }
    lastWrittenQueryRef.current = browse.query;
    clearTimeout(debounceRef.current);
    if (inputRef.current) {
      inputRef.current.value = browse.query;
    }
  }, [browse.query]);

  useEffect(() => () => clearTimeout(debounceRef.current), []);

  /** Every toggle writes the *whole* state, flushing any pending search text. */
  const currentInputQuery = () => inputRef.current?.value ?? browse.query;

  const navigate = (url: string, method: 'push' | 'replace') => {
    clearTimeout(debounceRef.current);
    router[method](url, { scroll: false });
  };

  const updateQuery = (next: string) => {
    clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(() => {
      lastWrittenQueryRef.current = next;
      // Searching from a focus page returns to the browse view (a focused
      // group and a cross-corpus search cannot both be true), keeping the
      // grouping mode — pushed, so Back lands on the focus page again.
      const url = buildGalleryBrowseUrl({ view: mode, query: next, type: typeFilter, sort: artistSort });
      if (focus) {
        router.push(url, { scroll: false });
      } else {
        router.replace(url, { scroll: false });
      }
    }, QUERY_WRITE_DELAY_MS);
  };

  const switchMode = (next: GalleryMode) => {
    lastWrittenQueryRef.current = currentInputQuery();
    navigate(
      buildGalleryBrowseUrl({ view: next, query: currentInputQuery(), type: typeFilter, sort: artistSort }),
      'push',
    );
  };

  const setTypeFilter = (next: GalleryTypeFilter) => {
    lastWrittenQueryRef.current = currentInputQuery();
    navigate(
      focus
        ? buildGalleryFocusUrl(focus, { type: next })
        : buildGalleryBrowseUrl({ view: mode, query: currentInputQuery(), type: next, sort: artistSort }),
      'push',
    );
  };

  const setArtistSort = (next: GalleryArtistSort) => {
    lastWrittenQueryRef.current = currentInputQuery();
    navigate(
      buildGalleryBrowseUrl({ view: mode, query: currentInputQuery(), type: typeFilter, sort: next }),
      'push',
    );
  };

  const displayable = useMemo(() => replications.filter(isDisplayable), [replications]);

  const effectName = useMemo(() => effectNameLookup(effects), [effects]);
  const effectHref = useMemo(() => effectHrefBuilder(effectHrefPrefix), [effectHrefPrefix]);

  const counts = useMemo(() => countGallery(displayable), [displayable]);

  const query = focus ? '' : browse.query;
  const searching = query.trim().length > 0;

  const filtered = useMemo(
    () => displayable.filter((item) => matchesType(item, typeFilter) && matchesQuery(item, query, effectName)),
    [displayable, typeFilter, query, effectName],
  );

  const groups = useMemo(() => {
    if (mode === 'artist') return groupByArtist(filtered, artistSort, contributorDirectory);
    return groupByEffect(filtered, effectName, effectHref);
  }, [mode, filtered, artistSort, effectName, effectHref, contributorDirectory]);

  const spotlight = useMemo(() => selectSpotlight(displayable), [displayable]);

  /**
   * Focus is resolved against the *unfiltered* corpus — the route validated it
   * there, and the header (name, profile link) must survive a `?type=` that
   * matches none of the group's works; only the masonry empties.
   */
  const focusedGroup = useMemo(
    () =>
      focus
        ? resolveGalleryFocus(focus, displayable, { effects, contributorDirectory, effectHrefPrefix })?.group ?? null
        : null,
    [focus, displayable, effects, contributorDirectory, effectHrefPrefix],
  );
  const focusedItems = useMemo(
    () => (focusedGroup ? focusedGroup.items.filter((item) => matchesType(item, typeFilter)) : []),
    [focusedGroup, typeFilter],
  );

  const renderMasonry = (items: GalleryReplication[]) => (
    <div className={MASONRY_CLASS}>
      {items.map((replication) => (
        <GalleryMediaTile
          key={replication._id}
          replication={replication}
          className={MASONRY_TILE_CLASS}
          frameClassName="w-full"
        />
      ))}
    </div>
  );

  const hasMedia = counts.total > 0;
  const browseAllUrl = buildGalleryBrowseUrl({ view: mode, type: typeFilter, sort: artistSort });

  return (
    <section
      aria-label="Replications gallery"
      className="mx-auto mt-6 w-full max-w-7xl rounded-[2rem] border border-[color:var(--theme-border-subtle)] bg-[var(--theme-page-end)] px-4 py-6 shadow-[var(--theme-elevation-top-highlight)] sm:px-6 sm:py-8"
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
            <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-center gap-2 rounded-2xl border border-[color:var(--theme-frosted-control-border)] bg-[var(--theme-frosted-control-bg)] p-2 shadow-[var(--theme-frosted-control-shadow)] backdrop-blur-md sm:gap-3">
              <ToggleGroup
                type="single"
                variant="pill"
                value={mode}
                onValueChange={(value) => value && switchMode(value as GalleryMode)}
                aria-label="Browse by"
              >
                <ToggleGroupItem value="artist" className={COARSE_TARGET_CLASS}>By artist</ToggleGroupItem>
                <ToggleGroupItem value="effect" className={COARSE_TARGET_CLASS}>By effect</ToggleGroupItem>
              </ToggleGroup>

              <div className="relative min-w-[10rem] flex-1">
                <Icon
                  icon="lucide:search"
                  className="theme-text-faint pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2"
                />
                <Input
                  ref={inputRef}
                  defaultValue={browse.query}
                  onChange={(event) => updateQuery(event.target.value)}
                  placeholder="Search art, artist, effect"
                  className="h-9 pl-9 [@media(pointer:coarse)]:h-11"
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
                <ToggleGroupItem value="all" className={COARSE_TARGET_CLASS}>All</ToggleGroupItem>
                <ToggleGroupItem value="image" className={COARSE_TARGET_CLASS}>Images</ToggleGroupItem>
                <ToggleGroupItem value="video" className={COARSE_TARGET_CLASS}>Videos</ToggleGroupItem>
              </ToggleGroup>

              {mode === 'artist' && !searching && !focus ? (
                <ToggleGroup
                  type="single"
                  variant="pill"
                  value={artistSort}
                  onValueChange={(value) => value && setArtistSort(value as GalleryArtistSort)}
                  aria-label="Sort artists"
                >
                  <ToggleGroupItem value="count" className={COARSE_TARGET_CLASS}>Most works</ToggleGroupItem>
                  <ToggleGroupItem value="alpha" className={COARSE_TARGET_CLASS}>A–Z</ToggleGroupItem>
                </ToggleGroup>
              ) : null}
            </div>
          </div>

          {/* Spotlight — only on the unfiltered browse view */}
          {!searching && !focus && spotlight.length > 0 ? (
            <div className="mt-8 space-y-3">
              <div className="flex items-center justify-center gap-2 px-1">
                <Icon icon="lucide:sparkles" className="h-4 w-4 text-[var(--theme-accent-strong)]" />
                <h2 className="theme-text-muted text-xs font-semibold uppercase tracking-[0.22em]">
                  Spotlight
                </h2>
              </div>
              <div className="flex snap-x snap-mandatory justify-center gap-3 overflow-x-auto pb-2 [scrollbar-width:thin]">
                {spotlight.map((replication) => (
                  <GalleryMediaTile
                    key={replication._id}
                    replication={replication}
                    className="shrink-0 snap-start"
                    frameClassName="h-56 sm:h-72"
                  />
                ))}
              </div>
            </div>
          ) : null}

          {/* Focused single-group view (own URL: /replications/artist|effect/<key>) */}
          {focus && focusedGroup ? (
            <div className="mt-8 space-y-4">
              <div className="flex flex-wrap items-baseline justify-between gap-3 px-1">
                <div className="min-w-0">
                  <Link
                    href={browseAllUrl}
                    className="theme-text-muted group inline-flex min-h-11 items-center gap-1 rounded-full text-sm font-medium transition-colors hover:text-[var(--theme-accent-strong)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--theme-accent-strong)] motion-reduce:transition-none"
                  >
                    <Icon icon="lucide:arrow-left" className="h-4 w-4 transition group-hover:-translate-x-0.5 motion-reduce:transition-none" />
                    All {mode === 'artist' ? 'artists' : 'effects'}
                  </Link>
                  <h2 className="theme-text-primary font-display mt-1 text-2xl font-bold tracking-tight">
                    {focusedGroup.label}
                  </h2>
                  {focusedGroup.href ? (
                    <Link
                      href={focusedGroup.href}
                      className={cn(
                        'theme-text-muted group/profile mt-1 inline-flex min-h-11 items-center gap-1 text-sm font-medium transition-colors hover:text-[var(--theme-accent-strong)] motion-reduce:transition-none',
                        focusRingClassName,
                      )}
                    >
                      {mode === 'artist' ? 'View profile' : 'View effect article'}
                      <Icon icon="lucide:arrow-right" className="h-4 w-4 transition group-hover/profile:translate-x-0.5 motion-reduce:transition-none" />
                    </Link>
                  ) : null}
                  {mode === 'artist' && focusedGroup.externalUrl ? (
                    <a
                      href={focusedGroup.externalUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={cn(
                        'theme-text-faint ml-3 mt-1 inline-flex min-h-11 items-center gap-1 text-sm font-medium transition-colors hover:text-[var(--theme-accent-strong)] motion-reduce:transition-none',
                        focusRingClassName,
                      )}
                    >
                      Own site
                      <Icon icon="lucide:arrow-up-right" className="h-4 w-4" />
                    </a>
                  ) : null}
                </div>
                <span className="theme-text-faint text-xs tabular-nums">
                  {focusedItems.length} works
                </span>
              </div>
              {focusedItems.length > 0 ? (
                renderMasonry(focusedItems)
              ) : (
                <SearchEmptyState
                  className="mt-8"
                  icon="lucide:search-x"
                  title={`No ${typeFilter === 'video' ? 'videos' : 'images'} here`}
                  description={`${focusedGroup.label} has no ${typeFilter === 'video' ? 'video' : 'image'} works. Switch the media filter to see everything.`}
                />
              )}
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
            /* Browse — rails per group; "See all" is a crawlable focus URL */
            <div className="mt-8 space-y-10">
              {groups.map((group) => (
                <MediaRail
                  key={group.key}
                  group={group}
                  viewAllHref={buildGalleryFocusUrl(
                    { kind: mode, key: galleryGroupUrlKey(mode, group) },
                    { type: typeFilter },
                  )}
                />
              ))}
            </div>
          )}

          {/* Rights footnote */}
          <p className="theme-text-ghost mx-auto mt-10 max-w-3xl px-1 text-center text-xs leading-5">
            Replication media is credited to its creator when known. Rights remain with the original
            creator or rightsholder unless an individual item states another license. See the{" "}
            <Link href="/docs/license#replication-media-terms" className={proseLinkClassName}>
              licensing terms
            </Link>{" "}
            to correct a credit or request removal.
          </p>
        </>
      )}

    </section>
  );
}
