/**
 * The one list of dev-shell tabs. The rail, both route resolvers (server
 * `/dev/[[...segments]]` and the client `parsePath`), the render switch, the
 * loading policy, and the primary-tab resolver all read from it, so adding a
 * tab is one entry here plus its render branch in `DevModePageView`.
 *
 * Kept free of React and runtime app imports on purpose: the server route and
 * the client router both load it. The one runtime role import is the pure
 * floor check that `firstUsableTab` needs.
 */

import { roleMeetsFloor, type AppRole, type RoleFloor } from "@/lib/auth/roles";
import { DEV_ROUTE_FILTERS, type DevRouteFilter } from "@/utils/devHref";

/**
 * `entry` (the rail's Start group) holds Home, where bare `/dev` opens for
 * every role, and the Inbox, the admin's entry point. It renders ahead of the
 * other groups as plain pills, and the Inbox count stands in for the intake
 * counts the group menus would otherwise roll up.
 */
export type DevToolGroup = "entry" | "content" | "intake" | "site";

/**
 * - `library`: reads the substance corpus and waits on the library drain
 *   before rendering.
 * - `library-deferred`: starts the corpus read without blocking the active tool.
 * - `contributors`: reads the contributor profile directory. Corpus tools need
 *   it for changelog attribution on save; Contributors, People and Writing
 *   need it for their lists and pickers.
 * - `layouts`: reads the private, revision-bearing index layouts used by
 *   staged corpus drafts and proposal application.
 */
type DevTabDataNeed = "library" | "library-deferred" | "changelog" | "contributors" | "layouts"

type DevTabDestination = { kind: "shell" } | { kind: "external"; href: string }

/**
 * How a tool's primary action writes, said once per tool by the save line:
 * - `record`: each record keeps its own draft until Publish (or Submit for
 *   review, for a role that cannot publish).
 * - `batch`: edits collect in one shared working set until Commit.
 * - `instant`: each action writes to the live site as it happens.
 */
export type DevSaveModel = "record" | "batch" | "instant";

