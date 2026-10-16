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

interface EffectSummary {
  slug: string;
  name: string;
}

const MODE_ICON: Record<GalleryMode, IconName> = {
  artist: icons.userRound,
  effect: icons.subjectiveEffectIndex,
  year: "lucide:calendar-days",
};

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

const ORDER_OPTIONS: Record<GalleryMode, ReadonlyArray<GalleryOrder>> = {
  artist: ["newest", "oldest"],
  effect: ["curated", "newest", "oldest"],
  year: ["newest", "oldest"],
};

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

function optionCase(name: string): string {
  return name ? name[0].toLocaleUpperCase() + name.slice(1) : name;
}


export interface ReplicationsGalleryExplorerProps {
  replications: PublicGalleryReplicationPreview[];
  effects: EffectSummary[];
  galleryPageUrl?: string;
  initialPage?: GalleryPageState;
  corpusStats?: GalleryCounts;
  effectHrefPrefix?: string;
  contributorDirectory?: ContributorDirectory;
  focus?: GalleryFocus;
  focusIdentity?: ReactNode;
  chrome?: "full" | "focus-only";
  rightsFootnote?: boolean;
}

const QUERY_WRITE_DELAY_MS = 250;
function writeBrowseUrl(url: string, method: "push" | "replace") {
  window.history[method === "push" ? "pushState" : "replaceState"](null, "", url);
}

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
      <ViewerDeepLinkCover />
      <Suspense fallback={null}>
        <GalleryUrlStateBridge onChange={syncUrlState} />
      </Suspense>
      <GalleryExplorer {...props} {...urlState} />
    </>
  );
}

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
  const inputRef = useRef<HTMLInputElement>(null);
  const lastWrittenQueryRef = useRef(browse.query);
  const debounceRef = useRef<number | undefined>(undefined);

  const [queryWritePending, setQueryWritePending] = useState(false);

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

  const searchResults = useMemo(() => searching ? sortWithinGroup(filtered) : [], [filtered, searching]);

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

  const hasMedia = displayable.length > 0;
  const hideIncompleteResults = pageLoadState === "loading" && galleryReplications.length === 0;
  const browseAllUrl = buildGalleryBrowseUrl({
    ...browse,
    view: mode,
    type: typeFilter,
    sort: orderForView(mode),
  });

  const orderActive = !searching && !focus;
  const orderOptions = ORDER_OPTIONS[mode];
  const compactBar = useMediaQuery("(max-width: 767px)");
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
                        if (event.key !== "Escape" || !inputRef.current?.value) {
                          return;
                        }
                        inputRef.current.value = "";
                        updateQuery("");
                      }}
                      placeholder={t("Search art, artists…")}
                      className={cn(
                        "h-10 pl-9 [@media(pointer:coarse)]:h-11 md:h-9",
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
                            mode === "artist" ? { type: typeFilter } : {},
                          )
                    }
                    tileBylines={mode !== "artist"}
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
