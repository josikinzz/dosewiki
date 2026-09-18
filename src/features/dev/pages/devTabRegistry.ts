/**
 * The one list of dev-shell tabs. The rail, both route resolvers (server
 * `/dev/[[...segments]]` and the client `parsePath`), the render switch, the
 * loading policy, and the primary-tab resolver all read from it, so adding a
 * tab is one entry here plus its render branch in `DevModePageView`.
 *
 * Kept free of React and runtime app imports on purpose: the server route and
 * the client router both load it. The role type is a type-only import.
 */

import type { RoleFloor } from "@/lib/auth/roles";
import { DEV_ROUTE_FILTERS, type DevRouteFilter } from "@/utils/devHref";

export type DevToolGroup = "content" | "intake" | "site";

/**
 * - `library`: reads the substance corpus and waits on the library drain
 *   before rendering.
 * - `library-deferred`: starts the corpus read without blocking the active tool.
 * - `contributors`: reads the contributor profile directory. Corpus tools need
 *   it for changelog attribution on save; the people and writing tools need it
 *   for their pickers.
 * - `layouts`: reads the private, revision-bearing index layouts used by
 *   staged corpus drafts and proposal application.
 */
type DevTabDataNeed = "library" | "library-deferred" | "changelog" | "contributors" | "layouts"

type DevTabDestination = { kind: "shell" } | { kind: "external"; href: string }

type DevTabDescriptorOf<Id extends string> = {
  id: Id;
  label: string;
  group: DevToolGroup | "chrome";
  /** Route path segments, other than `id`, that resolve to this tab. */
  aliases: readonly string[];
  /** Lowest role that may use the tool; the rail disables the tab, with a reason, for anyone below it. */
  role: RoleFloor;
  data: ReadonlySet<DevTabDataNeed>;
  /** `staged` tools commit through the shared commit panel; `immediate` tools publish on save. */
  saveFamily: "staged" | "immediate";
  destination: DevTabDestination;
  /** Named count source rendered as a rail badge; `useDevRailBadges` maps the name to its endpoint. */
  badge?: "trip-reports" | "feedback" | "proposals";
  /**
   * A tab-level filter kept in the URL as `?<param>=<value>`. `segments` are
   * extra route segments that open the tab with that value preset, the way a
   * retired tab's address keeps working after it folds into this one.
   */
  filter?: DevRouteFilter;
};

const NO_DATA: ReadonlySet<DevTabDataNeed> = new Set();
const CORPUS: ReadonlySet<DevTabDataNeed> = new Set<DevTabDataNeed>(["library", "contributors"]);
const CORPUS_WITH_LAYOUTS: ReadonlySet<DevTabDataNeed> = new Set<DevTabDataNeed>([
  "library",
  "contributors",
  "layouts",
]);
const SHELL: DevTabDestination = { kind: "shell" };

/**
 * Ordered: tool entries in rail order, then the chrome cluster. Labels are the
 * rail labels.
 */
