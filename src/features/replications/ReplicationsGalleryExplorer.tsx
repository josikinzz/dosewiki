"use client";

import {
  Suspense,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Icon } from "@/components/common/Icon";
import { Button } from "@/components/ui/button";
import { proseLinkClassName } from "@/components/common/ProseLink";
import { SearchEmptyState } from "@/components/common/SearchEmptyState";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { focusRingClassName } from "@/components/ui/surface";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { cn } from "@/lib/utils";
import type { ContributorDirectory } from "@server/contributorDirectory";
import type { PublicGalleryReplicationPreview } from "@/types/replications";
import { GalleryMediaTile } from "@/features/effects/gallery/GalleryMediaTile";
import { MediaRail } from "@/features/effects/gallery/MediaRail";
import {
  countGallery,
  effectHrefBuilder,
  effectNameLookup,
  galleryGroupUrlKey,
  groupByArtist,
  groupByEffect,
  isDisplayable,
  isWithheldFromArtistViews,
  matchesQuery,
  matchesType,
  sortWithinGroup,
  splitRailsAndPool,
  type GalleryArtistSort,
  type GalleryMode,
  type GalleryTypeFilter,
} from "@/features/effects/gallery/galleryModel";
import { ReplicationViewerOverlay } from "./viewer/ReplicationViewerOverlay";
import { viewerCollectionFromGalleryGroups } from "./viewer/viewerModel";
import { resolveGalleryFocus } from "./galleryFocus";
import {
  buildGalleryBrowseUrl,
  buildGalleryFocusUrl,
  buildReplicationViewerUrl,
  closeReplicationViewerUrl,
  GALLERY_BROWSE_DEFAULTS,
  parseGalleryBrowseState,
  type GalleryBrowseState,
  parseReplicationViewerSlug,
  type GalleryFocus,
} from "./galleryUrlState";

interface EffectSummary {
  slug: string;
  name: string;
  tags: string[];
}

export interface ReplicationsGalleryExplorerProps {
  replications: PublicGalleryReplicationPreview[];
  effects: EffectSummary[];
  effectHrefPrefix?: string;
  /**
   * Read on the server and passed down for the contributor-curated
   * `replicationOrder` inside artist groups. `lib/contributorDirectory` is
   * deliberately free of `server-only` imports — it is just the shared matcher
   * plus `publicHref` — so the lookup itself is safe on this side of the
   * boundary; the *data* is not, which is why it arrives as a prop rather
   * than a fetch.
   */
  contributorDirectory?: ContributorDirectory;
  /**
   * Set by the `/replications/artist/<key>` route after it resolves the key.
   * Browse mode, search, media type, and artist sort live in query params, so
   * every public Gallery state still has a stable URL.
   */
  focus?: GalleryFocus;
  /**
   * The Artist Page's identity decoration (avatar, role, bio, links), rendered
   * server-side when a Contributor Profile claims the focused artist's credit
   * line. Only meaningful with an artist `focus`; absent, the focus header is
   * the plain name — the same page shape, undecorated. The Unattributed
   * bucket's route never passes one.
   */
  focusIdentity?: ReactNode;
  /**
   * Which shell the explorer wears. The `(tabs)` gallery keeps `'full'` — the
   * sticky control bar (browse-mode toggle, search, media-type pills, artist
   * sort) plus the corpus stats line. The Artist Page passes `'focus-only'`:
   * it is a profile, not a querying surface, so only the focus view itself
   * renders (back link, heading, identity, masonry, deck). The `?type=`
   * filter in a shared URL still applies; there is just no control to change
   * it here.
   */
  chrome?: "full" | "focus-only";
}

/**
 * Phones get a denser, media-first masonry (three thin columns, hairline
 * gutters, captions hidden via `mobileCompact`); from `sm` up the grid
 * relaxes back to the readable card layout with visible captions.
 */
const MASONRY_CLASS =
  "columns-3 gap-1.5 sm:columns-3 sm:gap-3 lg:columns-4 [column-fill:_balance]";
const MASONRY_TILE_CLASS = "mb-1.5 w-full break-inside-avoid sm:mb-3";

