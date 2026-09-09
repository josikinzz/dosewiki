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
import { cn } from "@/lib/utils";
import type { ContributorDirectory } from "@server/contributorDirectory";
import type { PublicGalleryReplicationPreview } from "@/types/replications";
import { GalleryMediaTile } from "@/features/effects/gallery/GalleryMediaTile";
import { MediaRail } from "@/features/effects/gallery/MediaRail";
import {
  ARTIST_RAIL_PAGE,
  DEFAULT_GALLERY_TAXONOMY_FILTERS,
  effectHrefBuilder,
  effectNameLookup,
  galleryGroupUrlKey,
  groupByArtist,
  groupByEffect,
  isDisplayable,
  isWithheldFromArtistViews,
  matchesQuery,
  matchesTaxonomyFilters,
  matchesType,
  sortWithinGroup,
  splitRailsAndPool,
  UNATTRIBUTED_KEY,
  type GalleryCounts,
  type GalleryGroup,
  type GalleryArtistSort,
  type GalleryMode,
  type GalleryTypeFilter,
  type GalleryTaxonomyFilterState,
} from "@/features/effects/gallery/galleryModel";
import { findContributorProfileByAuthorName } from "@server/contributorProfileIdentity";
import { ReplicationViewerOverlay } from "./viewer/ReplicationViewerOverlay";
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
import {
  CONTROL_MENU_ITEM_CLASS,
  CONTROL_TRIGGER_CHEVRON_CLASS,
  CONTROL_TRIGGER_CLASS,
  CONTROL_TRIGGER_LABEL_CLASS,
} from "./components/controlBarTrigger";
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

type GalleryPageLoadState = "idle" | "loading" | "error";

/**
 * Artists get the site's person glyph; effects get the very icon the app
 * header and every effect heading already use, so the browse axes are named
 * by the same marks the rest of the site names them by.
 */
const MODE_ICON: Record<GalleryMode, IconName> = {
  artist: icons.userRound,
  effect: icons.subjectiveEffectIndex,
};

/**
 * Browse-mode names. One string does every job: the trigger's visible label,
 * its accessible name, its tooltip, and its row in the menu. "By artist"
 * rather than "Artists" because this control chooses an axis to read the
 * archive along, not a subset of it to keep.
 */
const MODE_LABEL: Record<GalleryMode, string> = {
  artist: "By artist",
  effect: "By effect",
};

const TYPE_ICON: Record<GalleryTypeFilter, IconName> = {
  all: "lucide:layers",
  image: "lucide:image",
  video: "lucide:video",
};

/** Menu rows name the set; the trigger names the current state. */
const TYPE_LABEL: Record<GalleryTypeFilter, string> = {
  all: "All media",
  image: "Images",
  video: "Videos",
};

const ARTIST_SORT_OPTIONS: ReadonlyArray<[GalleryArtistSort, string]> = [
  ["video-first", "Videos first"],
  ["count", "Most works"],
  ["alpha", "A–Z"],
];

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

const ARTIST_SORT_LABEL = Object.fromEntries(ARTIST_SORT_OPTIONS) as Record<
  GalleryArtistSort,
  string
>;

function browseNeedsCompleteCorpus(browse: GalleryBrowseState): boolean {
  return (Object.keys(GALLERY_BROWSE_DEFAULTS) as (keyof GalleryBrowseState)[])
    .some((key) => browse[key] !== GALLERY_BROWSE_DEFAULTS[key]);
}

function isContributorDirectory(value: unknown): value is ContributorDirectory {
  return (
    Array.isArray(value) &&
    value.every(
      (entry) =>
        Boolean(entry) &&
        typeof entry === "object" &&
        typeof entry.key === "string" &&
        typeof entry.displayName === "string" &&
        Array.isArray(entry.aliases) &&
        entry.aliases.every((alias: unknown) => typeof alias === "string"),
    )
  );
}