const REGISTRY = [
  {
    id: "articles",
    label: "Substances",
    group: "content",
    aliases: ["generator", "gen"],
    role: "editor",
    data: CORPUS_WITH_LAYOUTS,
    saveFamily: "staged",
    destination: SHELL,
  },
  {
    id: "review",
    label: "Review",
    group: "content",
    aliases: [],
    role: "editor",
    data: NO_DATA,
    saveFamily: "immediate",
    destination: { kind: "external", href: "/review" },
  },
  {
    id: "citation-review",
    label: "Citations",
    group: "intake",
    aliases: ["citations"],
    role: "admin",
    data: NO_DATA,
    saveFamily: "immediate",
    destination: SHELL,
  },
  {
    id: "trip-report-submissions",
    label: "Trip reports",
    group: "intake",
    aliases: ["trip-reports"],
    role: "admin",
    data: NO_DATA,
    saveFamily: "immediate",
    destination: SHELL,
    badge: "trip-reports",
  },
  {
    id: "article-feedback",
    label: "Feedback",
    group: "intake",
    aliases: ["feedback"],
    role: "admin",
    data: NO_DATA,
    saveFamily: "immediate",
    destination: SHELL,
    badge: "feedback",
    // Site feedback folded in as the source filter; `/dev/site-feedback` still opens that queue.
    filter: DEV_ROUTE_FILTERS["article-feedback"],
  },
  {
    id: "tag-editor",
    label: "Tags",
    group: "content",
    aliases: ["tag"],
    role: "editor",
    data: new Set<DevTabDataNeed>(["library-deferred"]),
    saveFamily: "staged",
    destination: SHELL,
  },
  {
    id: "molecule-editor",
    label: "Molecules",
    group: "content",
    aliases: ["molecules"],
    role: "admin",
    data: NO_DATA,
    saveFamily: "immediate",
    destination: SHELL,
  },
  {
    id: "banners",
    label: "Banners",
    group: "content",
    // `/dev/warnings` is the wording an editor reaching for this from an
    // article is likely to type; the tool itself is named Banners per the
    // design brief's glossary.
    aliases: ["warnings"],
    role: "admin",
    data: NO_DATA,
    saveFamily: "immediate",
    destination: SHELL,
  },
  {
    id: "replications",
    label: "Replications",
    group: "content",
    aliases: ["replication-studio"],
    role: "admin",
    data: NO_DATA,
    saveFamily: "immediate",
    destination: SHELL,
  },
  {
    id: "writing",
    label: "Writing",
    group: "site",
    aliases: [],
    role: "editor",
    data: new Set<DevTabDataNeed>(["contributors"]),
    saveFamily: "immediate",
    destination: SHELL,
    // Blog folded in as the kind filter; `/dev/blog/<slug>` still opens the post.
    filter: DEV_ROUTE_FILTERS.writing,
  },
  {
    id: "copy-studio",
    label: "Copy",
    group: "site",
    aliases: ["copy"],
    role: "editor",
    data: NO_DATA,
    saveFamily: "immediate",
    destination: SHELL,
  },
  {
    id: "queue",
    label: "Change Review",
    group: "intake",
    aliases: ["proposals"],
    role: "editor",
    data: NO_DATA,
    saveFamily: "immediate",
    destination: SHELL,
    badge: "proposals",
  },
  {
    id: "contributors",
    label: "Contributors",
    group: "site",
    aliases: ["contributor"],
    // The one people editor: a contributor opens it on their own record, so
    // the descriptor sits at the contributor floor and the tab decides what
    // that role may see.
    role: "contributor",
    data: new Set<DevTabDataNeed>(["contributors"]),
    saveFamily: "immediate",
    destination: SHELL,
    // Profile folded in as the self scope; `/dev/profile` still lands there.
    filter: DEV_ROUTE_FILTERS.contributors,
  },
  {
    id: "playlists",
    label: "Playlists",
    group: "site",
    aliases: [],
    // A member's own replication playlists: the descriptor sits at the
    // contributor floor and Postgres's ownership rule decides which rows they
    // may change. Applying a playlist to a gallery stays in the studio.
    role: "contributor",
    data: NO_DATA,
    saveFamily: "immediate",
    destination: SHELL,
  },
  {
    id: "members",
    label: "Members",
    group: "site",
    aliases: [],
    // Roster, roles, bans, resets, invites: every action is admin-only in Postgres too.
    role: "admin",
    data: NO_DATA,
    saveFamily: "immediate",
    destination: SHELL,
  },
  {
    id: "glossary",
    label: "Glossary",
    group: "site",
    aliases: ["translation-glossary"],
    // The locale mirrors' term list. Approving a rendering changes every prompt
    // but spends nothing, so translators own it; the paid actions (drafting,
    // retranslating, the main run) stay admin inside the tab and their routes.
    role: "translator",
    data: NO_DATA,
    saveFamily: "immediate",
    destination: SHELL,
  },
  {
    id: "my-reports",
    label: "My reports",
    group: "site",
    aliases: [],
    // A member's own published trip reports; ownership is checked per row in Postgres.
    role: "contributor",
    data: NO_DATA,
    saveFamily: "immediate",
    destination: SHELL,
  },
  {
    id: "index-layout",
    label: "Index layout",
    group: "content",
    aliases: ["index"],
    role: "editor",
    data: CORPUS_WITH_LAYOUTS,
    saveFamily: "staged",
    destination: SHELL,
  },
  {
    id: "change-log",
    label: "Change log",
    group: "chrome",
    aliases: ["changelog"],
    role: "editor",
    data: new Set<DevTabDataNeed>(["changelog"]),
    saveFamily: "immediate",
    destination: SHELL,
  },
] as const satisfies readonly DevTabDescriptorOf<string>[];