/** Control-bar toggles keep their compact height but honor 44px on touch. */
const COARSE_TARGET_CLASS = "[@media(pointer:coarse)]:min-h-11";

/** Debounce for search keystrokes → URL writes (history stays clean). */
const QUERY_WRITE_DELAY_MS = 250;

/**
 * Public entry. The browse state (?view/?q/?type/?sort) is read on the client
 * so the /replications routes can stay statically rendered; Next requires a
 * Suspense boundary around `useSearchParams` for that. The fallback renders
 * the same explorer with the default browse state, so the prerendered HTML is
 * the full default gallery — crawlable grid included — and a pasted URL's
 * filters apply as soon as the client render takes over.
 */
export function ReplicationsGalleryExplorer(
  props: ReplicationsGalleryExplorerProps,
) {
  return (
    <Suspense
      fallback={
        <GalleryExplorer
          {...props}
          browse={GALLERY_BROWSE_DEFAULTS}
          viewerSlugParam={null}
        />
      }
    >
      <UrlStateGalleryExplorer {...props} />
    </Suspense>
  );
}

/** The one component allowed to touch `useSearchParams` — see above. */
function UrlStateGalleryExplorer(props: ReplicationsGalleryExplorerProps) {
  const searchParams = useSearchParams();
  const browse = parseGalleryBrowseState(searchParams);
  const viewerSlugParam = parseReplicationViewerSlug(searchParams);
  return (
    <GalleryExplorer
      {...props}
      browse={browse}
      viewerSlugParam={viewerSlugParam}
    />
  );
}

