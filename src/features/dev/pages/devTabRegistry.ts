import { roleMeetsFloor, type AppRole, type RoleFloor } from "@/lib/auth/roles";
import { DEV_ROUTE_FILTERS, type DevRouteFilter } from "@/utils/devHref";

export type DevToolGroup = "entry" | "content" | "intake" | "site";

type DevTabDataNeed = "library" | "library-deferred" | "changelog" | "contributors" | "layouts"

type DevTabDestination = { kind: "shell" } | { kind: "external"; href: string }

export type DevSaveModel = "record" | "batch" | "instant";

type DevTabDescriptorOf<Id extends string> = {
  id: Id;
  label: string;
  icon: string;
  group: DevToolGroup | "chrome";
  aliases: readonly string[];
  keywords?: readonly string[];
  role: RoleFloor;
  data: ReadonlySet<DevTabDataNeed>;
  saveModel: DevSaveModel;
  withoutApproval?: "submits-for-review" | "read-only";
  saveLine?: "in-tool" | "none";
  layout: "shell" | "full-bleed";
  labelFor?: (role: AppRole | null) => string;
  destination: DevTabDestination;
  badge?: "inbox" | "trip-reports" | "feedback" | "proposals" | "citations" | "glossary-feedback";
  filter?: DevRouteFilter;
  nestedSlug?: true;
};

const NO_DATA: ReadonlySet<DevTabDataNeed> = new Set();
const CORPUS_WITH_LAYOUTS: ReadonlySet<DevTabDataNeed> = new Set<DevTabDataNeed>([
  "library",
  "contributors",
  "layouts",
]);
const SHELL: DevTabDestination = { kind: "shell" };

const REGISTRY = [
  {
    id: "home",
    label: "Home",
    icon: "lucide:house",
    group: "entry",
    aliases: [],
    role: "contributor",
    data: NO_DATA,
    saveModel: "instant",
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
    role: "admin",
    data: new Set<DevTabDataNeed>(["library-deferred"]),
    saveModel: "instant",
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
    saveLine: "in-tool",
    layout: "full-bleed",
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
    data: new Set<DevTabDataNeed>(["library-deferred"]),
    saveModel: "instant",
    saveLine: "none",
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
    saveLine: "none",
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
    layout: "full-bleed",
    destination: SHELL,
    saveLine: "in-tool",
  },
  {
    id: "banners",
    label: "Banners",
    icon: "lucide:triangle-alert",
    group: "content",
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
    saveLine: "in-tool",
    layout: "full-bleed",
    destination: SHELL,
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
    role: "contributor",
    data: new Set<DevTabDataNeed>(["contributors"]),
    saveModel: "instant",
    saveLine: "in-tool",
    layout: "shell",
    destination: SHELL,
    filter: DEV_ROUTE_FILTERS.contributors,
  },
  {
    id: "playlists",
    label: "Playlists",
    icon: "lucide:list-video",
    group: "site",
    aliases: [],
    role: "contributor",
    data: NO_DATA,
    saveModel: "instant",
    saveLine: "in-tool",
    layout: "shell",
    destination: SHELL,
  },
  {
    id: "people",
    label: "People",
    icon: "lucide:user-cog",
    group: "site",
    aliases: ["members"],
    keywords: ["members", "accounts", "roles", "invites", "profiles", "contributors"],
    role: "admin",
    data: new Set<DevTabDataNeed>(["contributors"]),
    saveModel: "instant",
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
    keywords: ["translation", "translations", "i18n", "workbench", "languages", "locales"],
    role: "translator",
    data: NO_DATA,
    saveModel: "instant",
    saveLine: "in-tool",
    layout: "shell",
    destination: SHELL,
    badge: "glossary-feedback",
  },
  {
    id: "my-reports",
    label: "My reports",
    icon: "lucide:book-open-text",
    group: "site",
    aliases: [],
    role: "contributor",
    data: NO_DATA,
    saveModel: "instant",
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

const PINNED_ROUTES: Readonly<Record<string, DevRoute>> = {
  about: { tab: "writing", slug: "about" },
};

export const DEFAULT_DEV_TAB: DevModeTab = "articles";

export const HOME_DEV_TAB = "home" satisfies DevModeTab;

export const INBOX_ROLLUP_BADGE = "inbox" satisfies NonNullable<DevTabDescriptor["badge"]>;

const LANDING_FLOORS: readonly RoleFloor[] = ["admin", "editor", "translator", "contributor"];

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

export function findDevTab(id: DevModeTab): DevTabDescriptor;
export function findDevTab(id: string): DevTabDescriptor | undefined;
export function findDevTab(id: string): DevTabDescriptor | undefined {
  return hasOwn(BY_ID, id) ? BY_ID[id] : undefined;
}

export function getDevTabHeading(tool: DevModeTab, viewerRole: AppRole | null = null) {
  const descriptor = findDevTab(tool);
  return {
    icon: descriptor.icon,
    title: descriptor.labelFor?.(viewerRole) ?? descriptor.label,
  };
}

export function resolveDevTabAlias(segment: string): DevTabDescriptor | undefined {
  return hasOwn(BY_SEGMENT, segment) ? BY_SEGMENT[segment] : undefined;
}

export type DevRoute = { tab: DevModeTab; slug?: string; filter?: string };

type DevRouteQuery = Readonly<Record<string, string | string[] | undefined>>;

function hasOwn(table: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(table, key);
}

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