export type DevModeTab = (typeof REGISTRY)[number]["id"];
export type DevChromeTab = Extract<(typeof REGISTRY)[number], { group: "chrome" }>["id"];
export type DevTabDescriptor = DevTabDescriptorOf<DevModeTab>;

export const DEV_TAB_REGISTRY: readonly DevTabDescriptor[] = REGISTRY;

const BY_ID: Readonly<Record<string, DevTabDescriptor>> = Object.fromEntries(
  DEV_TAB_REGISTRY.map((tab) => [tab.id, tab]),
);

const BY_SEGMENT: Readonly<Record<string, DevTabDescriptor>> = Object.fromEntries(
  DEV_TAB_REGISTRY.flatMap((tab) =>
    [tab.id, ...tab.aliases, ...Object.keys(tab.filter?.segments ?? {})].map((segment) => [segment, tab]),
  ),
);

/**
 * Route segments that land on a tab with a fixed slug. The standalone About
 * tool folded into the Writing tab, where it is the pinned first entry;
 * `/dev/about` keeps resolving straight onto that entry.
 */
const PINNED_ROUTES: Readonly<Record<string, DevRoute>> = {
  about: { tab: "writing", slug: "about" },
};

/** The tab that opens when the route names no tab, or names one nobody knows. */
export const DEFAULT_DEV_TAB: DevModeTab = "articles";

// Own-property guards: these tables are keyed by URL segments, and
// `/dev/constructor` must not find `Object.prototype.constructor`.
export function findDevTab(id: DevModeTab): DevTabDescriptor;
export function findDevTab(id: string): DevTabDescriptor | undefined;
export function findDevTab(id: string): DevTabDescriptor | undefined {
  return hasOwn(BY_ID, id) ? BY_ID[id] : undefined;
}

export function resolveDevTabAlias(segment: string): DevTabDescriptor | undefined {
  return hasOwn(BY_SEGMENT, segment) ? BY_SEGMENT[segment] : undefined;
}

export type DevRoute = { tab: DevModeTab; slug?: string; filter?: string };

type DevRouteQuery = Readonly<Record<string, string | string[] | undefined>>;

function hasOwn(table: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(table, key);
}

/**
 * `/dev/<tabSegment>/<slugSegment>?<filter param>=<value>` to a tab. Unknown
 * tab segments fall back to the default tab and keep the slug, so a mistyped
 * tool name still lands on a shell instead of a 404. `query` is the page's
 * search params in Next's record shape; only a value the tab's `filter`
 * declares comes through, and a filter segment's preset wins over it.
 */
export function resolveDevRoute(
  tabSegment: string | undefined,
  slugSegment: string | undefined,
  query?: DevRouteQuery,
): DevRoute {
  if (tabSegment !== undefined && hasOwn(PINNED_ROUTES, tabSegment)) {
    return PINNED_ROUTES[tabSegment];
  }
  const descriptor = tabSegment === undefined ? undefined : resolveDevTabAlias(tabSegment);
  const route: DevRoute = { tab: descriptor?.id ?? DEFAULT_DEV_TAB };
  if (slugSegment) route.slug = slugSegment;
  const filter = descriptor?.filter;
  if (filter) {
    const segments = filter.segments ?? {};
    const queried = query?.[filter.param];
    if (tabSegment !== undefined && hasOwn(segments, tabSegment)) {
      route.filter = segments[tabSegment];
    } else if (typeof queried === "string" && filter.values.includes(queried)) {
      route.filter = queried;
    }
  }
  return route;
}
