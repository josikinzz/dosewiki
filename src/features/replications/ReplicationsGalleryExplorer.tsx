"use client";

import {
  Suspense,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Icon, type IconName } from "@/components/common/Icon";
import { icons } from "@/utils/iconNames";
import {
  dismissPrePaintRouteStateCover,
  PrePaintRouteStateCover,
} from "@/components/common/PrePaintRouteStateCover";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { proseLinkClassName } from "@/components/common/ProseLink";
import { SearchEmptyState } from "@/components/common/SearchEmptyState";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { focusRingClassName } from "@/components/ui/surface";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { TOUCH_ICON } from "@/components/ui/touchTargets";
import { msg, useT } from "@/i18n/client";
import { cn } from "@/lib/utils";
import type { ContributorDirectory } from "@server/contributorDirectory";
import type { PublicGalleryReplicationPreview } from "@/types/replications";
import { MediaRail } from "@/features/effects/gallery/MediaRail";
import {
  groupByArtist,
  groupByEffect,
  groupByYear,
  splitRailsAndPool,
} from "@/features/effects/gallery/galleryModel";
import {
  effectHrefBuilder,
  effectNameLookup,
  galleryGroupUrlKey,
  isDisplayable,
  isWithheldFromArtistViews,
  UNATTRIBUTED_KEY,
} from "@/features/effects/gallery/galleryArtistIdentity";
import {
  matchesQuery,
  matchesTaxonomyFilters,
  matchesType,
  matchesYear,
} from "@/features/effects/gallery/galleryFilters";
import {
  sortWithinGroup,
  sortWorksByDate,
} from "@/features/effects/gallery/galleryOrdering";
import {
  ARTIST_RAIL_PAGE,
  DEFAULT_GALLERY_TAXONOMY_FILTERS,
  defaultGalleryOrder,
  type GalleryCounts,
  type GalleryGroup,
  type GalleryMode,
  type GalleryOrder,
  type GalleryTypeFilter,
  type GalleryTaxonomyFilterState,
  type GalleryYearFilter,
} from "@/features/effects/gallery/galleryTypes";
import { findContributorProfileByAuthorName } from "@server/contributorProfileIdentity";
import { useGalleryViewerHost } from "./components/GalleryViewerHost";
import { LazyReplicationViewerOverlay } from "./components/LazyReplicationViewerOverlay";
import { viewerCollectionFromGalleryGroups } from "./viewer/viewerModel";
import { resolveGalleryFocus } from "./galleryFocus";
import {
  dismissViewerDeepLinkCover,
  ViewerDeepLinkCover,
} from "./ViewerDeepLinkCover";
import { ApprovedReplicatorStar } from "./components/ApprovedReplicatorStar";
import {
  ReplicationActiveFilterChips,
  ReplicationTaxonomyFilters,
} from "./components/ReplicationTaxonomyFilters";
import { IncrementalMasonry } from "./components/IncrementalMasonry";
import {
  CONTROL_MENU_ITEM_CLASS,
  CONTROL_TRIGGER_CHEVRON_CLASS,
  CONTROL_TRIGGER_CLASS,
  CONTROL_TRIGGER_LABEL_CLASS,
} from "@/components/ui/controlBarTrigger";
import {
  buildGalleryBrowseUrl,
  buildGalleryFocusUrl,
  buildReplicationViewerUrl,
  closeReplicationViewerUrl,
  GALLERY_BROWSE_DEFAULTS,
  GALLERY_BROWSE_COVER_ID,
  GALLERY_BROWSE_QUERY_KEYS,
  REPLICATION_VIEWER_PARAM,
  parseGalleryBrowseState,
  type GalleryBrowseState,
  parseReplicationViewerSlug,
  type GalleryFocus,
} from "./galleryUrlState";
import { useGalleryPagination } from "./useGalleryPagination";
import type { GalleryPageState } from "./galleryPage";

/**
 * The two effect fields the gallery reads: `name` for lookups/labels and
 * `slug` for linkability and filter options. The pages project the full
 * effect previews down to this before the corpus crosses into client props —
 * summaries and tag lists have no reader here and would only pad the RSC
 * payload.
 */
interface EffectSummary {
  slug: string;
  name: string;
}


/**
 * Artists get the site's person glyph; effects get the very icon the app
 * header and every effect heading already use, so the browse axes are named
 * by the same marks the rest of the site names them by. A year is a date.
 */
const MODE_ICON: Record<GalleryMode, IconName> = {
  artist: icons.userRound,
  effect: icons.subjectiveEffectIndex,
  year: "lucide:calendar-days",
};

/**
 * Browse-mode names. One string does every job: the trigger's visible label,
 * its accessible name, its tooltip, and its row in the menu. "By artist"
 * rather than "Artists" because this control chooses an axis to read the
 * archive along, not a subset of it to keep.
 */
const MODE_LABEL: Record<GalleryMode, string> = {
  artist: msg("By artist"),
  effect: msg("By effect"),
  year: msg("By year"),
};

const MODES: ReadonlyArray<GalleryMode> = ["artist", "effect", "year"];

const ORDER_ICON: Record<GalleryOrder, IconName> = {
  curated: "lucide:list-ordered",
  newest: "lucide:arrow-down-wide-narrow",
  oldest: "lucide:arrow-up-narrow-wide",
};

const ORDER_LABEL: Record<GalleryOrder, string> = {
  curated: msg("Curated"),
  newest: msg("Newest"),
  oldest: msg("Oldest"),
};

/**
 * What the order control offers per axis. Every mode reads in both time
 * directions; only "By effect" has an editor's playlist to defer to, and that
 * is its default, so its rails open on the same work as the effect article.
 */
const ORDER_OPTIONS: Record<GalleryMode, ReadonlyArray<GalleryOrder>> = {
  artist: ["newest", "oldest"],
  effect: ["curated", "newest", "oldest"],
  year: ["newest", "oldest"],
};

/**
 * The viewer overlay's collection label under a media filter. `all` and
 * `audio` keep the overlay's own "Sorted by …" label; the two visual media
 * name themselves first, so the sentence reads "Video replications sorted by
 * artist" rather than a qualifier bolted onto a capitalised label.
 */
const MEDIA_BROWSE_LABEL: Record<"image" | "video", Record<GalleryMode, string>> = {
  image: {
    artist: msg("Image replications sorted by artist"),
    effect: msg("Image replications sorted by effect"),
    year: msg("Image replications sorted by year"),
  },
  video: {
    artist: msg("Video replications sorted by artist"),
    effect: msg("Video replications sorted by effect"),
    year: msg("Video replications sorted by year"),
  },
};

const ARTIST_FOCUS_LABEL: Record<GalleryTypeFilter, string> = {
  all: msg("works by {{artist}}"),
  audio: msg("works by {{artist}}"),
  image: msg("Image works by {{artist}}"),
  video: msg("Video works by {{artist}}"),
};

const EFFECT_FOCUS_LABEL: Record<GalleryTypeFilter, string> = {
  all: msg("{{effect}} replications"),
  audio: msg("{{effect}} replications"),
  image: msg("Image {{effect}} replications"),
  video: msg("Video {{effect}} replications"),
};