function isGalleryReplicationPreview(
  value: unknown,
): value is PublicGalleryReplicationPreview {
  if (!value || typeof value !== "object") return false;

  return (
    "_id" in value &&
    typeof value._id === "string" &&
    "slug" in value &&
    typeof value.slug === "string" &&
    "title" in value &&
    typeof value.title === "string" &&
    "artist" in value &&
    typeof value.artist === "string" &&
    (!("artist_url" in value) || typeof value.artist_url === "string") &&
    "type" in value &&
    (value.type === "image" || value.type === "video") &&
    "format" in value &&
    typeof value.format === "string" &&
    (!("effect_slug" in value) || typeof value.effect_slug === "string") &&
    (!("effect_tags" in value) ||
      (Array.isArray(value.effect_tags) &&
        value.effect_tags.every((item) => typeof item === "string"))) &&
    (!("viewing_mode_tags" in value) ||
      (Array.isArray(value.viewing_mode_tags) &&
        value.viewing_mode_tags.every(
          (item) => item === "open-eye" || item === "closed-eye",
        ))) &&
    (!("title_drugs" in value) ||
      (Array.isArray(value.title_drugs) &&
        value.title_drugs.every(
          (item) =>
            item !== null &&
            typeof item === "object" &&
            "slug" in item &&
            typeof item.slug === "string" &&
            "name" in item &&
            typeof item.name === "string",
        ))) &&
    (!("drug_classes" in value) ||
      (Array.isArray(value.drug_classes) &&
        value.drug_classes.every(
          (item) =>
            item === "psychedelics" ||
            item === "dissociatives" ||
            item === "deliriants" ||
            item === "other",
        ))) &&
    (!("content_family" in value) ||
      value.content_family === "experiential-replication" ||
      value.content_family === "visionary-psychedelic-art" ||
      value.content_family === "traditional-cultural-art" ||
      value.content_family === "dark-surrealism" ||
      value.content_family === "optical-perceptual-art" ||
      value.content_family === "generative-abstract-art" ||
      value.content_family === "effect-illustration" ||
      value.content_family === "explanatory-figure" ||
      value.content_family === "uncertain") &&
    (!("artist_type_tags" in value) ||
      (Array.isArray(value.artist_type_tags) &&
        value.artist_type_tags.every(
          (item) =>
            item === "replicator" || item === "traditional-psychedelic-artist",
        ))) &&
    "url" in value &&
    typeof value.url === "string" &&
    (!("thumbnail_url" in value) || typeof value.thumbnail_url === "string") &&
    (!("preview_url" in value) || typeof value.preview_url === "string") &&
    (!("motion_url" in value) || typeof value.motion_url === "string") &&
    (!("motion_poster_url" in value) ||
      typeof value.motion_poster_url === "string") &&
    (!("width" in value) || typeof value.width === "number") &&
    (!("height" in value) || typeof value.height === "number") &&
    (!("duration" in value) || typeof value.duration === "number") &&
    (!("has_audio" in value) || typeof value.has_audio === "boolean") &&
    "created_at" in value &&
    typeof value.created_at === "string" &&
    (!("date_info" in value) ||
      (value.date_info !== null &&
        typeof value.date_info === "object" &&
        "kind" in value.date_info &&
        (value.date_info.kind === "exact_date" ||
          value.date_info.kind === "year" ||
          value.date_info.kind === "range" ||
          value.date_info.kind === "upper_bound" ||
          value.date_info.kind === "inferred" ||
          value.date_info.kind === "unknown") &&
        (!("value" in value.date_info) ||
          typeof value.date_info.value === "string"))) &&
    (!("order_index" in value) || typeof value.order_index === "number")
  );
}

/**
 * One server-precomputed artist rail: the group's identity and its
 * complete-corpus counts, without items. Items come from the inlined
 * `replications` subset until the complete corpus arrives.
 */
export interface ArtistRailDigest {
  key: string;
  label: string;
  count: number;
  imageCount: number;
  videoCount: number;
}

