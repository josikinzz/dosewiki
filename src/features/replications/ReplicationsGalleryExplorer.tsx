'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Icon } from '@/components/common/Icon';
import { Button } from '@/components/ui/button';
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
  sortWithinGroup,
  splitRailsAndPool,
  type GalleryArtistSort,
  type GalleryMode,
  type GalleryTypeFilter,
} from '@/features/effects/gallery/galleryModel';
import { ReplicationsSwipeDeck } from './components/ReplicationsSwipeDeck';
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
const MASONRY_TILE_CLASS = 'mb-3 w-full break-inside-avoid';

/** Control-bar toggles keep their compact height but honor 44px on touch. */
const COARSE_TARGET_CLASS = '[@media(pointer:coarse)]:min-h-11';

/** Debounce for search keystrokes → URL writes (history stays clean). */
const QUERY_WRITE_DELAY_MS = 250;

/**
 * Session flag remembering that the reader closed the immersive swipe deck;
 * while set, landing on the gallery shows the grid instead of re-opening it.
 */
const DECK_DISMISSED_KEY = 'replications-deck-dismissed';

/** Phone-shaped touch viewport: where the swipe deck is the default view. */
const DECK_MEDIA_QUERY = '(max-width: 767px) and (pointer: coarse)';

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

  /**
   * Hybrid browse layout: groups with enough works keep their own rail; the
   * thin tail pools into one dense masonry below the rails so a one-work
   * artist costs one tile, not a whole row.
   */
  const { rails, pool } = useMemo(() => splitRailsAndPool(groups), [groups]);
  const pooledItems = useMemo(() => pool.flatMap((group) => group.items), [pool]);

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

  /**
   * The immersive swipe deck (phones): always organized by artist over the
   * whole displayable corpus, regardless of the grid's current filters — the
   * deck is a viewing surface, the grid is the querying surface.
   */
  const deckGroups = useMemo(
    () => groupByArtist(displayable, 'count', contributorDirectory),
    [displayable, contributorDirectory],
  );
  const deckInitialIndex = useMemo(() => {
    if (focus?.kind !== 'artist') return 0;
    const index = deckGroups.findIndex((group) => galleryGroupUrlKey('artist', group) === focus.key);
    return index < 0 ? 0 : index;
  }, [focus, deckGroups]);

  const [deckOpen, setDeckOpen] = useState(false);

  /**
   * On phone-shaped touch viewports the deck *is* the default gallery: open it
   * on arrival unless the reader closed it earlier this session. Decided once
   * on mount — SSR HTML stays the crawlable grid, and later filter changes in
   * the grid must not resurrect the deck.
   */
  useEffect(() => {
    if (!window.matchMedia?.(DECK_MEDIA_QUERY).matches) return;
    let dismissed = false;
    try {
      dismissed = window.sessionStorage.getItem(DECK_DISMISSED_KEY) === '1';
    } catch {
      // Storage unavailable (privacy mode): treat as not dismissed.
    }
    if (!dismissed && mode === 'artist' && !searching) setDeckOpen(true);
    // Mount-only arrival decision, deliberately not reactive to mode/search.
  }, []);

  const closeDeck = () => {
    setDeckOpen(false);
    try {
      window.sessionStorage.setItem(DECK_DISMISSED_KEY, '1');
    } catch {
      // Best-effort memory; the deck simply reopens next visit.
    }
  };

  const openDeck = () => {
    try {
      window.sessionStorage.removeItem(DECK_DISMISSED_KEY);
    } catch {
      // Ignore: opening still works for this render.
    }
    setDeckOpen(true);
  };

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

  /**
   * The artist-sort toggle only applies to the artist browse view, but it
   * stays mounted (inert + invisible) elsewhere so the control bar keeps one
   * width across mode switches instead of jittering.
   */
  const sortActive = mode === 'artist' && !searching && !focus;

  /**
   * On phones the deck *replaces* the gallery card: it renders as its own
   * full-bleed, viewport-height section in the page flow (breaking out of the
   * layout's `px-4` gutter), so the reader swipes down past the intro and
   * tabs straight into it. `deckOpen` is only ever set on phone viewports,
   * so desktop always takes the card branch below.
   */
  if (deckOpen && deckGroups.length > 0) {
    return (
      <section aria-label="Replications gallery" className="-mx-4 mt-4">
        <ReplicationsSwipeDeck
          groups={deckGroups}
          effectName={effectName}
          initialGroupIndex={deckInitialIndex}
          onShowGrid={closeDeck}
        />
      </section>
    );
  }

  return (
    <section
      aria-label="Replications gallery"
      className="mx-auto mt-4 w-full max-w-7xl rounded-[2rem] border border-[color:var(--theme-border-subtle)] bg-[var(--theme-page-end)] px-4 py-4 shadow-[var(--theme-elevation-top-highlight)] sm:px-6 sm:py-6"
    >
      {!hasMedia ? (
        <SearchEmptyState
          className="mt-6"
          icon="lucide:image-off"
          title="No replications yet"
          description="Replication media has not been published yet. Check back soon."
        />
      ) : (
        <>
          {/* Re-entry into the swipe deck, phones only (the deck's own media
              query); hidden where the grid is the primary surface. */}
          <div className="md:hidden">
            <Button
              type="button"
              onClick={openDeck}
              className="w-full min-h-11 gap-2"
              aria-label="Open the swipe gallery"
            >
              <Icon icon="lucide:gallery-vertical" className="h-4 w-4" aria-hidden />
              Swipe view
            </Button>
          </div>

          {/* Sticky control bar — the card's header row, full width. */}
          <div className="sticky top-2 z-20 mt-4 md:mt-0">
            <div className="flex w-full flex-wrap items-center gap-2 rounded-2xl border border-[color:var(--theme-frosted-control-border)] bg-[var(--theme-frosted-control-bg)] p-2 shadow-[var(--theme-frosted-control-shadow)] backdrop-blur-md sm:gap-3">
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

              <ToggleGroup
                type="single"
                variant="pill"
                value={artistSort}
                onValueChange={(value) => value && setArtistSort(value as GalleryArtistSort)}
                aria-label="Sort artists"
                aria-hidden={!sortActive || undefined}
                inert={!sortActive}
                className={cn(!sortActive && 'invisible')}
              >
                <ToggleGroupItem value="count" className={COARSE_TARGET_CLASS}>Most works</ToggleGroupItem>
                <ToggleGroupItem value="alpha" className={COARSE_TARGET_CLASS}>A–Z</ToggleGroupItem>
              </ToggleGroup>

              <span className="theme-text-faint ml-auto hidden whitespace-nowrap px-1 text-xs tabular-nums md:inline">
                {counts.total} works · {counts.artists} artists · {counts.effects} effects
              </span>
            </div>
          </div>

          {/* Compact counts, small screens only — wider screens read them in the bar. */}
          <p className="theme-text-faint mt-3 px-1 text-xs tabular-nums md:hidden">
            {counts.total} works · {counts.artists} artists · {counts.effects} effects
          </p>

          {/* Focused single-group view (own URL: /replications/artist|effect/<key>) */}
          {focus && focusedGroup ? (
            <div className="mt-6 space-y-4">
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
                  description={`${focusedGroup.label} has no ${typeFilter === 'video' ? 'videos' : 'images'}. Switch the media filter to see everything.`}
                />
              )}
            </div>
          ) : searching ? (
            /* Search results — flat masonry */
            filtered.length > 0 ? (
              <div className="mt-6 space-y-4">
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
            /* Browse — rails for groups with enough works ("View all" is a
               crawlable focus URL); everything thinner pools into one dense
               masonry, where each tile's byline carries the attribution. */
            <div className="mt-4 space-y-10">
              {rails.map((group) => (
                <MediaRail
                  key={group.key}
                  group={group}
                  viewAllHref={buildGalleryFocusUrl(
                    { kind: mode, key: galleryGroupUrlKey(mode, group) },
                    { type: typeFilter },
                  )}
                />
              ))}
              {pooledItems.length > 0 ? (
                <section
                  aria-label={mode === 'artist' ? 'More artists' : 'More effects'}
                  className="space-y-3"
                >
                  {rails.length > 0 ? (
                    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-1">
                      <h2 className="theme-text-primary font-display text-lg font-semibold tracking-tight">
                        {mode === 'artist' ? 'More artists' : 'More effects'}
                      </h2>
                      <span className="theme-text-faint text-xs tabular-nums">
                        {pool.length} {mode === 'artist' ? 'artists' : 'effects'} ·{' '}
                        {pooledItems.length} work{pooledItems.length === 1 ? '' : 's'}
                      </span>
                    </div>
                  ) : null}
                  {renderMasonry(pooledItems)}
                </section>
              ) : null}
            </div>
          )}

          {/* Rights footnote */}
          <p className="theme-text-muted mx-auto mt-10 max-w-3xl px-1 text-center text-xs leading-5">
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