/**
 * Effect names are article titles, and the corpus carries both `After images`
 * and `aesthetic distillation`. Sorted by locale, the two casings interleave
 * and the select reads like a list nobody edited. The stored name is the truth
 * everywhere else, so only the option's first letter is lifted, and the sort
 * runs on the lifted label so the order matches what the reader sees.
 */
function optionCase(name: string): string {
  return name ? name[0].toLocaleUpperCase() + name.slice(1) : name;
}


export interface ReplicationsGalleryExplorerProps {
  replications: PublicGalleryReplicationPreview[];
  effects: EffectSummary[];
  /**
   * Endpoint serving bounded, query-keyed gallery pages. The explorer applies
   * the current URL state to each request and follows its continuation cursor.
   */
  galleryPageUrl?: string;
  /** The canonical bounded first page, including its normalized query and cursor. */
  initialPage?: GalleryPageState;
  /**
   * Complete-corpus stats for the default artist view's header line,
   * precomputed on the server so the index never reports the size of a
   * partially loaded corpus as if it were the archive.
   */
  corpusStats?: GalleryCounts;
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
  /**
   * The `(tabs)` gallery page renders the fuller fair-use / takedown notice
   * (the `replications-fair-use-notice` copy block) directly under the
   * explorer, so it passes `false` here to drop the short in-explorer rights
   * footnote rather than state the same position twice on one page. Surfaces
   * without their own notice (the Artist Page) keep the default footnote.
   */
  rightsFootnote?: boolean;
}

/** Debounce for search keystrokes → URL writes (history stays clean). */
const QUERY_WRITE_DELAY_MS = 250;
/**
 * Browse-state URL writes go through native history, not `router.push`. Next
 * syncs `useSearchParams` from its patched `pushState`/`replaceState` — the
 * state argument must be free of Next's own `__NA` marker (hence `null`) or
 * the patch treats the call as internal and skips the sync — and no RSC round
 * trip happens. The browse state is client-only, so a server refetch would buy
 * nothing, and for a document served by the `?viewer=` deep-link route (see
 * middleware) it would swap the route segment and remount the whole gallery.
 */
function writeBrowseUrl(url: string, method: "push" | "replace") {
  window.history[method === "push" ? "pushState" : "replaceState"](null, "", url);
}

/**
 * The URL-derived slice of the explorer's input. Browse filters
 * (?view/?q/?type/?sort/…) and the `?viewer=` deep link are read on the client
 * so the /replications routes stay statically rendered. `urlStateResolved`
 * is false only for the prerendered defaults: effects that *write* URL or
 * cover state wait for it, because the defaults' passive effects run before
 * the bridge's synchronous re-render lands the real params.
 */
interface GalleryUrlState {
  browse: GalleryBrowseState;
  viewerSlugParam: string | null;
  viewerParamPresent: boolean;
  urlStateResolved: boolean;
}

const DEFAULT_GALLERY_URL_STATE: GalleryUrlState = {
  browse: GALLERY_BROWSE_DEFAULTS,
  viewerSlugParam: null,
  viewerParamPresent: false,
  urlStateResolved: false,
};

function sameGalleryUrlState(a: GalleryUrlState, b: GalleryUrlState): boolean {
  return (
    a.urlStateResolved === b.urlStateResolved &&
    a.viewerSlugParam === b.viewerSlugParam &&
    a.viewerParamPresent === b.viewerParamPresent &&
    (Object.keys(GALLERY_BROWSE_DEFAULTS) as (keyof GalleryBrowseState)[]).every(
      (key) => a.browse[key] === b.browse[key],
    )
  );
}

/**
 * Public entry. Next requires a Suspense boundary around `useSearchParams` on
 * a static route: during prerender the hook bails out to client rendering and
 * the boundary's fallback is what ships in the HTML. Keeping the gallery
 * itself *outside* that boundary is the point of this shape — the prerendered
 * default view is real, hydratable markup rather than a fallback that React
 * would throw away and re-render from scratch once the params resolve. Only
 * the tiny bridge below suspends; it reports the URL state into this
 * component's state from a layout effect, so the explorer re-renders with the
 * real browse state in the same commit, before the browser paints.
 */
export function ReplicationsGalleryExplorer(
  props: ReplicationsGalleryExplorerProps,
) {
  const [urlState, setUrlState] = useState(DEFAULT_GALLERY_URL_STATE);
  const syncUrlState = useCallback((next: GalleryUrlState) => {
    setUrlState((current) => (sameGalleryUrlState(current, next) ? current : next));
  }, []);
  return (
    <>
      <PrePaintRouteStateCover
        id={GALLERY_BROWSE_COVER_ID}
        queryKeys={GALLERY_BROWSE_QUERY_KEYS}
      />
      {/* Ahead of every piece of gallery markup on purpose: the cover and its
          reveal script precede the rails in the SSR payload, so a `?viewer=`
          deep link's first paint is black, never the masonry. The bridge
          dismisses the browse cover once the params resolve. */}
      <ViewerDeepLinkCover />
      <Suspense fallback={null}>
        <GalleryUrlStateBridge onChange={syncUrlState} />
      </Suspense>
      <GalleryExplorer {...props} {...urlState} />
    </>
  );
}

/** The one component allowed to touch `useSearchParams` — see above. */
function GalleryUrlStateBridge({
  onChange,
}: {
  onChange: (next: GalleryUrlState) => void;
}) {
  const searchParams = useSearchParams();
  useLayoutEffect(() => {
    onChange({
      browse: parseGalleryBrowseState(searchParams),
      viewerSlugParam: parseReplicationViewerSlug(searchParams),
      viewerParamPresent: searchParams.has(REPLICATION_VIEWER_PARAM),
      urlStateResolved: true,
    });
    dismissPrePaintRouteStateCover(GALLERY_BROWSE_COVER_ID);
  }, [onChange, searchParams]);
  return null;
}

/** Keep the last committed collection mounted until its replacement arrives. */
function SettledGalleryResults({
  pending,
  busy,
  revision,
  children,
}: {
  pending: boolean;
  busy: boolean;
  revision: string;
  children: ReactNode;
}) {
  const committed = useRef(children);
  const committedRevision = useRef(revision);
  const regionRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (pending) return;
    committed.current = children;
  }, [children, pending]);
  useEffect(() => {
    if (pending || committedRevision.current === revision) return;
    committedRevision.current = revision;
    if (!regionRef.current?.animate) return;
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (motion.matches) return;
    const animation = regionRef.current.animate(
      [{ opacity: 0 }, { opacity: 1 }],
      { duration: 160, easing: "ease-out" },
    );
    const stop = () => { if (motion.matches) animation.cancel(); };
    motion.addEventListener("change", stop);
    return () => {
      animation.cancel();
      motion.removeEventListener("change", stop);
    };
  }, [pending, revision]);
  return (
    <div
      ref={regionRef}
      aria-busy={busy}
      data-gallery-results=""
      data-results-pending={pending || undefined}
      onClickCapture={pending ? (event) => {
        // Retained works still open their own source URL, not the new filter's
        // viewer collection. Retained paging controls must wait for that query.
        if (!(event.target instanceof Element)) return;
        if (event.target.closest("a[href]")) event.stopPropagation();
        else if (event.target.closest("button")) {
          event.preventDefault();
          event.stopPropagation();
        }
      } : undefined}
    >
      {pending ? committed.current : children}
    </div>
  );
}