export interface ReplicationsGalleryExplorerProps {
  replications: PublicGalleryReplicationPreview[];
  effects: EffectSummary[];
  /**
   * Endpoint serving the complete gallery corpus in one cacheable response.
   * Its presence marks `replications` as a server-curated subset; the
   * explorer fetches the rest on idle after hydration, or eagerly for deep
   * links and non-default browse states. Artist pages omit it because their
   * already-focused corpus is intentionally complete.
   */
  completeCorpusUrl?: string;
  /**
   * The default artist view, precomputed on the server against the complete
   * corpus: the first rail page's groups in their true video-first order,
   * each carrying its *complete* counts. While the corpus is still the
   * inlined subset, the explorer renders rails in this order with these
   * counts instead of trusting client-side grouping of a partial corpus.
   */
  initialArtistRails?: ArtistRailDigest[];
  /** Total artist groups in the complete corpus, for "Showing X of Y artists". */
  artistGroupTotal?: number;
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

/**
 * Phones get a denser, media-first masonry (three thin columns, hairline
 * gutters, and captions tightened by `mobileCompact` rather than hidden: a
 * title only a hover reveals is a title touch readers never get); from `sm`
 * up the grid relaxes back to the readable card layout.
 */
const MASONRY_CLASS =
  "columns-3 gap-1.5 sm:columns-3 sm:gap-3 lg:columns-4 [column-fill:_balance]";
const MASONRY_TILE_CLASS = "mb-1.5 w-full break-inside-avoid sm:mb-3";

/** Debounce for search keystrokes → URL writes (history stays clean). */
const QUERY_WRITE_DELAY_MS = 250;

// Rail paging and preview sizes are shared with the server-rendered index —
// see ARTIST_RAIL_PAGE / RAIL_PREVIEW_LIMIT in galleryModel.

/**
 * Masonry grids (search results, the pooled effect tail, focused groups)
 * mount tiles in pages of this size. Once the complete preview continuation
 * arrives, the in-view sentinel extends the grid as the reader approaches its
 * end, with a "Show more" button as the fallback affordance.
 */
const MASONRY_PAGE = 60;

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

function GalleryExplorer({
  replications,
  completeCorpusUrl,
  initialArtistRails,
  artistGroupTotal,
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
  const [galleryReplications, setGalleryReplications] = useState(replications);
  const galleryReplicationsRef = useRef(galleryReplications);
  const [hasMore, setHasMore] = useState(Boolean(completeCorpusUrl));
  const hasMoreRef = useRef(hasMore);
  const [pageLoadState, setPageLoadState] =
    useState<GalleryPageLoadState>("idle");
  const [completionAnnouncement, setCompletionAnnouncement] = useState<
    string | null
  >(null);
  const pageRequestRef = useRef<Promise<boolean> | null>(null);
  const pageAbortRef = useRef<AbortController | null>(null);
  // The index page inlines only the directory entries its prerendered rails
  // can consult; the complete one arrives with the corpus that makes the rest
  // of the artists reachable (see api/replications/gallery). Until then the
  // inlined subset resolves every credit on screen.
  const [fetchedContributorDirectory, setFetchedContributorDirectory] =
    useState<ContributorDirectory | null>(null);
  const contributorDirectory =
    fetchedContributorDirectory ?? initialContributorDirectory;
  const browseStateKey = [
    browse.view,
    browse.query,
    browse.type,
    browse.sort,
    browse.viewing,
    browse.artistType,
    browse.effect,
    browse.drug,
    browse.drugClass,
    browse.family,
  ].join("\u0000");
  const browseRequiresCompleteCorpus = browseNeedsCompleteCorpus(browse);
  const observedBrowseStateKeyRef = useRef(browseStateKey);
  const actionGenerationRef = useRef(0);
  const pendingCorpusActionRef = useRef<{
    generation: number;
    action: () => void;
  } | null>(null);

  const cancelPendingCorpusAction = useCallback(() => {
    actionGenerationRef.current += 1;
    pendingCorpusActionRef.current = null;
  }, []);

  const queueCorpusAction = useCallback((action: () => void) => {
    const generation = actionGenerationRef.current + 1;
    actionGenerationRef.current = generation;
    pendingCorpusActionRef.current = { generation, action };
    return generation;
  }, []);

  const completeCorpusAction = useCallback((generation: number) => {
    const pending = pendingCorpusActionRef.current;
    if (!pending || pending.generation !== generation) return;
    pendingCorpusActionRef.current = null;
    pending.action();
  }, []);

  const loadCompleteCorpus = useCallback((): Promise<boolean> => {
    if (!completeCorpusUrl || !hasMoreRef.current) {
      return pageRequestRef.current ?? Promise.resolve(true);
    }
    if (pageRequestRef.current) return pageRequestRef.current;

    setCompletionAnnouncement(null);
    const controller = new AbortController();
    pageAbortRef.current = controller;
    setPageLoadState("loading");

    const request = (async () => {
      try {
        const response = await fetch(completeCorpusUrl, {
          signal: controller.signal,
          headers: { Accept: "application/json" },
        });
        if (!response.ok) {
          throw new Error(`Gallery request failed: ${response.status}`);
        }
        const payload: unknown = await response.json();
        if (
          !payload ||
          typeof payload !== "object" ||
          !("data" in payload) ||
          !Array.isArray(payload.data) ||
          !payload.data.every(isGalleryReplicationPreview)
        ) {
          throw new Error("Gallery response was malformed");
        }
        // A response without a usable directory keeps the inlined subset:
        // deferred artists then group and sort by their own credit lines,
        // exactly as an unclaimed credit does, rather than losing the corpus.
        if (
          "contributorDirectory" in payload &&
          isContributorDirectory(payload.contributorDirectory)
        ) {
          setFetchedContributorDirectory(payload.contributorDirectory);
        }
        galleryReplicationsRef.current = payload.data;
        hasMoreRef.current = false;
        setGalleryReplications(payload.data);
        setHasMore(false);
        setPageLoadState("idle");
        setCompletionAnnouncement("Complete gallery loaded");
        return true;
      } catch {
        if (!controller.signal.aborted) {
          setPageLoadState("error");
        }
        return false;
      } finally {
        if (pageAbortRef.current === controller) pageAbortRef.current = null;
        pageRequestRef.current = null;
      }
    })();

    pageRequestRef.current = request;
    return request;
  }, [completeCorpusUrl]);

  useEffect(
    () => () => {
      pageAbortRef.current?.abort();
    },
    [],
  );

  useEffect(() => {
    if (!urlStateResolved || !completeCorpusUrl || !hasMoreRef.current) return;
    if (viewerSlugParam || browseRequiresCompleteCorpus) {
      // Deep links and non-default browse states need the whole corpus to
      // resolve correctly — fetch it immediately.
      void loadCompleteCorpus();
      return;
    }
    // The default view's prerendered rails are already complete, so the
    // corpus fetch waits for browser idle instead of competing with the
    // first paint's media. Interactions that need the corpus sooner go
    // through `runWithCompleteCorpus`, which starts the same deduplicated
    // request eagerly.
    const idleWindow = window as Window & {
      requestIdleCallback?: (
        callback: () => void,
        options?: { timeout?: number },
      ) => number;
      cancelIdleCallback?: (id: number) => void;
    };
    let idleId: number | undefined;
    let timeoutId: number | undefined;
    if (typeof idleWindow.requestIdleCallback === "function") {
      idleId = idleWindow.requestIdleCallback(
        () => void loadCompleteCorpus(),
        { timeout: 4000 },
      );
    } else {
      timeoutId = window.setTimeout(() => void loadCompleteCorpus(), 2000);
    }
    return () => {
      if (idleId !== undefined) idleWindow.cancelIdleCallback?.(idleId);
      if (timeoutId !== undefined) window.clearTimeout(timeoutId);
    };
  }, [
    browseStateKey,
    browseRequiresCompleteCorpus,
    completeCorpusUrl,
    loadCompleteCorpus,
    urlStateResolved,
    viewerSlugParam,
  ]);

  useEffect(() => {
    if (observedBrowseStateKeyRef.current === browseStateKey) return;
    observedBrowseStateKeyRef.current = browseStateKey;
    cancelPendingCorpusAction();
  }, [browseStateKey, cancelPendingCorpusAction]);

  const runWithCompleteCorpus = useCallback(
    (action: () => void) => {
      const generation = queueCorpusAction(action);
      if (!hasMoreRef.current) {
        completeCorpusAction(generation);
        return;
      }
      void loadCompleteCorpus().then((loaded) => {
        if (loaded) completeCorpusAction(generation);
      });
    },
    [completeCorpusAction, loadCompleteCorpus, queueCorpusAction],
  );

  const retryCompleteCorpus = useCallback(() => {
    const generation = pendingCorpusActionRef.current?.generation;
    return loadCompleteCorpus().then((loaded) => {
      if (loaded && generation !== undefined) {
        completeCorpusAction(generation);
      }
      return loaded;
    });
  }, [completeCorpusAction, loadCompleteCorpus]);

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

  /** Every toggle writes the *whole* state, flushing any pending search text. */
  const currentInputQuery = () => inputRef.current?.value ?? browse.query;

  const navigate = (url: string, method: "push" | "replace") => {
    cancelQueryWrite();
    cancelPendingCorpusAction();
    writeBrowseUrl(url, method);
  };

  const updateQuery = (next: string) => {
    clearTimeout(debounceRef.current);
    cancelPendingCorpusAction();
    setQueryWritePending(true);
    const completeCorpus = hasMoreRef.current ? loadCompleteCorpus() : null;
    debounceRef.current = window.setTimeout(() => {
      setQueryWritePending(false);
      const writeQuery = () => {
        lastWrittenQueryRef.current = next;
        const url = buildGalleryBrowseUrl({
          ...browse,
          view: mode,
          query: next,
        });
        writeBrowseUrl(url, focus ? "push" : "replace");
      };
      const generation = queueCorpusAction(writeQuery);
      if (!completeCorpus) {
        completeCorpusAction(generation);
        return;
      }
      void completeCorpus.then((loaded) => {
        if (loaded) completeCorpusAction(generation);
      });
    }, QUERY_WRITE_DELAY_MS);
  };

  const switchMode = (next: GalleryMode) => {
    const query = currentInputQuery();
    runWithCompleteCorpus(() => {
      lastWrittenQueryRef.current = query;
      navigate(buildGalleryBrowseUrl({ ...browse, view: next, query }), "push");
    });
  };

  const setTypeFilter = (next: GalleryTypeFilter) => {
    const query = currentInputQuery();
    runWithCompleteCorpus(() => {
      lastWrittenQueryRef.current = query;
      navigate(
        focus
          ? buildGalleryFocusUrl(focus, { type: next })
          : buildGalleryBrowseUrl({
              ...browse,
              view: mode,
              query,
              type: next,
            }),
        "push",
      );
    });
  };

  const setArtistSort = (next: GalleryArtistSort) => {
    const query = currentInputQuery();
    runWithCompleteCorpus(() => {
      lastWrittenQueryRef.current = query;
      navigate(
        buildGalleryBrowseUrl({
          ...browse,
          view: mode,
          query,
          sort: next,
        }),
        "push",
      );
    });
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
  const drugOptions = useMemo(
    () =>
      [
        ...new Map(
          displayable.flatMap((item) =>
            (item.title_drugs ?? []).map(
              (drug) => [drug.slug, drug.name] as const,
            ),
          ),
        ),
      ]
        .map(([value, label]) => ({ value, label }))
        .sort((left, right) => left.label.localeCompare(right.label)),
    [displayable],
  );

  const setTaxonomyFilters = (next: GalleryTaxonomyFilterState) => {
    const query = currentInputQuery();
    runWithCompleteCorpus(() => {
      lastWrittenQueryRef.current = query;
      navigate(
        buildGalleryBrowseUrl({
          ...browse,
          ...next,
          view: mode,
          query,
        }),
        "push",
      );
    });
  };

  const taxonomyDisplayable = useMemo(
    () =>
      displayable.filter((item) =>
        matchesTaxonomyFilters(item, taxonomyFilters),
      ),
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

  /**
   * Depicted-effect options come from the corpus itself — every owning
   * `effect_slug` plus every `effect_tags` entry a displayable work carries —
   * so the select never offers an effect that would empty the grid outright.
   */
  const effectOptions = useMemo(() => {
    const slugs = new Set<string>();
    for (const item of displayable) {
      if (item.effect_slug) slugs.add(item.effect_slug);
      for (const tag of item.effect_tags ?? []) slugs.add(tag);
    }
    return [...slugs]
      .map((slug) => ({ value: slug, label: optionCase(effectName(slug)) }))
      .sort((left, right) => left.label.localeCompare(right.label));
  }, [displayable, effectName]);

  const query = focus ? "" : browse.query;
  const searching = query.trim().length > 0;

  const filtered = useMemo(
    () =>
      taxonomyDisplayable.filter(
        (item) =>
          matchesType(item, typeFilter) &&
          matchesQuery(item, query, effectName),
      ),
    [taxonomyDisplayable, typeFilter, query, effectName],
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
  const searchResults = useMemo(() => sortWithinGroup(filtered), [filtered]);

  const groups = useMemo(() => {
    if (mode !== "artist") {
      return groupByEffect(filtered, effectName, effectHref);
    }
    const artistGroups = groupByArtist(
      filtered,
      artistSort,
      contributorDirectory,
    );
    return artistGroups;
  }, [
    artistSort,
    contributorDirectory,
    effectHref,
    effectName,
    filtered,
    mode,
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
  const pooledItems = useMemo(
    () => pool.flatMap((group) => group.items),
    [pool],
  );

  /**
   * While only the server-curated subset is loaded, the default artist view
   * must not trust client-side grouping for ordering or counts: every group
   * would hold at most one rail's preview, so counts tie and the video-first
   * order scrambles. The server's digest — computed against the complete
   * corpus — supplies the true order and per-artist counts; the loaded items
   * fill the rails. Any other state eagerly loads the corpus, after which
   * plain grouping takes over and the digest is inert.
   */
  const digestActive =
    mode === "artist" &&
    !focus &&
    !searching &&
    hasMore &&
    !browseRequiresCompleteCorpus &&
    Boolean(initialArtistRails?.length);
  const displayRails = useMemo(() => {
    if (!digestActive || !initialArtistRails) return rails;
    const byKey = new Map(rails.map((group) => [group.key, group]));
    return initialArtistRails.flatMap((digest) => {
      const group = byKey.get(digest.key);
      return group
        ? [
            {
              ...group,
              count: digest.count,
              imageCount: digest.imageCount,
              videoCount: digest.videoCount,
            },
          ]
        : [];
    });
  }, [digestActive, initialArtistRails, rails]);

  /**
   * The denominator: the client-side count of whatever is loaded, except in
   * the digest-backed default view, where the server's complete-corpus total
   * is authoritative until the corpus arrives. Until one of them is complete
   * the line says "so far" instead of inventing a total.
   */
  const statsComplete = !hasMore || (digestActive && Boolean(corpusStats));
  const corpusTotal =
    hasMore && digestActive && corpusStats ? corpusStats.total : archiveTotal;

  const [visibleRailCount, setVisibleRailCount] = useState(ARTIST_RAIL_PAGE);
  useEffect(() => {
    setVisibleRailCount(ARTIST_RAIL_PAGE);
  }, [mode, typeFilter, artistSort, taxonomyFilterKey]);
  const visibleRails =
    mode === "artist" ? displayRails.slice(0, visibleRailCount) : displayRails;
  const hiddenRailCount =
    (digestActive ? (artistGroupTotal ?? displayRails.length) : displayRails.length) -
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
    const mediaQualifier =
      typeFilter === "video"
        ? "Video "
        : typeFilter === "image"
          ? "Image "
          : "";
    if (focus && focusedGroup) {
      return {
        ...collection,
        label:
          focus.kind === "artist"
            ? `${mediaQualifier}works by ${focusedGroup.label}`
            : `${mediaQualifier}${focusedGroup.label} replications`,
        grouping: "none" as const,
      };
    }
    const queryQualifier = query.trim() ? ` matching “${query.trim()}”` : "";
    const baseLabel = mediaQualifier
      ? collection.label.replace(/^Sorted/, "replications sorted")
      : collection.label;
    return {
      ...collection,
      label: `${mediaQualifier}${baseLabel}${queryQualifier}`,
    };
  }, [
    avatarByArtist,
    effectName,
    focus,
    focusedGroup,
    mode,
    query,
    typeFilter,
    viewerGroups,
    viewerSourcePath,
  ]);
  const viewerResolutionPending = Boolean(
    viewerSlugParam && completeCorpusUrl && hasMore,
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
      if (pageLoadState === "error") dismissViewerDeepLinkCover();
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
        window.history.state,
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

  // The gallery section exists whenever it holds media at all — the mode
  // toggle has to stay reachable even if one mode's own corpus is empty.
  const hasMedia = displayable.length > 0;
  const hideIncompleteResults =
    Boolean(completeCorpusUrl) &&
    hasMore &&
    browseRequiresCompleteCorpus;
  const browseAllUrl = buildGalleryBrowseUrl({
    ...browse,
    view: mode,
    type: typeFilter,
    sort: artistSort,
  });

  /** Sorting is an artist-rail affordance, so it exists only where rails do. */
  const sortActive = mode === "artist" && !searching && !focus;
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
  const narrowing =
    searching || typeFilter !== "all" || hasActiveTaxonomyFilters;
  const corpusLoading = pageLoadState === "loading";
  const resultSummary = statsComplete
    ? `${shown.length.toLocaleString("en-US")} of ${corpusTotal.toLocaleString("en-US")} works`
    : `${shown.length.toLocaleString("en-US")} works so far`;

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

  return (
    <>
      <section
        aria-label="Replications gallery"
        className="mx-auto mt-2 w-full max-w-7xl"
      >
        {!hasMedia && !hasMore ? (
          <SearchEmptyState
            className="mt-6"
            icon="lucide:image-off"
            title="No replications yet"
            description="Replication media has not been published yet. Check back soon."
          />
        ) : (
          <>
            {unavailableViewerSlug ? (
              <Alert role="status" className="mt-3">
                <AlertDescription>
                  The linked replication is no longer available in this
                  collection.
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
                        aria-label={`Browse by: ${MODE_LABEL[mode]}`}
                        title={`Browse by: ${MODE_LABEL[mode]}`}
                      >
                        <Icon
                          icon={MODE_ICON[mode]}
                          className="h-4 w-4 shrink-0"
                          aria-hidden
                        />
                        <span className={CONTROL_TRIGGER_LABEL_CLASS}>
                          {MODE_LABEL[mode]}
                        </span>
                        <Icon
                          icon="lucide:chevron-down"
                          className={CONTROL_TRIGGER_CHEVRON_CLASS}
                          aria-hidden
                        />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start">
                      <DropdownMenuLabel>Browse by</DropdownMenuLabel>
                      <DropdownMenuRadioGroup
                        value={mode}
                        onValueChange={(value) =>
                          switchMode(value as GalleryMode)
                        }
                      >
                        {(["artist", "effect"] as const).map((value) => (
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
                            {MODE_LABEL[value]}
                          </DropdownMenuRadioItem>
                        ))}
                      </DropdownMenuRadioGroup>
                      {/* Below `md` the row has four glyph-width slots and the
                          search field needs three of them, so sorting rides
                          the axis it belongs to instead of taking a fifth.
                          Hidden by CSS rather than by the media query hook so
                          the server's markup is already correct. */}
                      {sortActive ? (
                        <DropdownMenuGroup className="md:hidden">
                          <DropdownMenuSeparator />
                          <DropdownMenuLabel>Sort artists</DropdownMenuLabel>
                          <DropdownMenuRadioGroup
                            value={artistSort}
                            onValueChange={(value) =>
                              setArtistSort(value as GalleryArtistSort)
                            }
                          >
                            {ARTIST_SORT_OPTIONS.map(([value, label]) => (
                              <DropdownMenuRadioItem
                                key={value}
                                value={value}
                                className={CONTROL_MENU_ITEM_CLASS}
                              >
                                {label}
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
                          ? "Search art, artist"
                          : "Search art, artist, effect"
                      }
                      className={cn(
                        "h-10 pl-9 [@media(pointer:coarse)]:h-11 md:h-9",
                        // The trailing slot only holds the clear button or the
                        // pending spinner, so reserve it only while occupied.
                        searching || queryWritePending ? "pr-10" : "pr-3",
                      )}
                      inputMode="search"
                      aria-label="Search replications"
                      title="Search replications (/)"
                    />
                    {searching ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="auto"
                        aria-label="Clear search"
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

                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        type="button"
                        variant="pill"
                        size="auto"
                        className={CONTROL_TRIGGER_CLASS}
                        aria-label={`Media: ${TYPE_LABEL[typeFilter]}`}
                        title={`Media: ${TYPE_LABEL[typeFilter]}`}
                      >
                        {/* A control holding something other than its default
                            tints its own glyph. The `pill` variant already
                            declares a border colour, so a `border-*` utility
                            beside it is a coin toss the accent loses; colour
                            on the icon has nothing to compete with. */}
                        <Icon
                          icon={TYPE_ICON[typeFilter]}
                          className={cn(
                            "h-4 w-4 shrink-0",
                            typeFilter !== "all" && "text-dose-accent-strong",
                          )}
                          aria-hidden
                        />
                        <span className={CONTROL_TRIGGER_LABEL_CLASS}>
                          {TYPE_LABEL[typeFilter]}
                        </span>
                        <Icon
                          icon="lucide:chevron-down"
                          className={CONTROL_TRIGGER_CHEVRON_CLASS}
                          aria-hidden
                        />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuLabel>Media</DropdownMenuLabel>
                      <DropdownMenuRadioGroup
                        value={typeFilter}
                        onValueChange={(value) =>
                          setTypeFilter(value as GalleryTypeFilter)
                        }
                      >
                        {(["all", "image", "video"] as const).map((value) => (
                          <DropdownMenuRadioItem
                            key={value}
                            value={value}
                            className={CONTROL_MENU_ITEM_CLASS}
                          >
                            <Icon
                              icon={TYPE_ICON[value]}
                              className="h-4 w-4"
                              aria-hidden
                            />
                            {TYPE_LABEL[value]}
                          </DropdownMenuRadioItem>
                        ))}
                      </DropdownMenuRadioGroup>
                    </DropdownMenuContent>
                  </DropdownMenu>

                  {/* Sorting applies to artist rails, so outside artist mode
                      the control leaves rather than standing there inert: with
                      labelled triggers the bar's width already differs per
                      mode, so an invisible placeholder bought nothing and cost
                      a 60px hole. Below `md` it is a row inside the browse
                      menu instead of a slot on the bar. */}
                  {sortActive ? (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          type="button"
                          variant="pill"
                          size="auto"
                          className={cn(CONTROL_TRIGGER_CLASS, "max-md:hidden")}
                          aria-label={`Sort artists: ${ARTIST_SORT_LABEL[artistSort]}`}
                          title={`Sort artists: ${ARTIST_SORT_LABEL[artistSort]}`}
                        >
                          <Icon
                            icon="lucide:arrow-down-wide-narrow"
                            className={cn(
                              "h-4 w-4 shrink-0",
                              artistSort !== GALLERY_BROWSE_DEFAULTS.sort &&
                                "text-dose-accent-strong",
                            )}
                            aria-hidden
                          />
                          <span className={CONTROL_TRIGGER_LABEL_CLASS}>
                            {ARTIST_SORT_LABEL[artistSort]}
                          </span>
                          <Icon
                            icon="lucide:chevron-down"
                            className={CONTROL_TRIGGER_CHEVRON_CLASS}
                            aria-hidden
                          />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuLabel>Sort artists</DropdownMenuLabel>
                        <DropdownMenuRadioGroup
                          value={artistSort}
                          onValueChange={(value) =>
                            setArtistSort(value as GalleryArtistSort)
                          }
                        >
                          {ARTIST_SORT_OPTIONS.map(([value, label]) => (
                            <DropdownMenuRadioItem
                              key={value}
                              value={value}
                              className={CONTROL_MENU_ITEM_CLASS}
                            >
                              {label}
                            </DropdownMenuRadioItem>
                          ))}
                        </DropdownMenuRadioGroup>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  ) : null}

                  <ReplicationTaxonomyFilters
                    filters={taxonomyFilters}
                    onChange={setTaxonomyFilters}
                    drugOptions={drugOptions}
                    effectOptions={effectOptions}
                    onClear={() =>
                      setTaxonomyFilters(DEFAULT_GALLERY_TAXONOMY_FILTERS)
                    }
                  />
                </div>
              </div>
            ) : null}

            {/* What the reader just did, in the slot the corpus census used to
                spend on a number nobody asks twice. It appears only when
                something narrows the grid, so the resting page pays no pixels
                for it, and it shares its row with the removable chips because
                a result count and the filters producing it are one statement.
                `role="status"` finally announces something worth hearing: the
                previous occupant recited the whole archive's size no matter
                what the grid held. */}
            {chrome === "full" ? (
              <div
                className={cn(
                  "flex flex-wrap items-center gap-x-3 gap-y-2 px-1",
                  (narrowing || corpusLoading || hasActiveTaxonomyFilters) &&
                    "mt-3",
                )}
              >
                <p
                  role="status"
                  aria-live="polite"
                  className="theme-text-faint flex items-center gap-1.5 text-xs tabular-nums"
                >
                  {narrowing ? <span>{resultSummary}</span> : null}
                  {corpusLoading ? (
                    <>
                      <Icon
                        icon="svg-spinners:ring-resize"
                        className="h-3 w-3 shrink-0"
                        aria-hidden
                      />
                      <span className={narrowing ? "sr-only" : undefined}>
                        Loading the complete gallery…
                      </span>
                    </>
                  ) : completionAnnouncement ? (
                    <span className="sr-only">{completionAnnouncement}.</span>
                  ) : null}
                </p>
                {hasActiveTaxonomyFilters ? (
                  <ReplicationActiveFilterChips
                    filters={taxonomyFilters}
                    onChange={setTaxonomyFilters}
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
                    The complete gallery could not finish loading. Everything
                    already shown remains available; retry from the last page.
                  </span>
                  <Button
                    type="button"
                    variant="pill"
                    size="pill"
                    onClick={() => void retryCompleteCorpus()}
                  >
                    Retry
                  </Button>
                </AlertDescription>
              </Alert>
            ) : null}

            {/* Focused single-group view (own URL: /replications/artist|effect/<key>) */}
            {hideIncompleteResults ? null : focus && focusedGroup ? (
              <div className="mt-4 space-y-3">
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
                    <h2 className="theme-text-primary font-display mt-1 flex items-center gap-2 text-2xl font-bold tracking-tight">
                      <span className="min-w-0 break-words">{focusedGroup.label}</span>
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
                    title={`No ${typeFilter === "video" ? "videos" : "images"} here`}
                    description={`${focusedGroup.label} has no ${typeFilter === "video" ? "videos" : "images"}. Switch the media filter to see everything.`}
                  />
                )}
              </div>
            ) : searching ? (
              /* Search results — flat masonry */
              filtered.length > 0 ? (
                <div className="mt-4 space-y-3">
                  <p className="theme-text-faint px-1 text-xs tabular-nums">
                    {filtered.length} result{filtered.length === 1 ? "" : "s"}{" "}
                    for “{query.trim()}”
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
                  title="No art matches your search"
                  description={`Nothing found for “${query.trim()}”. Try a different artist, effect, or title.`}
                />
              )
            ) : filtered.length === 0 && hasActiveTaxonomyFilters ? (
              <div className="mt-8 flex flex-col items-center">
                <SearchEmptyState
                  icon="lucide:list-filter"
                  title="No works match these filters"
                  description="Clear one or more taxonomy filters to widen the gallery."
                />
                <Button
                  type="button"
                  variant="pill"
                  size="pill"
                  onClick={() =>
                    setTaxonomyFilters(DEFAULT_GALLERY_TAXONOMY_FILTERS)
                  }
                >
                  Clear filters
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
                    countIsComplete={!hasMore || digestActive}
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
                {hiddenRailCount > 0 ? (
                  <div className="flex flex-col items-center gap-1.5">
                    <Button
                      type="button"
                      variant="pill"
                      size="pill"
                      onClick={() =>
                        runWithCompleteCorpus(() =>
                          setVisibleRailCount(
                            (count) => count + ARTIST_RAIL_PAGE,
                          ),
                        )
                      }
                      className="min-h-11 gap-1.5"
                    >
                      Show more artists
                      <Icon
                        icon="lucide:chevron-down"
                        className="h-4 w-4"
                        aria-hidden
                      />
                    </Button>
                    <span className="theme-text-faint text-xs tabular-nums">
                      Showing {visibleRails.length} of{" "}
                      {digestActive
                        ? (artistGroupTotal ?? displayRails.length)
                        : displayRails.length}{" "}
                      artists
                    </span>
                  </div>
                ) : null}
                {pooledItems.length > 0 ? (
                  <section aria-label="More effects" className="space-y-3">
                    {displayRails.length > 0 ? (
                      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-1">
                        <h2 className="theme-text-primary font-display text-lg font-semibold tracking-tight">
                          More effects
                        </h2>
                        <span className="theme-text-faint text-xs tabular-nums">
                          {pool.length} effects · {pooledItems.length} work
                          {pooledItems.length === 1 ? "" : "s"}
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

            {/* Rights footnote — the gallery page replaces it with the
                editable fair-use notice it renders below the explorer. */}
            {rightsFootnote ? (
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
            ) : null}
          </>
        )}
      </section>

      {viewerSlug && viewerCollection.groups.length > 0 ? (
        <ReplicationViewerOverlay
          collection={viewerCollection}
          initialSlug={viewerSlug}
          open
          onOpenChange={(nextOpen) => {
            if (!nextOpen) {
              setViewerSlug(null);
              dismissViewerDeepLinkCover();
            }
          }}
          onRegroup={(grouping, slug) => {
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
          }}
        />
      ) : null}
    </>
  );
}

/**
 * A masonry grid that mounts its tiles in pages of `MASONRY_PAGE`. Every
 * item is already on the client — growth is pure rendering, no fetch — but
 * mounting a thousand-tile grid at once is what used to balloon the DOM and
 * client heap on broad searches and the effect view's pooled tail. A
 * sentinel below the grid extends it as the reader approaches its end; the
 * "Show more" button is the same affordance for keyboards, screen readers,
 * and environments without IntersectionObserver. Every tile opens the same
 * in-page viewer; the underlying anchor remains a permanent work link for
 * modified clicks, new tabs, and crawlers.
 */
function IncrementalMasonry({
  items,
  showByline = true,
  onOpen,
  viewerSourcePath,
}: {
  items: PublicGalleryReplicationPreview[];
  showByline?: boolean;
  onOpen: (
    event: React.MouseEvent,
    replication: PublicGalleryReplicationPreview,
  ) => void;
  /** Canonical source-collection URL each tile's viewer href derives from. */
  viewerSourcePath: string;
}) {
  const [visibleCount, setVisibleCount] = useState(MASONRY_PAGE);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  // A new result set (typed query, toggled filter, mode switch) restarts at
  // the first page; the parent memoizes each grid's array so mere re-renders
  // never rewind it.
  useEffect(() => {
    setVisibleCount(MASONRY_PAGE);
  }, [items]);

  const visible =
    items.length > visibleCount ? items.slice(0, visibleCount) : items;
  const exhausted = visible.length === items.length;

  // Recreated after every growth step: a fresh observer reports the
  // sentinel's *current* intersection, so a viewport tall enough to still
  // reach it keeps growing without waiting for a scroll event.
  useEffect(() => {
    if (exhausted) return;
    const node = sentinelRef.current;
    if (!node || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setVisibleCount((count) => count + MASONRY_PAGE);
        }
      },
      // Mount the next page well before the grid's end scrolls into view.
      { rootMargin: "1200px 0px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [exhausted, visibleCount, items]);

  return (
    <>
      <div className={MASONRY_CLASS}>
        {visible.map((replication) => (
          <GalleryMediaTile
            key={replication._id}
            replication={replication}
            className={MASONRY_TILE_CLASS}
            frameClassName="w-full"
            /* Masonry columns: 3 across until lg, then 4 across the max-w-7xl
               measure — a column never exceeds ~320px. */
            sizes="(max-width: 1024px) 33vw, 320px"
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
      {!exhausted ? (
        <div
          ref={sentinelRef}
          className="flex flex-col items-center gap-1.5 pt-2"
        >
          <Button
            type="button"
            variant="pill"
            size="pill"
            onClick={() => setVisibleCount((count) => count + MASONRY_PAGE)}
            className="min-h-11 gap-1.5"
          >
            Show more works
            <Icon icon="lucide:chevron-down" className="h-4 w-4" aria-hidden />
          </Button>
          <span className="theme-text-faint text-xs tabular-nums">
            Showing {visible.length} of {items.length} works
          </span>
        </div>
      ) : null}
    </>
  );
}