function GalleryExplorer({
  replications,
  effects,
  effectHrefPrefix = "/effects",
  contributorDirectory,
  focus,
  focusIdentity,
  chrome = "full",
  browse,
  viewerSlugParam,
}: ReplicationsGalleryExplorerProps & {
  browse: GalleryBrowseState;
  viewerSlugParam: string | null;
}) {
  const router = useRouter();

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

  /**
   * True while a typed query sits in the debounce window waiting for its URL
   * write. Drives a small spinner at the input's right edge — the only
   * feedback that a keystroke was heard before the results actually move.
   */
  const [queryWritePending, setQueryWritePending] = useState(false);

  /** Cancel a scheduled `?q=` write and retire its pending indicator. */
  const cancelQueryWrite = () => {
    clearTimeout(debounceRef.current);
    setQueryWritePending(false);
  };

  useEffect(() => {
    if (browse.query === lastWrittenQueryRef.current) {
      return;
    }
    lastWrittenQueryRef.current = browse.query;
    cancelQueryWrite();
    if (inputRef.current) {
      inputRef.current.value = browse.query;
    }
  }, [browse.query]);

  useEffect(() => () => clearTimeout(debounceRef.current), []);

  /**
   * Mobile-only disclosure state. Below `sm` the bar keeps exactly one row:
   * the search input lives behind an icon button (the input takes over the
   * row while open, collapsing on blur/Escape), and the browse-mode toggle
   * lives behind a Filters chip opening a near-full-bleed popover. Popover
   * rather than a new Sheet primitive is the kit's standing convention for
   * phone control sheets (see the review bar's overflow) — the kit has no
   * Sheet, and inventing one here would be a second convention. From `sm` up
   * both states are inert: the full control set renders inline.
   */
  const [searchExpanded, setSearchExpanded] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);

  useEffect(() => {
    if (searchExpanded) inputRef.current?.focus();
  }, [searchExpanded]);

  /** Every toggle writes the *whole* state, flushing any pending search text. */
  const currentInputQuery = () => inputRef.current?.value ?? browse.query;

  const navigate = (url: string, method: "push" | "replace") => {
    cancelQueryWrite();
    router[method](url, { scroll: false });
  };

  const updateQuery = (next: string) => {
    clearTimeout(debounceRef.current);
    setQueryWritePending(true);
    debounceRef.current = window.setTimeout(() => {
      setQueryWritePending(false);
      lastWrittenQueryRef.current = next;
      // Searching from a focus page returns to the browse view (a focused
      // group and a cross-corpus search cannot both be true), keeping the
      // grouping mode — pushed, so Back lands on the focus page again.
      const url = buildGalleryBrowseUrl({
        view: mode,
        query: next,
        type: typeFilter,
        sort: artistSort,
      });
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
      buildGalleryBrowseUrl({
        view: next,
        query: currentInputQuery(),
        type: typeFilter,
        sort: artistSort,
      }),
      "push",
    );
  };

  const setTypeFilter = (next: GalleryTypeFilter) => {
    lastWrittenQueryRef.current = currentInputQuery();
    navigate(
      focus
        ? buildGalleryFocusUrl(focus, { type: next })
        : buildGalleryBrowseUrl({
            view: mode,
            query: currentInputQuery(),
            type: next,
            sort: artistSort,
          }),
      "push",
    );
  };

  const setArtistSort = (next: GalleryArtistSort) => {
    lastWrittenQueryRef.current = currentInputQuery();
    navigate(
      buildGalleryBrowseUrl({
        view: mode,
        query: currentInputQuery(),
        type: typeFilter,
        sort: next,
      }),
      "push",
    );
  };

  const displayable = useMemo(
    () => replications.filter(isDisplayable),
    [replications],
  );

  const effectName = useMemo(() => effectNameLookup(effects), [effects]);
  const linkableEffectSlugSet = useMemo(
    () => new Set(effects.map(({ slug }) => slug)),
    [effects],
  );
  const effectHref = useMemo(
    () => effectHrefBuilder(effectHrefPrefix, linkableEffectSlugSet),
    [effectHrefPrefix, linkableEffectSlugSet],
  );

  const query = focus ? "" : browse.query;
  const searching = query.trim().length > 0;

  /**
   * The header counts describe the corpus behind what is on screen. Artist
   * browsing withholds the works of some effects (`isWithheldFromArtistViews`),
   * so it counts its own narrower corpus: a header claiming more works than the
   * grid can ever show is a bug. Search reaches across the whole displayable
   * corpus in either mode, so while searching the counts do too.
   */
  const counted = useMemo(
    () =>
      mode === "artist" && !searching
        ? displayable.filter((item) => !isWithheldFromArtistViews(item))
        : displayable,
    [mode, searching, displayable],
  );
  const counts = useMemo(() => countGallery(counted), [counted]);

  const filtered = useMemo(
    () =>
      displayable.filter(
        (item) =>
          matchesType(item, typeFilter) &&
          matchesQuery(item, query, effectName),
      ),
    [displayable, typeFilter, query, effectName],
  );

  const groups = useMemo(() => {
    if (mode === "artist")
      return groupByArtist(filtered, artistSort, contributorDirectory);
    return groupByEffect(filtered, effectName, effectHref);
  }, [
    mode,
    filtered,
    artistSort,
    effectName,
    effectHref,
    contributorDirectory,
  ]);

  /**
   * Hybrid browse layout: groups with enough works keep their own rail; the
   * thin tail pools into one dense masonry below the rails so a one-work
   * artist costs one tile, not a whole row.
   */
  const { rails, pool } = useMemo(() => splitRailsAndPool(groups), [groups]);
  const pooledItems = useMemo(
    () => pool.flatMap((group) => group.items),
    [pool],
  );

  /**
   * Focus is resolved against the *unfiltered* corpus — the route validated it
   * there, and the header (name, profile link) must survive a `?type=` that
   * matches none of the group's works; only the masonry empties.
   */
  const focusedGroup = useMemo(
    () =>
      focus
        ? (resolveGalleryFocus(focus, displayable, {
            effects,
            contributorDirectory,
            effectHrefPrefix,
          })?.group ?? null)
        : null,
    [focus, displayable, effects, contributorDirectory, effectHrefPrefix],
  );
  const focusedItems = useMemo(
    () =>
      focusedGroup
        ? focusedGroup.items.filter((item) => matchesType(item, typeFilter))
        : [],
    [focusedGroup, typeFilter],
  );

  const viewerGroups = useMemo(() => {
    if (focus && focusedGroup) {
      return [
        {
          ...focusedGroup,
          items: focusedItems,
          count: focusedItems.length,
        },
      ];
    }
    if (mode === "artist") {
      return groupByArtist(filtered, artistSort, contributorDirectory);
    }
    return groupByEffect(filtered, effectName, effectHref);
  }, [
    artistSort,
    contributorDirectory,
    effectHref,
    effectName,
    filtered,
    focus,
    focusedGroup,
    focusedItems,
    mode,
  ]);
  const viewerSourcePath = focus
    ? buildGalleryFocusUrl(focus, { type: typeFilter })
    : buildGalleryBrowseUrl({
        view: mode,
        query,
        type: typeFilter,
        sort: artistSort,
      });
  const viewerCollection = useMemo(() => {
    const collection = viewerCollectionFromGalleryGroups(
      viewerGroups,
      mode,
      viewerSourcePath,
      effectName,
    );
    if (!focus || !focusedGroup) return collection;
    return {
      ...collection,
      label:
        focus.kind === "artist"
          ? `Works by ${focusedGroup.label}`
          : `${focusedGroup.label} replications`,
      grouping: "none" as const,
    };
  }, [effectName, focus, focusedGroup, mode, viewerGroups, viewerSourcePath]);
  const validViewerSlugParam =
    viewerSlugParam &&
    viewerCollection.groups.some((entry) =>
      entry.items.some((item) => item.replication.slug === viewerSlugParam),
    )
      ? viewerSlugParam
      : null;
  const [viewerSlug, setViewerSlug] = useState<string | null>(
    validViewerSlugParam,
  );

  useEffect(() => {
    setViewerSlug(validViewerSlugParam);
    if (viewerSlugParam && !validViewerSlugParam) {
      const source = `${window.location.pathname}${window.location.search}${window.location.hash}`;
      window.history.replaceState(
        window.history.state,
        "",
        closeReplicationViewerUrl(source),
      );
    }
  }, [validViewerSlugParam, viewerSlugParam]);

  const launchViewer = (slug: string) => {
    if (
      !viewerCollection.groups.some((entry) =>
        entry.items.some((item) => item.replication.slug === slug),
      )
    ) {
      return;
    }
    const source = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    window.history.pushState(
      { ...window.history.state, replicationViewer: true },
      "",
      buildReplicationViewerUrl(source, slug),
    );
    setViewerSlug(slug);
  };

  const openViewerAt = (
    event: React.MouseEvent,
    replication: PublicGalleryReplicationPreview,
  ) => {
    if (
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    ) {
      return;
    }
    event.preventDefault();
    launchViewer(replication.slug);
  };

  /**
   * Every tile opens the same in-page viewer. The underlying anchor remains a
   * permanent work link for modified clicks, new tabs, and crawlers.
   */
  const renderMasonry = (
    items: PublicGalleryReplicationPreview[],
    {
      showByline = true,
      onOpen = openViewerAt,
    }: {
      showByline?: boolean;
      onOpen?: (
        event: React.MouseEvent,
        replication: PublicGalleryReplicationPreview,
      ) => void;
    } = {},
  ) => (
    <div className={MASONRY_CLASS}>
      {items.map((replication) => (
        <GalleryMediaTile
          key={replication._id}
          replication={replication}
          className={MASONRY_TILE_CLASS}
          frameClassName="w-full"
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
  );

  // The gallery section exists whenever it holds media at all — the mode
  // toggle has to stay reachable even if one mode's own corpus is empty.
  const hasMedia = displayable.length > 0;
  const browseAllUrl = buildGalleryBrowseUrl({
    view: mode,
    type: typeFilter,
    sort: artistSort,
  });

  /**
   * The artist-sort toggle only applies to the artist browse view, but it
   * stays mounted (inert + invisible) elsewhere so the control bar keeps one
   * width across mode switches instead of jittering.
   */
  const sortActive = mode === "artist" && !searching && !focus;

  return (
    <>
      <section
        aria-label="Replications gallery"
        className="mx-auto mt-4 w-full max-w-7xl"
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
            <div className="flex justify-end">
              <Button
                type="button"
                onClick={() => {
                  const first = viewerCollection.groups[0]?.items[0];
                  if (first) launchViewer(first.replication.slug);
                }}
                className="min-h-11 w-full gap-2 sm:w-auto"
                aria-label="Open replication viewer"
              >
                <Icon icon="lucide:play" className="h-4 w-4" aria-hidden />
                Open viewer
              </Button>
            </div>

            {/* Sticky control bar — the gallery's only elevated surface now that
              the card wrapper is gone. Offset: the site header (.app-header,
              components.css) is itself sticky at top-0/z-50 and measures 68px
              (py-3 + its 44px controls), so a small offset like top-2 would
              pin this bar underneath it. 4.75rem = 68px header + 8px gap
              keeps the bar fully visible below the header while pinned.

              The row NEVER wraps (flex-nowrap + min-w-0 discipline), so the
              sticky chrome is always one header row plus this one control row.
              Below `sm` the browse-mode toggle folds behind the Filters chip,
              search behind an icon button that swaps the row for the input,
              and the media-type pills wear glyphs instead of words. From `sm`
              up every control is inline; the artist sort — three pills since
              video-first sorting landed — stays a compact menu until `md`,
              where the row first has room for the full pill set.

              Under `focus-only` chrome the bar (and the stats line below) is
              suppressed entirely — see the `chrome` prop. */}
            {chrome === "full" ? (
              <div className="sticky top-[4.75rem] z-20 mt-4 md:mt-0">
                <div
                  data-testid="gallery-control-bar"
                  className="flex w-full min-w-0 flex-nowrap items-center gap-2 rounded-2xl border border-[color:var(--theme-frosted-control-border)] bg-[var(--theme-frosted-control-bg)] p-2 shadow-[var(--theme-frosted-control-shadow)] backdrop-blur-md sm:gap-3"
                >
                  <ToggleGroup
                    type="single"
                    variant="pill"
                    value={mode}
                    onValueChange={(value) =>
                      value && switchMode(value as GalleryMode)
                    }
                    aria-label="Browse by"
                    className="hidden shrink-0 sm:flex"
                  >
                    <ToggleGroupItem
                      value="artist"
                      className={COARSE_TARGET_CLASS}
                    >
                      By artist
                    </ToggleGroupItem>
                    <ToggleGroupItem
                      value="effect"
                      className={COARSE_TARGET_CLASS}
                    >
                      By effect
                    </ToggleGroupItem>
                  </ToggleGroup>

                  {/* Always mounted so the tests and the debounce wiring see one
                    input; below `sm` its visibility is the expand/collapse
                    state, from `sm` up it is simply the inline search box. */}
                  <div
                    className={cn(
                      "relative min-w-0 flex-1",
                      searchExpanded ? "block" : "hidden sm:block",
                    )}
                  >
                    <Icon
                      icon="lucide:search"
                      className="theme-text-faint pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2"
                    />
                    <Input
                      ref={inputRef}
                      id="replications-gallery-search"
                      defaultValue={browse.query}
                      onChange={(event) => updateQuery(event.target.value)}
                      onBlur={() => searchExpanded && setSearchExpanded(false)}
                      onKeyDown={(event) => {
                        if (event.key === "Escape" && searchExpanded) {
                          event.preventDefault();
                          setSearchExpanded(false);
                        }
                      }}
                      placeholder="Search art, artist, effect"
                      className="h-9 pl-9 [@media(pointer:coarse)]:h-11"
                      inputMode="search"
                      aria-label="Search replications"
                    />
                    {/* Decorative only (aria-hidden): the debounce is 250ms, and a
                      live region firing per keystroke would be pure noise. */}
                    {queryWritePending ? (
                      <span
                        aria-hidden
                        data-testid="query-write-pending"
                        className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2"
                      >
                        <Icon
                          icon="svg-spinners:ring-resize"
                          className="theme-text-faint h-4 w-4"
                        />
                      </span>
                    ) : null}
                  </div>

                  <ToggleGroup
                    type="single"
                    variant="pill"
                    value={typeFilter}
                    onValueChange={(value) =>
                      value && setTypeFilter(value as GalleryTypeFilter)
                    }
                    aria-label="Filter by media type"
                    className={cn(
                      "shrink-0",
                      searchExpanded && "hidden sm:flex",
                    )}
                  >
                    <ToggleGroupItem
                      value="all"
                      className={COARSE_TARGET_CLASS}
                    >
                      All
                    </ToggleGroupItem>
                    <ToggleGroupItem
                      value="image"
                      aria-label="Images"
                      className={COARSE_TARGET_CLASS}
                    >
                      <Icon
                        icon="lucide:image"
                        className="sm:hidden"
                        aria-hidden
                      />
                      <span className="hidden sm:inline">Images</span>
                    </ToggleGroupItem>
                    <ToggleGroupItem
                      value="video"
                      aria-label="Videos"
                      className={COARSE_TARGET_CLASS}
                    >
                      <Icon
                        icon="lucide:video"
                        className="sm:hidden"
                        aria-hidden
                      />
                      <span className="hidden sm:inline">Videos</span>
                    </ToggleGroupItem>
                  </ToggleGroup>

                  {/* Full sort pill set — the row only has room for it from `md`. */}
                  <ToggleGroup
                    type="single"
                    variant="pill"
                    value={artistSort}
                    onValueChange={(value) =>
                      value && setArtistSort(value as GalleryArtistSort)
                    }
                    aria-label="Sort artists"
                    aria-hidden={!sortActive || undefined}
                    inert={!sortActive}
                    className={cn(
                      "hidden shrink-0 md:flex",
                      !sortActive && "invisible",
                    )}
                  >
                    <ToggleGroupItem
                      value="video-first"
                      className={COARSE_TARGET_CLASS}
                    >
                      Videos first
                    </ToggleGroupItem>
                    <ToggleGroupItem
                      value="count"
                      className={COARSE_TARGET_CLASS}
                    >
                      Most works
                    </ToggleGroupItem>
                    <ToggleGroupItem
                      value="alpha"
                      className={COARSE_TARGET_CLASS}
                    >
                      A–Z
                    </ToggleGroupItem>
                  </ToggleGroup>

                  {/* Compact sort — one menu button below `md`. Like the pill set
                    it stays mounted (inert + invisible) outside the artist
                    browse view so the row keeps one width across mode switches. */}
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        type="button"
                        variant="pill"
                        size="auto"
                        aria-label="Sort artists"
                        aria-hidden={!sortActive || undefined}
                        inert={!sortActive}
                        className={cn(
                          "flex h-8 w-8 shrink-0 items-center justify-center p-0 md:hidden [@media(pointer:coarse)]:h-11 [@media(pointer:coarse)]:w-11",
                          searchExpanded && "hidden",
                          !sortActive && "invisible",
                        )}
                      >
                        <Icon
                          icon="lucide:arrow-down-wide-narrow"
                          className="h-4 w-4"
                          aria-hidden
                        />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuRadioGroup
                        value={artistSort}
                        onValueChange={(value) =>
                          setArtistSort(value as GalleryArtistSort)
                        }
                      >
                        <DropdownMenuRadioItem value="video-first">
                          Videos first
                        </DropdownMenuRadioItem>
                        <DropdownMenuRadioItem value="count">
                          Most works
                        </DropdownMenuRadioItem>
                        <DropdownMenuRadioItem value="alpha">
                          A–Z
                        </DropdownMenuRadioItem>
                      </DropdownMenuRadioGroup>
                    </DropdownMenuContent>
                  </DropdownMenu>

                  {/* Phone search reveal — expands into the input above, which
                    collapses back on blur or Escape. The dot marks a live query
                    that would otherwise be invisible while collapsed. */}
                  <Button
                    type="button"
                    variant="pill"
                    size="auto"
                    aria-label="Search replications"
                    aria-expanded={searchExpanded}
                    aria-controls="replications-gallery-search"
                    onClick={() => setSearchExpanded(true)}
                    className={cn(
                      "relative flex h-8 w-8 shrink-0 items-center justify-center p-0 sm:hidden [@media(pointer:coarse)]:h-11 [@media(pointer:coarse)]:w-11",
                      searchExpanded && "hidden",
                    )}
                  >
                    <Icon
                      icon="lucide:search"
                      className="h-4 w-4"
                      aria-hidden
                    />
                    {searching ? (
                      <span
                        aria-hidden
                        className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-[var(--theme-accent-strong)]"
                      />
                    ) : null}
                  </Button>

                  {/* Phone home for whatever the one-row bar cannot show inline —
                    today that is exactly the browse-mode toggle. */}
                  <Popover open={filtersOpen} onOpenChange={setFiltersOpen}>
                    <PopoverTrigger asChild>
                      <Button
                        type="button"
                        variant="pill"
                        size="pill"
                        className={cn(
                          "shrink-0 gap-1.5 sm:hidden",
                          COARSE_TARGET_CLASS,
                          searchExpanded && "hidden",
                        )}
                      >
                        <Icon
                          icon="lucide:sliders-horizontal"
                          className="h-4 w-4"
                          aria-hidden
                        />
                        Filters
                      </Button>
                    </PopoverTrigger>
                    {/* Near-full-bleed below `sm` — the same phone-sheet treatment
                      as the review bar's overflow popover. */}
                    <PopoverContent
                      align="end"
                      collisionPadding={8}
                      className="w-[calc(100vw-1rem)] space-y-2 sm:w-72"
                    >
                      <p className="theme-text-faint text-xs font-medium uppercase tracking-[0.14em]">
                        Browse by
                      </p>
                      <ToggleGroup
                        type="single"
                        variant="pill"
                        value={mode}
                        onValueChange={(value) => {
                          if (!value) return;
                          setFiltersOpen(false);
                          switchMode(value as GalleryMode);
                        }}
                        aria-label="Browse by"
                      >
                        <ToggleGroupItem
                          value="artist"
                          className={cn(COARSE_TARGET_CLASS, "flex-1")}
                        >
                          By artist
                        </ToggleGroupItem>
                        <ToggleGroupItem
                          value="effect"
                          className={cn(COARSE_TARGET_CLASS, "flex-1")}
                        >
                          By effect
                        </ToggleGroupItem>
                      </ToggleGroup>
                    </PopoverContent>
                  </Popover>
                </div>
              </div>
            ) : null}

            {/* One quiet corpus summary for every breakpoint — the bar itself
              stays reserved for controls. */}
            {chrome === "full" ? (
              <p className="theme-text-faint mt-3 px-1 text-xs tabular-nums">
                {counts.total} works · {counts.artists} artists ·{" "}
                {counts.effects} effects
              </p>
            ) : null}

            {/* Focused single-group view (own URL: /replications/artist|effect/<key>) */}
            {focus && focusedGroup ? (
              <div className="mt-6 space-y-4">
                <div className="flex flex-wrap items-baseline justify-between gap-3 px-1">
                  <div className="min-w-0">
                    <Link
                      href={browseAllUrl}
                      className="theme-text-muted group inline-flex min-h-11 items-center gap-1 rounded-full text-sm font-medium transition-colors hover:text-[var(--theme-accent-strong)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--theme-accent-strong)] motion-reduce:transition-none"
                    >
                      <Icon
                        icon="lucide:arrow-left"
                        className="h-4 w-4 transition group-hover:-translate-x-0.5 motion-reduce:transition-none"
                      />
                      All {mode === "artist" ? "artists" : "effects"}
                    </Link>
                    <h2 className="theme-text-primary font-display mt-1 text-2xl font-bold tracking-tight">
                      {focusedGroup.label}
                    </h2>
                    {/* An artist focus IS the artist's page now, so the old
                      "View profile" link would point at itself; only the
                      effect focus has a second destination worth naming. */}
                    {mode === "effect" && focusedGroup.href ? (
                      <Link
                        href={focusedGroup.href}
                        className={cn(
                          "theme-text-muted group/profile mt-1 inline-flex min-h-11 items-center gap-1 text-sm font-medium transition-colors hover:text-[var(--theme-accent-strong)] motion-reduce:transition-none",
                          focusRingClassName,
                        )}
                      >
                        View effect article
                        <Icon
                          icon="lucide:arrow-right"
                          className="h-4 w-4 transition group-hover/profile:translate-x-0.5 motion-reduce:transition-none"
                        />
                      </Link>
                    ) : null}
                    {mode === "artist" && focusedGroup.externalUrl ? (
                      <a
                        href={focusedGroup.externalUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={cn(
                          "theme-text-faint ml-3 mt-1 inline-flex min-h-11 items-center gap-1 text-sm font-medium transition-colors hover:text-[var(--theme-accent-strong)] motion-reduce:transition-none",
                          focusRingClassName,
                        )}
                      >
                        Own site
                        <Icon
                          icon="lucide:arrow-up-right"
                          className="h-4 w-4"
                        />
                      </a>
                    ) : null}
                  </div>
                  <span className="theme-text-faint text-xs tabular-nums">
                    {focusedItems.length} works
                  </span>
                </div>
                {mode === "artist" ? focusIdentity : null}
                {focusedItems.length > 0 ? (
                  // An artist focus already names the artist in its heading, so
                  // per-tile bylines would repeat it under every work; effect
                  // focus tiles keep them as the only attribution in sight.
                  // Artist-focus tiles open the viewer walking this artist.
                  renderMasonry(focusedItems, {
                    showByline: focus.kind !== "artist",
                  })
                ) : (
                  <SearchEmptyState
                    className="mt-8"
                    icon="lucide:search-x"
                    title={`No ${typeFilter === "video" ? "videos" : "images"} here`}
                    description={`${focusedGroup.label} has no ${typeFilter === "video" ? "videos" : "images"}. Switch the media filter to see everything.`}
                  />
                )}
              </div>
            ) : searching ? (
              /* Search results — flat masonry */
              filtered.length > 0 ? (
                <div className="mt-6 space-y-4">
                  <p className="theme-text-faint px-1 text-xs tabular-nums">
                    {filtered.length} result{filtered.length === 1 ? "" : "s"}{" "}
                    for “{query.trim()}”
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
                      /* The effect address is the playlist page now; it reads no
                       type filter, so only artist focus links carry one. */
                      mode === "artist" ? { type: typeFilter } : {},
                    )}
                    /* Artist rails carry the artist in their heading, so tile
                     bylines would echo it fourteen times; effect rails keep
                     bylines as each work's attribution. An artist rail's tiles
                     open the viewer walking that artist's works. */
                    tileBylines={mode !== "artist"}
                    viewerHrefFor={(replication) =>
                      buildReplicationViewerUrl(
                        viewerSourcePath,
                        replication.slug,
                      )
                    }
                    mobileCompact
                    onTileOpen={openViewerAt}
                  />
                ))}
                {pooledItems.length > 0 ? (
                  <section
                    aria-label={
                      mode === "artist" ? "More artists" : "More effects"
                    }
                    className="space-y-3"
                  >
                    {rails.length > 0 ? (
                      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-1">
                        <h2 className="theme-text-primary font-display text-lg font-semibold tracking-tight">
                          {mode === "artist" ? "More artists" : "More effects"}
                        </h2>
                        <span className="theme-text-faint text-xs tabular-nums">
                          {pool.length}{" "}
                          {mode === "artist" ? "artists" : "effects"} ·{" "}
                          {pooledItems.length} work
                          {pooledItems.length === 1 ? "" : "s"}
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
              Replication media is credited to its creator when known. Rights
              remain with the original creator or rightsholder unless an
              individual item states another license. See the{" "}
              <Link
                href="/docs/license#replication-media-terms"
                className={proseLinkClassName}
              >
                licensing terms
              </Link>{" "}
              to correct a credit or request removal.
            </p>
          </>
        )}
      </section>

      {viewerSlug && viewerCollection.groups.length > 0 ? (
        <ReplicationViewerOverlay
          collection={viewerCollection}
          initialSlug={viewerSlug}
          open
          onOpenChange={(nextOpen) => {
            if (!nextOpen) setViewerSlug(null);
          }}
        />
      ) : null}
    </>
  );
}