function GalleryExplorer({
  replications,
  galleryPageUrl,
  initialPage,
  corpusStats,
  effects,
  effectHrefPrefix = "/effects",
  contributorDirectory: initialContributorDirectory,
  focus,
  focusIdentity,
  chrome = "full",
  rightsFootnote = true,
  browse,
  viewerSlugParam,
  viewerParamPresent,
  urlStateResolved,
}: ReplicationsGalleryExplorerProps & GalleryUrlState) {
  const t = useT();
  const galleryBrowseQuery = buildGalleryBrowseUrl({
    ...browse,
    view: browse.view,
  }).split("?")[1] ?? "";
  const {
    galleryReplications,
    hasMore,
    pageLoadState,
    contributorDirectory,
    total: pagedTotal,
    groups: groupSummaries,
    facets,
    loadNextPage,
    retry,
    viewerResolutionState,
    retryViewerResolution,
  } = useGalleryPagination({
    replications,
    galleryPageUrl,
    initialContributorDirectory,
    initialPage,
    browseQuery: galleryBrowseQuery,
    focus,
    urlStateResolved,
    viewerSlugParam,
  });
  const [settledPage, setSettledPage] = useState({
    rows: galleryReplications,
    query: galleryBrowseQuery,
  });
  const replacementArrived = settledPage.rows !== galleryReplications;
  if (replacementArrived) {
    setSettledPage({ rows: galleryReplications, query: galleryBrowseQuery });
  }
  const resultsPending = Boolean(
    galleryPageUrl && !replacementArrived && settledPage.query !== galleryBrowseQuery,
  );

  const mode: GalleryMode = focus ? focus.kind : browse.view;
  const typeFilter = browse.type;
  const order = browse.sort;
  const yearFilter = browse.year;
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

  /** Every toggle writes the *whole* state, flushing any pending search text. */
  const currentInputQuery = () => inputRef.current?.value ?? browse.query;

  const navigate = (url: string, method: "push" | "replace") => {
    cancelQueryWrite();
    writeBrowseUrl(url, method);
  };

  const updateQuery = (next: string) => {
    clearTimeout(debounceRef.current);
    setQueryWritePending(true);
    debounceRef.current = window.setTimeout(() => {
      setQueryWritePending(false);
      lastWrittenQueryRef.current = next;
      const url = buildGalleryBrowseUrl({
        ...browse,
        view: mode,
        query: next,
      });
      writeBrowseUrl(url, focus ? "push" : "replace");
    }, QUERY_WRITE_DELAY_MS);
  };

  /**
   * The order to carry into `next`'s URL. A direction the reader named travels
   * with them; an order they never chose does not. Carrying the resting value
   * across would pin one axis's default as an explicit override on another —
   * arriving at "By effect" sorted by date would silently retire the curation
   * that view exists to show.
   *
   * Read against `browse.view`, the view the order was parsed for, not the
   * effective `mode`: inside a focused collection the two differ, and an
   * artist page's resting `newest` is not a choice about effect playlists.
   */
  const orderForView = (next: GalleryMode): GalleryOrder =>
    order === defaultGalleryOrder(browse.view)
      ? defaultGalleryOrder(next)
      : order;

  const switchMode = (next: GalleryMode) => {
    const query = currentInputQuery();
    lastWrittenQueryRef.current = query;
    navigate(buildGalleryBrowseUrl({
      ...browse, view: next, query, sort: orderForView(next),
    }), "push");
  };

  const setTypeFilter = (next: GalleryTypeFilter) => {
    const query = currentInputQuery();
    lastWrittenQueryRef.current = query;
    navigate(
      focus ? buildGalleryFocusUrl(focus, { type: next }) : buildGalleryBrowseUrl({
        ...browse, view: mode, query, type: next,
      }),
      "push",
    );
  };

  const setOrder = (next: GalleryOrder) => {
    const query = currentInputQuery();
    lastWrittenQueryRef.current = query;
    navigate(buildGalleryBrowseUrl({
      ...browse, view: mode, query, sort: next,
    }), "push");
  };

  const setYearFilter = (next: GalleryYearFilter) => {
    const query = currentInputQuery();
    lastWrittenQueryRef.current = query;
    navigate(buildGalleryBrowseUrl({
      ...browse, view: mode === "year" ? "year" : mode, query, year: next,
    }), "push");
  };

  /**
   * Every filter off in one navigation. Calling the individual setters in
   * sequence would write three URLs from the same stale `browse`, and the last
   * one would land having cleared only its own field.
   */
  const clearAllFilters = () => {
    const query = currentInputQuery();
    lastWrittenQueryRef.current = query;
    navigate(buildGalleryBrowseUrl({
      ...browse,
      ...DEFAULT_GALLERY_TAXONOMY_FILTERS,
      view: mode === "year" ? "year" : mode,
      query,
      type: "all",
      year: "all",
    }), "push");
  };

  const displayable = useMemo(
    () => galleryReplications.filter(isDisplayable),
    [galleryReplications],
  );

  const taxonomyFilters = useMemo<GalleryTaxonomyFilterState>(
    () => ({
      viewing: browse.viewing,
      artistType: browse.artistType,
      effect: browse.effect,
      drug: browse.drug,
      drugClass: browse.drugClass,
      family: browse.family,
    }),
    [
      browse.viewing,
      browse.artistType,
      browse.effect,
      browse.drug,
      browse.drugClass,
      browse.family,
    ],
  );
  const taxonomyFilterKey = Object.values(taxonomyFilters).join(":");
  const hasActiveTaxonomyFilters = Object.values(taxonomyFilters).some(
    (value) => value !== "all",
  );
  /**
   * Everything the chip row can take back off. Media used to be readable from
   * its own trigger on the bar; now that it lives in the filters popover, a
   * chip is the only thing that says "videos only" while the popover is shut.
   * A year is only ever set by following a year rail, so its chip is the way
   * back out to the whole timeline.
   */
  const hasRemovableFilters =
    hasActiveTaxonomyFilters || typeFilter !== "all" || browse.year !== "all";
  const drugOptions = useMemo(
    () => facets.drugs.length > 0 ? facets.drugs : [
      ...new Map(displayable.flatMap((item) =>
        (item.title_drugs ?? []).map((drug) => [drug.slug, drug.name] as const),
      )),
    ].map(([value, label]) => ({ value, label }))
      .sort((a, b) => a.label.localeCompare(b.label)),
    [displayable, facets.drugs],
  );

  const setTaxonomyFilters = (next: GalleryTaxonomyFilterState) => {
    const query = currentInputQuery();
    lastWrittenQueryRef.current = query;
    navigate(buildGalleryBrowseUrl({
      ...browse, ...next, view: mode, query,
    }), "push");
  };

  const taxonomyDisplayable = useMemo(
    () => displayable.filter((item) => matchesTaxonomyFilters(item, taxonomyFilters)),
    [displayable, taxonomyFilters],
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
  const effectOptions = useMemo(() => {
    if (facets.effects.length > 0) {
      return facets.effects.map(({ value, label }) => ({ value, label: optionCase(label) }));
    }
    const slugs = new Set(displayable.flatMap((item) =>
      [item.effect_slug, ...(item.effect_tags ?? [])].filter((slug): slug is string => Boolean(slug)),
    ));
    return [...slugs].map((value) => ({ value, label: optionCase(effectName(value)) }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [displayable, effectName, facets.effects]);

  const query = focus ? "" : browse.query;
  const searching = query.trim().length > 0;
  const singleYear = !focus && !searching && yearFilter !== "all";

  const filtered = useMemo(
    () =>
      taxonomyDisplayable.filter(
        (item) =>
          matchesType(item, typeFilter) &&
          matchesYear(item, yearFilter) &&
          (galleryPageUrl !== undefined || matchesQuery(item, query, effectName)),
      ),
    [taxonomyDisplayable, typeFilter, yearFilter, query, effectName, galleryPageUrl],
  );

  /**
   * The result line's two numbers.
   *
   * The numerator is what the grid actually renders. Artist browsing withholds
   * some effects' works and `groupByArtist` drops them, so counting `filtered`
   * alone would claim rows nobody can see. The denominator is the archive the
   * current axis can show at all, ignoring every control in the bar: "247 of
   * 6,607" only means something if the second number holds still while the
   * first moves. Search reaches across the whole displayable corpus in either
   * mode, so while searching both numbers do too.
   */
  const shown = useMemo(
    () =>
      mode === "artist" && !searching
        ? filtered.filter((item) => !isWithheldFromArtistViews(item))
        : filtered,
    [filtered, mode, searching],
  );
  const archiveTotal = useMemo(
    () =>
      mode === "artist" && !searching
        ? displayable.filter((item) => !isWithheldFromArtistViews(item)).length
        : displayable.length,
    [displayable, mode, searching],
  );

  /**
   * The flat search-results grid, memoized so the incremental masonry's
   * paging state survives unrelated re-renders — a fresh array identity here
   * would read as a new result set and rewind the grid to its first page.
   */
  const searchResults = useMemo(() => searching ? sortWithinGroup(filtered) : [], [filtered, searching]);

  /**
   * One year rail opened in full. Same memoization reason as the search grid,
   * and the same order the rail itself used, so following "View all" does not
   * reshuffle the works the reader was just looking at.
   */
  const yearItems = useMemo(
    () => singleYear ? sortWorksByDate(filtered, order === "oldest" ? "oldest" : "newest") : [],
    [filtered, order, singleYear],
  );

  const groups = useMemo(() => {
    if (mode === "year") {
      return groupByYear(filtered, order);
    }
    if (mode === "effect") {
      return groupByEffect(filtered, effectName, effectHref, order);
    }
    return groupByArtist(filtered, contributorDirectory, order);
  }, [
    contributorDirectory,
    effectHref,
    effectName,
    filtered,
    mode,
    order,
  ]);

  /**
   * Browse layout differs by mode. Artist browsing keeps every artist in
   * their own rail — pooling thin artists into one masonry jumbled works by
   * different people under one heading — and reveals rails a page at a time.
   * Effect browsing keeps the hybrid layout: groups with enough works keep a
   * rail, the thin tail pools into one dense masonry so a one-work effect
   * costs one tile, not a whole row.
   */
  const { rails, pool } = useMemo<{
    rails: GalleryGroup[];
    pool: GalleryGroup[];
  }>(
    () =>
      mode === "artist"
        ? { rails: groups, pool: [] }
        : splitRailsAndPool(groups),
    [mode, groups],
  );
  const pooledItems = useMemo(() => {
    // One masonry, so a work depicting two thin effects must still render
    // once: depicts-based grouping puts it in both pool groups, and two tiles
    // for one work would collide on its slug key.
    const seen = new Set<string>();
    return pool.flatMap((group) =>
      group.items.filter((item) =>
        seen.has(item.slug) ? false : (seen.add(item.slug), true),
      ),
    );
  }, [pool]);
  const activeGroupSummaries = groupSummaries;
  const digestActive = activeGroupSummaries.length > 0;
  const displayRails = useMemo(() => {
    if (!digestActive) return rails;
    const byKey = new Map(rails.map((group) => [group.key, group]));
    const byId = new Map(filtered.map((item) => [item._id, item]));
    return activeGroupSummaries.flatMap((digest) => {
      const group = byKey.get(digest.key);
      const items = digest.itemIds
        ? digest.itemIds.flatMap((id) => {
          const item = byId.get(id);
          return item ? [item] : [];
        })
        : group?.items;
      return group && items?.length ? [{
        ...group,
        items,
        count: digest.count,
        imageCount: digest.imageCount,
        videoCount: digest.videoCount,
      }] : [];
    });
  }, [activeGroupSummaries, digestActive, filtered, rails]);

  /**
   * The denominator: the client-side count of whatever is loaded, except in
   * the digest-backed default view, where the server's complete-corpus total
   * is authoritative until the corpus arrives. Until one of them is complete
   * the line says "so far" instead of inventing a total.
   */
  const statsComplete = !galleryPageUrl || pagedTotal !== null;
  const corpusTotal = pagedTotal ?? archiveTotal;

  const [visibleRailCount, setVisibleRailCount] = useState(ARTIST_RAIL_PAGE);
  useEffect(() => {
    setVisibleRailCount(ARTIST_RAIL_PAGE);
  }, [mode, typeFilter, order, taxonomyFilterKey]);
  const visibleRails =
    mode === "artist" ? displayRails.slice(0, visibleRailCount) : displayRails;
  const hiddenRailCount =
    Math.max(activeGroupSummaries.length, displayRails.length) -
    visibleRails.length;

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
    // The overlay walks exactly what the page shows. Recomputing the grouping
    // here ran the whole corpus through it a second time and was one argument
    // list away from disagreeing with the rails on every future change.
    return groups;
  }, [focus, focusedGroup, focusedItems, groups]);
  const viewerSourcePath = focus
    ? buildGalleryFocusUrl(focus, { type: typeFilter })
    : buildGalleryBrowseUrl({
        ...browse,
        view: mode,
        query,
      });
  const avatarByArtist = useCallback(
    (artist: string) =>
      contributorDirectory?.length
        ? (findContributorProfileByAuthorName(contributorDirectory, artist)
            ?.avatarUrl ?? null)
        : null,
    [contributorDirectory],
  );
  const viewerCollection = useMemo(() => {
    const collection = viewerCollectionFromGalleryGroups(
      viewerGroups,
      mode,
      viewerSourcePath,
      effectName,
      avatarByArtist,
    );
    if (focus && focusedGroup) {
      return {
        ...collection,
        label:
          focus.kind === "artist"
            ? t(ARTIST_FOCUS_LABEL[typeFilter], {
                artist: t(focusedGroup.label),
              })
            : t(EFFECT_FOCUS_LABEL[typeFilter], {
                effect: focusedGroup.label,
              }),
        grouping: "none" as const,
      };
    }
    const trimmedQuery = query.trim();
    const baseLabel =
      typeFilter === "video" || typeFilter === "image"
        ? t(MEDIA_BROWSE_LABEL[typeFilter][mode])
        : t(collection.label);
    return {
      ...collection,
      label: trimmedQuery
        ? t("{{collection}} matching “{{query}}”", {
            collection: baseLabel,
            query: trimmedQuery,
          })
        : baseLabel,
    };
  }, [
    avatarByArtist,
    effectName,
    focus,
    focusedGroup,
    mode,
    query,
    t,
    typeFilter,
    viewerGroups,
    viewerSourcePath,
  ]);
  const viewerResolutionPending = Boolean(
    viewerSlugParam && viewerResolutionState !== "idle",
  );
  const validViewerSlugParam =
    !viewerResolutionPending &&
    viewerSlugParam &&
    viewerCollection.groups.some((entry) =>
      entry.items.some((item) => item.replication.slug === viewerSlugParam),
    )
      ? viewerSlugParam
      : null;
  const [viewerSlug, setViewerSlug] = useState<string | null>(
    validViewerSlugParam,
  );
  const [unavailableViewerSlug, setUnavailableViewerSlug] = useState<
    string | null
  >(
    viewerSlugParam && !viewerResolutionPending && !validViewerSlugParam
      ? viewerSlugParam
      : null,
  );

  const viewerParamWasPresentRef = useRef(viewerParamPresent);

  useEffect(() => {
    if (!urlStateResolved) return;
    // A locally launched viewer writes history and viewerSlug directly. An
    // unrelated render (notably the deferred corpus becoming ready) must not
    // close it merely because the search-param snapshot still represents the
    // pre-launch URL. Only a real transition from a viewer URL to a URL
    // without the parameter (for example Back) closes that local state.
    if (!viewerParamPresent) {
      if (viewerParamWasPresentRef.current) {
        setViewerSlug(null);
      }
      viewerParamWasPresentRef.current = false;
      dismissViewerDeepLinkCover();
      return;
    }
    viewerParamWasPresentRef.current = true;

    if (viewerResolutionPending) {
      setViewerSlug(null);
      setUnavailableViewerSlug(null);
      if (viewerResolutionState === "error") dismissViewerDeepLinkCover();
      return;
    }

    setViewerSlug(validViewerSlugParam);
    if (viewerSlugParam && !validViewerSlugParam) {
      setUnavailableViewerSlug(viewerSlugParam);
    } else if (validViewerSlugParam) {
      setUnavailableViewerSlug(null);
    }
    if (!validViewerSlugParam) {
      const source = `${window.location.pathname}${window.location.search}${window.location.hash}`;
      window.history.replaceState(
        null,
        "",
        closeReplicationViewerUrl(source),
      );
      dismissViewerDeepLinkCover();
    }
  }, [
    pageLoadState,
    urlStateResolved,
    validViewerSlugParam,
    viewerParamPresent,
    viewerResolutionPending,
    viewerResolutionState,
    viewerSlugParam,
  ]);

  const launchViewer = (slug: string) => {
    setUnavailableViewerSlug(null);
    if (
      !viewerCollection.groups.some((entry) =>
        entry.items.some((item) => item.replication.slug === slug),
      )
    ) {
      return;
    }
    const source = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    window.history.pushState(
      { replicationViewer: true },
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

  // The gallery section exists whenever it holds media at all — the mode
  // toggle has to stay reachable even if one mode's own corpus is empty.
  const hasMedia = displayable.length > 0;
  const hideIncompleteResults = pageLoadState === "loading" && galleryReplications.length === 0;
  const browseAllUrl = buildGalleryBrowseUrl({
    ...browse,
    view: mode,
    type: typeFilter,
    sort: orderForView(mode),
  });

  /**
   * The order control governs the works inside a group, so it belongs to any
   * grouped view and leaves only for the flat search grid and a single focused
   * collection, neither of which is a set of playlists to order.
   */
  const orderActive = !searching && !focus;
  const orderOptions = ORDER_OPTIONS[mode];
  /**
   * Two width thresholds, both about the same row.
   *
   * `md` (768px) is where each control's label unfolds beside its glyph;
   * below it the label lives in the menu the glyph opens. `lg` is where the
   * search field is wide enough for the placeholder to name all three things
   * it searches; between them it names two, because a clipped placeholder
   * reads as a bug in the one control that has to look trustworthy.
   */
  const compactBar = useMediaQuery("(max-width: 767px)");
  const tightField = useMediaQuery("(max-width: 1023px)");
  /**
   * Anything that makes the grid smaller than the archive. While one of these
   * is on, the resting corpus sentence on the tab row is no longer the number
   * the reader is asking about, so the bar's own line answers instead.
   */
  const narrowing = searching || hasRemovableFilters;
  const corpusLoading = pageLoadState === "loading";
  const resultSummary = statsComplete
    ? t("{{shown}} of {{total}} works", {
        shown: shown.length.toLocaleString("en-US"),
        total: corpusTotal.toLocaleString("en-US"),
      })
    : t("{{shown}} works so far", {
        shown: shown.length.toLocaleString("en-US"),
      });
  const settledSummaryRef = useRef(resultSummary);
  useLayoutEffect(() => {
    if (!resultsPending) settledSummaryRef.current = resultSummary;
  }, [resultSummary, resultsPending]);

  /**
   * `/` focuses the gallery search from anywhere on the page. Every other
   * control opens a menu, so this is the one accelerator the bar cannot get
   * from its own chrome: the site-wide header field is the only other keyboard
   * entry point to a search box here, and it queries a different corpus.
   */
  useEffect(() => {
    if (chrome !== "full") return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "/" || event.metaKey || event.ctrlKey || event.altKey) {
        return;
      }
      const target = event.target as HTMLElement | null;
      if (
        target?.isContentEditable ||
        /^(input|textarea|select)$/i.test(target?.tagName ?? "")
      ) {
        return;
      }
      event.preventDefault();
      inputRef.current?.focus();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [chrome]);
  const viewerRegistration = useMemo(
    () => ({
      collection: viewerCollection,
      slug: viewerSlug,
      collectionPending: !urlStateResolved || viewerResolutionPending,
      onClose: () => {
        setViewerSlug(null);
        dismissViewerDeepLinkCover();
        const source = `${window.location.pathname}${window.location.search}${window.location.hash}`;
        window.history.replaceState(window.history.state, "", closeReplicationViewerUrl(source));
      },
      onRegroup: (grouping: "artist" | "effect", slug: string) => {
        lastWrittenQueryRef.current = currentInputQuery();
        navigate(
          buildReplicationViewerUrl(
            buildGalleryBrowseUrl({
              ...browse,
              view: grouping,
              query: currentInputQuery(),
            }),
            slug,
          ),
          "push",
        );
      },
    }),
    [
      browse,
      navigate,
      urlStateResolved,
      viewerCollection,
      viewerResolutionPending,
      viewerSlug,
    ],
  );
  const galleryViewerHost = useGalleryViewerHost(viewerRegistration);


  return (
    <>
      <section
        aria-label={t("Replications gallery")}
        className="mx-auto mt-2 w-full max-w-7xl"
      >
        {!hasMedia && !hasMore && !galleryBrowseQuery && !focus && pageLoadState === "idle" ? (
          <SearchEmptyState
            className="mt-6"
            icon="lucide:image-off"
            title={t("No replications yet")}
            description={t("Replication media has not been published yet. Check back soon.")}
          />
        ) : (
          <>
            {unavailableViewerSlug ? (
              <Alert role="status" className="mt-3">
                <AlertDescription>
                  {t("The linked replication is no longer available in this collection.")}
                </AlertDescription>
              </Alert>
            ) : null}

            {/* One row at every width, and one control set at every width:
                the browse axis, the search field, then the three controls that
                narrow what the axis shows. Each is a menu button carrying its
                own name and current value from `md` up; below `md` the label
                folds into the glyph and the menu still names everything, which
                is the only arrangement a 344px track can hold beside a
                typeable field. The corpus census is not a control and no
                longer rides here: it states the archive's size once, on the
                tab row above, and the count that answers "what did I just do"
                appears under the bar the moment anything narrows the grid. */}
            {chrome === "full" ? (
              <div className="sticky top-[calc(var(--site-header-height)+var(--site-header-sticky-gap))] z-20 mt-2 md:mt-0">
                <div
                  data-testid="gallery-control-bar"
                  className="theme-frosted-control-bar flex w-full min-w-0 items-center gap-1.5 rounded-3xl p-1.5 backdrop-blur-md md:gap-2 md:p-2"
                >
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        type="button"
                        variant="pill"
                        size="auto"
                        className={CONTROL_TRIGGER_CLASS}
                        aria-label={t("Browse by: {{mode}}", { mode: t(MODE_LABEL[mode]) })}
                        title={t("Browse by: {{mode}}", { mode: t(MODE_LABEL[mode]) })}
                      >
                        <Icon
                          icon={MODE_ICON[mode]}
                          className="h-4 w-4 shrink-0"
                          aria-hidden
                        />
                        <span className={CONTROL_TRIGGER_LABEL_CLASS}>
                          {t(MODE_LABEL[mode])}
                        </span>
                        <Icon
                          icon="lucide:chevron-down"
                          className={CONTROL_TRIGGER_CHEVRON_CLASS}
                          aria-hidden
                        />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start">
                      <DropdownMenuLabel>{t("Browse by")}</DropdownMenuLabel>
                      <DropdownMenuRadioGroup
                        value={mode}
                        onValueChange={(value) =>
                          switchMode(value as GalleryMode)
                        }
                      >
                        {MODES.map((value) => (
                          <DropdownMenuRadioItem
                            key={value}
                            value={value}
                            className={CONTROL_MENU_ITEM_CLASS}
                          >
                            <Icon
                              icon={MODE_ICON[value]}
                              className="h-4 w-4"
                              aria-hidden
                            />
                            {t(MODE_LABEL[value])}
                          </DropdownMenuRadioItem>
                        ))}
                      </DropdownMenuRadioGroup>
                      {/* Below `md` the row keeps the browse axis, the search
                          field and the filters popover, and the search field
                          needs the width the order trigger would take, so
                          ordering rides the axis it belongs to instead of
                          taking a fourth slot. Hidden by CSS rather than by
                          the media query hook so the server's markup is
                          already correct. */}
                      {orderActive ? (
                        <DropdownMenuGroup className="md:hidden">
                          <DropdownMenuSeparator />
                          <DropdownMenuLabel>{t("Order")}</DropdownMenuLabel>
                          <DropdownMenuRadioGroup
                            value={order}
                            onValueChange={(value) =>
                              setOrder(value as GalleryOrder)
                            }
                          >
                            {orderOptions.map((value) => (
                              <DropdownMenuRadioItem
                                key={value}
                                value={value}
                                className={CONTROL_MENU_ITEM_CLASS}
                              >
                                <Icon
                                  icon={ORDER_ICON[value]}
                                  className="h-4 w-4"
                                  aria-hidden
                                />
                                {t(ORDER_LABEL[value])}
                              </DropdownMenuRadioItem>
                            ))}
                          </DropdownMenuRadioGroup>
                        </DropdownMenuGroup>
                      ) : null}
                    </DropdownMenuContent>
                  </DropdownMenu>

                  {/* The one control that stays a field. Shrunk to its
                      magnifier a search box stops reading as somewhere you can
                      type, so it keeps a single elastic rule from `md` up
                      instead of the two-breakpoint basis that used to wrap the
                      bar onto a second row for the whole 640-1023px band. */}
                  <div className="relative min-w-0 flex-1 basis-0 md:min-w-48 lg:min-w-52">
                    <Icon
                      icon="lucide:search"
                      className="theme-text-faint pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2"
                    />
                    <Input
                      ref={inputRef}
                      id="replications-gallery-search"
                      defaultValue={browse.query}
                      onChange={(event) => updateQuery(event.target.value)}
                      onKeyDown={(event) => {
                        // Escape empties the field rather than closing it: the
                        // field is what shows the reader why the grid is
                        // filtered, so it stays and the query goes.
                        if (event.key !== "Escape" || !inputRef.current?.value) {
                          return;
                        }
                        inputRef.current.value = "";
                        updateQuery("");
                      }}
                      // Below `lg` the field bottoms out at 192px, where the
                      // three-noun placeholder clipped mid-word, which reads
                      // as a bug in the one control that has to look
                      // trustworthy. It names two things there instead.
                      placeholder={
                        tightField
                          ? t("Search art, artist")
                          : t("Search art, artist, effect")
                      }
                      className={cn(
                        "h-10 pl-9 [@media(pointer:coarse)]:h-11 md:h-9",
                        // The trailing slot only holds the clear button or the
                        // pending spinner, so reserve it only while occupied.
                        searching || queryWritePending ? "pr-10" : "pr-3",
                      )}
                      inputMode="search"
                      aria-label={t("Search replications")}
                      title={t("Search replications (/)")}
                    />
                    {searching ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="auto"
                        aria-label={t("Clear search")}
                        className={cn(
                          "absolute right-0 top-1/2 h-9 w-9 -translate-y-1/2 p-0",
                          TOUCH_ICON,
                        )}
                        onClick={() => {
                          if (inputRef.current) inputRef.current.value = "";
                          updateQuery("");
                          inputRef.current?.focus();
                        }}
                      >
                        <Icon icon="lucide:x" className="h-4 w-4" aria-hidden />
                      </Button>
                    ) : null}
                    {/* Decorative only (aria-hidden): the debounce is 250ms, and a
                      live region firing per keystroke would be pure noise. */}
                    {queryWritePending && !searching ? (
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

                  {/* Ordering is the second half of the browse axis: which
                      end of time the playlists lead with, or the editor's
                      curated pick under "By effect". It leaves for the flat
                      search grid and a focused collection rather than
                      standing there inert: with labelled triggers the bar's
                      width already differs per mode, so an invisible
                      placeholder bought nothing and cost a 60px hole. Below
                      `md` it is a row inside the browse menu instead of a
                      slot on the bar. */}
                  {orderActive ? (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          type="button"
                          variant="pill"
                          size="auto"
                          className={cn(CONTROL_TRIGGER_CLASS, "max-md:hidden")}
                          aria-label={t("Order: {{order}}", { order: t(ORDER_LABEL[order]) })}
                          title={t("Order: {{order}}", { order: t(ORDER_LABEL[order]) })}
                        >
                          {/* A control holding something other than its
                              default tints its own glyph. The `pill` variant
                              already declares a border colour, so a `border-*`
                              utility beside it is a coin toss the accent
                              loses; colour on the icon has nothing to compete
                              with. The default differs per axis, so the tint
                              is read against this mode's own default. */}
                          <Icon
                            icon={ORDER_ICON[order]}
                            className={cn(
                              "h-4 w-4 shrink-0",
                              order !== defaultGalleryOrder(mode) &&
                                "text-dose-accent-strong",
                            )}
                          />
                          <span className={CONTROL_TRIGGER_LABEL_CLASS}>
                            {t(ORDER_LABEL[order])}
                          </span>
                          <Icon
                            icon="lucide:chevron-down"
                            className={CONTROL_TRIGGER_CHEVRON_CLASS}
                            aria-hidden
                          />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuLabel>{t("Order")}</DropdownMenuLabel>
                        <DropdownMenuRadioGroup
                          value={order}
                          onValueChange={(value) =>
                            setOrder(value as GalleryOrder)
                          }
                        >
                          {orderOptions.map((value) => (
                            <DropdownMenuRadioItem
                              key={value}
                              value={value}
                              className={CONTROL_MENU_ITEM_CLASS}
                            >
                              <Icon
                                icon={ORDER_ICON[value]}
                                className="h-4 w-4"
                                aria-hidden
                              />
                              {t(ORDER_LABEL[value])}
                            </DropdownMenuRadioItem>
                          ))}
                        </DropdownMenuRadioGroup>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  ) : null}

                  {/* Media joined the filters it always was one of. A separate
                      dropdown made "is this a video" look like a different
                      kind of question from "is this closed-eye", and spent a
                      bar slot saying so. */}
                  <ReplicationTaxonomyFilters
                    filters={taxonomyFilters}
                    onChange={setTaxonomyFilters}
                    type={typeFilter}
                    onTypeChange={setTypeFilter}
                    year={yearFilter}
                    drugOptions={drugOptions}
                    effectOptions={effectOptions}
                    onClear={clearAllFilters}
                  />
                </div>
              </div>
            ) : null}

            {/* Reserve one chip-height row so pending counts and selected
                filters do not displace the results. Announce settled counts,
                keeping the previous count while its replacement is fetched. */}
            {chrome === "full" ? (
              <div
                className="mt-3 flex min-h-11 flex-wrap items-center gap-x-3 gap-y-2 px-1"
              >
                <p
                  role="status"
                  aria-live="polite"
                  className="theme-text-faint flex items-center gap-1.5 text-xs tabular-nums"
                >
                  {narrowing ? <span>{resultsPending ? settledSummaryRef.current : resultSummary}</span> : null}
                  {corpusLoading ? (
                    <>
                      <Icon
                        icon="svg-spinners:ring-resize"
                        className="h-3 w-3 shrink-0"
                        aria-hidden
                      />
                      <span className={narrowing ? "sr-only" : undefined}>
                        {t("Loading gallery results…")}
                      </span>
                    </>
                  ) : null}
                </p>
                {hasRemovableFilters ? (
                  <ReplicationActiveFilterChips
                    filters={taxonomyFilters}
                    onChange={setTaxonomyFilters}
                    type={typeFilter}
                    onTypeChange={setTypeFilter}
                    year={yearFilter}
                    onYearChange={setYearFilter}
                    drugOptions={drugOptions}
                    effectOptions={effectOptions}
                  />
                ) : null}
              </div>
            ) : null}

            {pageLoadState === "error" ? (
              <Alert variant="destructive" role="alert" className="mt-4">
                <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
                  <span>
                    {t("Gallery results could not finish loading. Everything already shown remains available; retry from the last page.")}
                  </span>
                  <Button
                    type="button"
                    variant="pill"
                    size="pill"
                    onClick={() => void retry()}
                  >
                    {t("Retry")}
                  </Button>
                </AlertDescription>
              </Alert>
            ) : null}
            {viewerResolutionState === "error" ? (
              <Alert variant="destructive" role="alert" className="mt-4">
                <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
                  <span>{t("The linked replication could not be loaded.")}</span>
                  <Button
                    type="button"
                    variant="pill"
                    size="pill"
                    onClick={() => void retryViewerResolution()}
                  >
                    {t("Retry")}
                  </Button>
                </AlertDescription>
              </Alert>
            ) : null}

            <SettledGalleryResults
              pending={resultsPending}
              busy={corpusLoading}
              revision={galleryBrowseQuery}
            >
            {/* Focused single-group view (own URL: /replications/artist|effect/<key>) */}
            {hideIncompleteResults ? null : focus && focusedGroup ? (
              <div className="mt-4 space-y-3">
                <div className="flex flex-wrap items-baseline justify-between gap-3 px-1">
                  <div className="min-w-0">
                    <Link
                      href={browseAllUrl}
                      className="theme-text-muted group inline-flex min-h-11 items-center gap-1 rounded-full text-sm font-medium transition-colors hover:text-[var(--theme-accent-strong)] theme-focus-ring motion-reduce:transition-none"
                    >
                      <Icon
                        icon="lucide:arrow-left"
                        className="h-4 w-4 transition group-hover:-translate-x-0.5 motion-reduce:transition-none"
                      />
                      {mode === "artist" ? t("All artists") : t("All effects")}
                    </Link>
                    <h2 className="theme-text-primary font-display mt-1 flex items-center gap-2 text-2xl font-bold tracking-tight">
                      <span className="min-w-0 break-words">{t(focusedGroup.label)}</span>
                      {focusedGroup.approvedReplicator ? (
                        <ApprovedReplicatorStar className="text-[0.75em]" />
                      ) : null}
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
                        {t("View effect article")}
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
                        {t("Own site")}
                        <Icon
                          icon="lucide:arrow-up-right"
                          className="h-4 w-4"
                        />
                      </a>
                    ) : null}
                  </div>
                  <span className="theme-text-faint text-xs tabular-nums">
                    {focusedItems.length === 1
                      ? t("{{count}} work", { count: focusedItems.length })
                      : t("{{count}} works", { count: focusedItems.length })}
                  </span>
                </div>
                {mode === "artist" ? focusIdentity : null}
                {focusedItems.length > 0 ? (
                  // An artist focus already names the artist in its heading, so
                  // per-tile bylines would repeat it under every work; effect
                  // focus tiles keep them as the only attribution in sight.
                  // Artist-focus tiles open the viewer walking this artist.
                  <IncrementalMasonry
                    items={focusedItems}
                    showByline={focus.kind !== "artist"}
                    onOpen={openViewerAt}
                    viewerSourcePath={viewerSourcePath}
                  />
                ) : (
                  <SearchEmptyState
                    className="mt-8"
                    icon="lucide:search-x"
                    title={typeFilter === "video" ? t("No videos here") : t("No images here")}
                    description={
                      typeFilter === "video"
                        ? t("{{group}} has no videos. Switch the media filter to see everything.", {
                            group: t(focusedGroup.label),
                          })
                        : t("{{group}} has no images. Switch the media filter to see everything.", {
                            group: t(focusedGroup.label),
                          })
                    }
                  />
                )}
              </div>
            ) : searching ? (
              /* Search results — flat masonry */
              filtered.length > 0 ? (
                <div className="mt-4 space-y-3">
                  <p className="theme-text-faint px-1 text-xs tabular-nums">
                    {(pagedTotal ?? filtered.length) === 1
                      ? t("{{count}} result for “{{query}}”", {
                          count: pagedTotal ?? filtered.length,
                          query: query.trim(),
                        })
                      : t("{{count}} results for “{{query}}”", {
                          count: pagedTotal ?? filtered.length,
                          query: query.trim(),
                        })}
                  </p>
                  <IncrementalMasonry
                    items={searchResults}
                    onOpen={openViewerAt}
                    viewerSourcePath={viewerSourcePath}
                  />
                </div>
              ) : (
                <SearchEmptyState
                  className="mt-8"
                  icon="lucide:search-x"
                  title={t("No art matches your search")}
                  description={t("Nothing found for “{{query}}”. Try a different artist, effect, or title.", {
                    query: query.trim(),
                  })}
                />
              )
            ) : singleYear && filtered.length > 0 ? (
              /* One year rail, opened in full. A year owns no page of its own,
                 so its overflow is this: the whole span as one flat grid that
                 pages in, with the chip above as the way back to every year. */
              <div className="mt-4 space-y-3">
                <IncrementalMasonry
                  items={yearItems}
                  onOpen={openViewerAt}
                  viewerSourcePath={viewerSourcePath}
                />
              </div>
            ) : filtered.length === 0 && hasRemovableFilters ? (
              <div className="mt-8 flex flex-col items-center">
                <SearchEmptyState
                  icon="lucide:list-filter"
                  title={t("No works match these filters")}
                  description={t("Clear one or more filters to widen the gallery.")}
                />
                <Button
                  type="button"
                  variant="pill"
                  size="pill"
                  onClick={clearAllFilters}
                >
                  {t("Clear filters")}
                </Button>
              </div>
            ) : (
              /* Browse — every artist keeps their own rail (revealed a page
               at a time); in effect mode only groups with enough works get a
               rail and everything thinner pools into one dense masonry,
               where each tile's byline carries the attribution. "View all"
               is a crawlable focus URL. */
              <div className="mt-2 space-y-5">
                {visibleRails.map((group) => (
                  <MediaRail
                    key={group.key}
                    group={group}
                    countIsComplete={digestActive || !hasMore}
                    viewAllHref={
                      mode === "year"
                        ? buildGalleryBrowseUrl({
                            ...browse,
                            view: "year",
                            year: group.key,
                          })
                        : buildGalleryFocusUrl(
                            { kind: mode, key: galleryGroupUrlKey(mode, group) },
                            /* The effect address is the playlist page now; it
                             reads no type filter, so only artist focus links
                             carry one. */
                            mode === "artist" ? { type: typeFilter } : {},
                          )
                    }
                    /* Artist rails carry the artist in their heading, so tile
                     bylines would echo it fourteen times; effect rails keep
                     bylines as each work's attribution. An artist rail's tiles
                     open the viewer walking that artist's works. */
                    tileBylines={mode !== "artist"}
                    /* Artist rails lead with the artist's portrait; effect
                     rails and the unattributed bucket name no person, so they
                     pass none. `null` still draws the monogram frame. */
                    avatarUrl={
                      mode === "artist" && group.key !== UNATTRIBUTED_KEY
                        ? avatarByArtist(group.label)
                        : undefined
                    }
                    viewerHrefFor={(replication) =>
                      buildReplicationViewerUrl(
                        viewerSourcePath,
                        replication.slug,
                      )
                    }
                    /* Touch widths browse in a continuous three-column
                       masonry: a rail loads fourteen tiles and reveals one at
                       390px, which is the throughput ceiling on the page. From
                       `md` up the rail returns, where the horizontal gesture
                       is cheap and the artist grouping earns its keep. The
                       breakpoint is the bar's own, so the page has one
                       compact/full line rather than two. */
                    layout={compactBar ? "masonry" : "rail"}
                    mobileCompact
                    onTileOpen={openViewerAt}
                  />
                ))}
                {hiddenRailCount > 0 || hasMore ? (
                  <div className="flex flex-col items-center gap-1.5">
                    <Button
                      type="button"
                      variant="pill"
                      size="pill"
                      disabled={corpusLoading}
                      onClick={() => {
                        setVisibleRailCount((count) => count + ARTIST_RAIL_PAGE);
                        if (hasMore) void loadNextPage();
                      }}
                      className="min-h-11 gap-1.5"
                    >
                      {corpusLoading ? t("Loading…") : mode === "artist" ? t("Show more artists") : t("Load more works")}
                      <Icon
                        icon={corpusLoading ? "lucide:loader-circle" : "lucide:chevron-down"}
                        className={cn("h-4 w-4", corpusLoading && "animate-spin motion-reduce:animate-none")}
                        aria-hidden
                      />
                    </Button>
                    {mode === "artist" ? (
                      <span className="theme-text-faint text-xs tabular-nums">
                        {t("Showing {{visible}} of {{total}} artists", {
                          visible: visibleRails.length,
                          total: activeGroupSummaries.length || displayRails.length,
                        })}
                      </span>
                    ) : null}
                  </div>
                ) : null}
                {pooledItems.length > 0 ? (
                  <section aria-label={t("More effects")} className="space-y-3">
                    {displayRails.length > 0 ? (
                      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-1">
                        <h2 className="theme-text-primary font-display text-lg font-semibold tracking-tight">
                          {t("More effects")}
                        </h2>
                        <span className="theme-text-faint text-xs tabular-nums">
                          {pooledItems.length === 1
                            ? t("{{effects}} effects · {{works}} work", {
                                effects: pool.length,
                                works: pooledItems.length,
                              })
                            : t("{{effects}} effects · {{works}} works", {
                                effects: pool.length,
                                works: pooledItems.length,
                              })}
                        </span>
                      </div>
                    ) : null}
                    <IncrementalMasonry
                      items={pooledItems}
                      onOpen={openViewerAt}
                      viewerSourcePath={viewerSourcePath}
                    />
                  </section>
                ) : null}
              </div>
            )}
            {(focus || searching || singleYear) && hasMore ? (
              <div className="mt-5 flex justify-center">
                <Button
                  type="button"
                  variant="pill"
                  size="pill"
                  disabled={corpusLoading}
                  onClick={() => void loadNextPage()}
                  className="min-h-11 gap-1.5"
                >
                  {corpusLoading ? t("Loading…") : t("Load more works")}
                  <Icon
                    icon={corpusLoading ? "lucide:loader-circle" : "lucide:chevron-down"}
                    className={cn("h-4 w-4", corpusLoading && "animate-spin motion-reduce:animate-none")}
                    aria-hidden
                  />
                </Button>
              </div>
            ) : null}
            </SettledGalleryResults>

            {/* Rights footnote — the gallery page replaces it with the
                editable fair-use notice it renders below the explorer. */}
            {rightsFootnote ? (
              <p className="theme-text-muted mx-auto mt-10 max-w-3xl px-1 text-center text-xs leading-5">
                {t("Replication media is credited to its creator when known. Rights remain with the original creator or rightsholder unless an individual item states another license. See the")}{" "}
                <Link
                  href="/docs/license#replication-media-terms"
                  className={proseLinkClassName}
                >
                  {t("licensing terms")}
                </Link>{" "}
                {t("to correct a credit or request removal.")}
              </p>
            ) : null}
          </>
        )}
      </section>

      {!galleryViewerHost && viewerSlug && viewerCollection.groups.length > 0 ? (
        <LazyReplicationViewerOverlay
          collection={viewerCollection}
          initialSlug={viewerSlug}
          collectionPending={false}
          open
          onOpenChange={(open) => {
            if (!open) viewerRegistration.onClose();
          }}
          onRegroup={viewerRegistration.onRegroup}
        />
      ) : null}
    </>
  );
}