type DevTabDescriptorOf<Id extends string> = {
  id: Id;
  label: string;
  /**
   * The tool's glyph, an Iconify name for `Icon`. The phone bar, the tool
   * sheet and the Cmd+K palette draw it beside the label so a tool is
   * recognised before it is read.
   */
  icon: string;
  group: DevToolGroup | "chrome";
  /** Route path segments, other than `id`, that resolve to this tab. */
  aliases: readonly string[];
  /**
   * Extra words the Cmd+K palette matches this tool by, beyond its label, id
   * and route aliases: the words an editor reaches for that are not addresses.
   */
  keywords?: readonly string[];
  /** Lowest role that may use the tool; the rail disables the tab, with a reason, for anyone below it. */
  role: RoleFloor;
  data: ReadonlySet<DevTabDataNeed>;
  saveModel: DevSaveModel;
  /**
   * What the primary action does for a role below admin. Absent: the same
   * write an admin makes. `submits-for-review` turns it into a proposal an
   * admin approves; `read-only` means only an admin can save here.
   */
  withoutApproval?: "submits-for-review" | "read-only";
  /**
   * Where the save line renders. Absent: the shell draws it above the tool.
   * `in-tool`: the tool draws it beside its own primary action. `none`: the
   * tool has no single save to describe.
   */
  saveLine?: "in-tool" | "none";
  /** `full-bleed` tools keep the whole viewport width; `shell` tools sit in the 6xl column. */
  layout: "shell" | "full-bleed";
  /** Role-dependent rail label; falls back to `label`. */
  labelFor?: (role: AppRole | null) => string;
  destination: DevTabDestination;
  /** Named count source rendered as a rail badge; `useDevRailBadges` maps the name to its endpoint. */
  badge?: "inbox" | "trip-reports" | "feedback" | "proposals" | "citations" | "glossary-feedback";
  /**
   * A tab-level filter kept in the URL as `?<param>=<value>`. `segments` are
   * extra route segments that open the tab with that value preset, the way a
   * retired tab's address keeps working after it folds into this one.
   */
  filter?: DevRouteFilter;
  /**
   * The slug spans two route segments (`/dev/<tab>/<a>/<b>` opens slug
   * `a/b`), for a tool whose record lives under a sub-collection, such as the
   * molecule editor's `<mode>/<slug>`.
   */
  nestedSlug?: true;
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
    id: "home",
    label: "Home",
    icon: "lucide:house",
    group: "entry",
    aliases: [],
    // Each member's own work, by role: counts and cards that link to the exact
    // item. At the lowest floor so every member role opens it.
    role: "contributor",
    data: NO_DATA,
    saveModel: "instant",
    // A read-only landing: every card opens the tool that owns the item.
    saveLine: "none",
    layout: "shell",
    destination: SHELL,
  },
  {
    id: "inbox",
    label: "Inbox",
    icon: "lucide:inbox",
    group: "entry",
    aliases: [],
    // Everything that waits on an admin, from every intake tool, in one list.
    // The owning tools keep their tabs and open from here for the full review.
    role: "admin",
    data: NO_DATA,
    saveModel: "instant",
    // Claims and intake decisions, one item at a time; publishing stays in the owning tools.
    saveLine: "none",
    layout: "shell",
    destination: SHELL,
    badge: "inbox",
  },
  {
    id: "articles",
    label: "Substances",
    icon: "lucide:flask-conical",
    group: "content",
    aliases: ["generator", "gen"],
    keywords: ["articles", "drugs"],
    role: "editor",
    data: CORPUS_WITH_LAYOUTS,
    saveModel: "record",
    withoutApproval: "submits-for-review",
    layout: "shell",
    destination: SHELL,
  },
  {
    id: "review",
    label: "Review",
    icon: "lucide:list-checks",
    group: "content",
    aliases: [],
    role: "editor",
    data: NO_DATA,
    // The workbench's primary action is the review tick, which writes at once.
    saveModel: "instant",
    layout: "shell",
    destination: { kind: "external", href: "/review" },
  },
  {
    id: "citation-review",
    label: "Citations",
    icon: "lucide:quote",
    group: "intake",
    aliases: ["citations"],
    keywords: ["references", "sources"],
    role: "admin",
    // The corpus names each queued article and lets the open article load
    // whole for its marker checks; the queue itself does not wait for it.
    data: new Set<DevTabDataNeed>(["library-deferred"]),
    saveModel: "instant",
    layout: "shell",
    destination: SHELL,
    badge: "citations",
  },
  {
    id: "trip-report-submissions",
    label: "Trip reports",
    icon: "lucide:notebook-pen",
    group: "intake",
    aliases: ["trip-reports"],
    role: "admin",
    data: NO_DATA,
    saveModel: "instant",
    layout: "full-bleed",
    destination: SHELL,
    badge: "trip-reports",
    // Decisions say what they do in the review dock; a report's save states its model beside Save.
    saveLine: "in-tool",
  },
  {
    id: "article-feedback",
    label: "Feedback",
    icon: "lucide:message-square-text",
    group: "intake",
    aliases: ["feedback"],
    role: "admin",
    data: NO_DATA,
    saveModel: "instant",
    layout: "shell",
    destination: SHELL,
    badge: "feedback",
    // Decisions write one item at a time and the review dock says so; no save sentence fits.
    saveLine: "none",
    // Site feedback folded in as the source filter; `/dev/site-feedback` still opens that queue.
    filter: DEV_ROUTE_FILTERS["article-feedback"],
  },
  {
    id: "tag-editor",
    label: "Tags",
    icon: "lucide:tags",
    group: "content",
    aliases: ["tag"],
    role: "editor",
    data: new Set<DevTabDataNeed>(["library-deferred"]),
    saveModel: "batch",
    withoutApproval: "submits-for-review",
    layout: "shell",
    destination: SHELL,
  },
  {
    id: "molecule-editor",
    label: "Molecules",
    icon: "lucide:hexagon",
    group: "content",
    aliases: ["molecules"],
    role: "admin",
    data: NO_DATA,
    saveModel: "instant",
    nestedSlug: true,
    layout: "shell",
    destination: SHELL,
  },
  {
    id: "banners",
    label: "Banners",
    icon: "lucide:triangle-alert",
    group: "content",
    // `/dev/warnings` is the wording an editor reaching for this from an
    // article is likely to type; the tool itself is named Banners per the
    // design brief's glossary.
    aliases: ["warnings"],
    keywords: ["safety"],
    role: "admin",
    data: NO_DATA,
    saveModel: "instant",
    layout: "full-bleed",
    destination: SHELL,
  },
  {
    id: "replications",
    label: "Replications",
    icon: "lucide:images",
    group: "content",
    aliases: ["replication-studio"],
    keywords: ["gallery", "images"],
    role: "admin",
    data: NO_DATA,
    saveModel: "instant",
    saveLine: "in-tool",
    layout: "full-bleed",
    destination: SHELL,
  },
  {
    id: "writing",
    label: "Writing",
    icon: "lucide:pen-line",
    group: "site",
    aliases: [],
    keywords: ["blog", "effects"],
    role: "editor",
    data: new Set<DevTabDataNeed>(["contributors"]),
    saveModel: "record",
    withoutApproval: "submits-for-review",
    // The pane's dock says it: a post can stay a draft or publish, and About
    // publishes at once, which one frame sentence cannot both say.
    saveLine: "in-tool",
    // The list, the fields and a live preview of the public page sit side by
    // side; the tool caps its own width.
    layout: "full-bleed",
    destination: SHELL,
    // Blog folded in as the kind filter; `/dev/blog/<slug>` still opens the post.
    filter: DEV_ROUTE_FILTERS.writing,
  },
  {
    id: "copy-studio",
    label: "Copy",
    icon: "lucide:type",
    group: "site",
    aliases: ["copy"],
    role: "editor",
    data: NO_DATA,
    saveModel: "record",
    withoutApproval: "submits-for-review",
    // The pane's dock says it: an admin's Publish goes live with no draft step,
    // which the frame's "record" sentence would misstate.
    saveLine: "in-tool",
    layout: "shell",
    destination: SHELL,
  },
  {
    id: "queue",
    label: "Change Review",
    icon: "lucide:git-pull-request-arrow",
    group: "intake",
    aliases: ["proposals"],
    keywords: ["submissions"],
    role: "editor",
    data: NO_DATA,
    saveModel: "instant",
    saveLine: "none",
    labelFor: (role) => (role === "admin" ? "Change Review" : "My submissions"),
    layout: "shell",
    destination: SHELL,
    badge: "proposals",
  },
  {
    id: "contributors",
    label: "Contributors",
    icon: "lucide:users",
    group: "site",
    aliases: ["contributor"],
    // The one people editor: a contributor opens it on their own record, so
    // the descriptor sits at the contributor floor and the tab decides what
    // that role may see.
    role: "contributor",
    data: new Set<DevTabDataNeed>(["contributors"]),
    saveModel: "instant",
    // The profile save dock says it beside Save; each order panel says it saves on its own.
    saveLine: "in-tool",
    layout: "shell",
    destination: SHELL,
    // Profile folded in as the self scope; `/dev/profile` still lands there.
    filter: DEV_ROUTE_FILTERS.contributors,
  },
  {
    id: "playlists",
    label: "Playlists",
    icon: "lucide:list-video",
    group: "site",
    aliases: [],
    // A member's own replication playlists: the descriptor sits at the
    // contributor floor and Postgres's ownership rule decides which rows they
    // may change. Applying a playlist to a gallery stays in the studio.
    role: "contributor",
    data: NO_DATA,
    saveModel: "instant",
    // A save stores the playlist and publishes nothing, which the instant
    // sentence would misstate; the tool says so beside Save instead.
    saveLine: "in-tool",
    layout: "shell",
    destination: SHELL,
  },
  {
    id: "people",
    label: "People",
    icon: "lucide:user-cog",
    group: "site",
    // Members folded in: `/dev/members` and `/dev/members/<email>` still open here.
    aliases: ["members"],
    keywords: ["members", "accounts", "roles", "invites", "profiles", "contributors"],
    // Each account beside its public profile: roster, roles, bans, resets,
    // invites and the link between the two. Every account action and the
    // link are admin-only in Postgres too. Contributors stays the profile
    // directory for editors and each contributor's own profile.
    role: "admin",
    data: new Set<DevTabDataNeed>(["contributors"]),
    saveModel: "instant",
    // Account changes apply on the member's next request after a confirm;
    // profile saves go live at once. Each block of the person pane says which,
    // so one shell sentence would misstate half of it.
    saveLine: "none",
    layout: "shell",
    destination: SHELL,
  },
  {
    id: "glossary",
    label: "Glossary",
    icon: "lucide:languages",
    group: "site",
    aliases: ["translation-glossary"],
    keywords: ["translation", "languages", "locales"],
    // The locale mirrors' term list. Approving a rendering changes every prompt
    // but spends nothing, so translators own it; the paid actions (drafting,
    // retranslating, the main run) stay admin inside the tab and their routes.
    role: "translator",
    data: NO_DATA,
    saveModel: "instant",
    // The workbench has two saves (Save draft keeps a rendering for another
    // reviewer, Save and approve puts it in use). Its header carries its own
    // SaveLine sentence, which the write freeze still replaces.
    saveLine: "in-tool",
    layout: "shell",
    destination: SHELL,
    // Reader feedback on the renderings waits here, per language the reviewer holds.
    badge: "glossary-feedback",
  },
  {
    id: "my-reports",
    label: "My reports",
    icon: "lucide:book-open-text",
    group: "site",
    aliases: [],
    // A member's own published trip reports; ownership is checked per row in Postgres.
    role: "contributor",
    data: NO_DATA,
    saveModel: "instant",
    // The sentence sits in the editor's save dock and its idle pane, beside Save.
    saveLine: "in-tool",
    layout: "shell",
    destination: SHELL,
  },
  {
    id: "index-layout",
    label: "Index layout",
    icon: "lucide:layout-grid",
    group: "content",
    aliases: ["index"],
    role: "editor",
    data: CORPUS_WITH_LAYOUTS,
    saveModel: "batch",
    withoutApproval: "submits-for-review",
    layout: "full-bleed",
    destination: SHELL,
  },
  {
    id: "change-log",
    label: "Change log",
    icon: "lucide:history",
    group: "chrome",
    aliases: ["changelog"],
    keywords: ["history", "diff", "saves"],
    role: "editor",
    // The directory names who made each save instead of its stamped key.
    data: new Set<DevTabDataNeed>(["changelog", "contributors"]),
    saveModel: "instant",
    layout: "shell",
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

/** The tab that opens when the route names a tab nobody knows. */
export const DEFAULT_DEV_TAB: DevModeTab = "articles";

/** Where bare `/dev` (and sign-in's return) opens: each member's own work. */
export const HOME_DEV_TAB = "home" satisfies DevModeTab;

/** The rail badge that sums every intake count; the tab carrying it is the Inbox. */
export const INBOX_ROLLUP_BADGE = "inbox" satisfies NonNullable<DevTabDescriptor["badge"]>;

/**
 * Floors in fallback preference. A translator also holds the contributor
 * floor, but their own tool is the Glossary, so the more specific floor wins;
 * for admins it is the Inbox, the entry point for everything waiting on them.
 */
const LANDING_FLOORS: readonly RoleFloor[] = ["admin", "editor", "translator", "contributor"];

/**
 * The first tool a role can use: the first shell tool in registry order at
 * the most specific floor the role holds. Home is not a tool, so it never
 * answers here; bare `/dev` opens Home directly, and this stays the fallback
 * for the Tools section. Roles with no usable tool keep the default, which
 * renders its locked panel.
 */
export function firstUsableTab(role: AppRole | null | undefined): DevModeTab {
  for (const floor of LANDING_FLOORS) {
    if (!roleMeetsFloor(role, floor)) continue;
    const tab = DEV_TAB_REGISTRY.find(
      (candidate) =>
        candidate.id !== HOME_DEV_TAB
        && candidate.group !== "chrome"
        && candidate.destination.kind === "shell"
        && candidate.role === floor,
    );
    if (tab) return tab.id;
  }
  return DEFAULT_DEV_TAB;
}

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
 * `/dev/<tabSegment>/<slugSegment>?<filter param>=<value>` to a tab. Bare
 * `/dev` opens Home. Unknown tab segments fall back to the default tab and
 * keep the slug, so a mistyped tool name still lands on a shell instead of a
 * 404. `query` is the page's
 * search params in Next's record shape; only a value the tab's `filter`
 * declares comes through, and a filter segment's preset wins over it.
 * `nestedSegment` is the segment after the slug; only a `nestedSlug` tab
 * keeps it, joined onto the slug.
 */
export function resolveDevRoute(
  tabSegment: string | undefined,
  slugSegment: string | undefined,
  query?: DevRouteQuery,
  nestedSegment?: string,
): DevRoute {
  if (tabSegment !== undefined && hasOwn(PINNED_ROUTES, tabSegment)) {
    return PINNED_ROUTES[tabSegment];
  }
  const descriptor = tabSegment === undefined ? undefined : resolveDevTabAlias(tabSegment);
  const route: DevRoute = { tab: tabSegment === undefined ? HOME_DEV_TAB : descriptor?.id ?? DEFAULT_DEV_TAB };
  if (slugSegment) {
    route.slug = descriptor?.nestedSlug && nestedSegment ? `${slugSegment}/${nestedSegment}` : slugSegment;
  }
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
