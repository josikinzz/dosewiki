import { SITE_FLAVOR_CONFIG, type SiteFlavorConfig, type SiteNavId } from "@/config/siteFlavor";
import type { AppView, RouteChromeModel, RouteChromeNavGroup, RouteChromeNavItem } from "@/types/navigation";
import { parsePath, viewToPath } from "./routing";

const DEFAULT_VIEW: AppView = { type: "home" };
const DEFAULT_SUBSTANCE_SLUG = "lsd";
const HOME_VIEW: AppView = { type: "home" };
const SUBSTANCES_VIEW: AppView = { type: "substances" };
const EFFECTS_VIEW: AppView = { type: "effects" };
const REPLICATIONS_VIEW: AppView = { type: "replications" };
const REPORTS_VIEW: AppView = { type: "reports" };
const ABOUT_VIEW: AppView = { type: "about" };

function routeLabel(value: string): string {
  return value.replace(/-/g, " ");
}

export function getRouteChromePageTitle(
  view: AppView,
  config: SiteFlavorConfig = SITE_FLAVOR_CONFIG,
): string {
  switch (view.type) {
    case "home":
      return config.homeTitle;
    case "substances":
      return "Substance Index";
    case "substance":
      return `${routeLabel(view.slug)} - Substance Profile`;
    case "category":
      return `${view.categoryKey} Category`;
    case "mantras":
      return "Mantra Vision Mandala";
    case "effects":
      return "Subjective Effects Index";
    case "effect":
      return `${routeLabel(view.effectSlug)} - Subjective Effect`;
    case "effect-category":
      return `${routeLabel(view.categorySlug)} Effects`;
    case "replications":
      return "Replications";
    case "mechanism":
      return `${routeLabel(view.mechanismSlug)} Mechanism`;
    case "classification":
      return `${routeLabel(view.slug)} ${view.classification === "chemical" ? "Chemical" : "Psychoactive"} Class`;
    case "search":
      return `Search Results for "${view.query}"`;
    case "about":
      return config.aboutTitle;
    case "contributor":
      return "Contributor Profile";
    case "reports":
      return "Trip Reports";
    case "report-submit":
      return "Submit a Trip Report";
    case "report":
      return "Trip Report";
    case "dev":
      return `Developer Tools - ${view.tab}`;
    default:
      return config.homeTitle;
  }
}

export function getRouteChromeActiveGroup(view: AppView): RouteChromeNavGroup {
  switch (view.type) {
    case "substances":
    case "substance":
    case "category":
    case "mechanism":
    case "classification":
      return "substances";
    case "effects":
    case "effect":
    case "effect-category":
      return "effects";
    case "replications":
      return "replications";
    case "reports":
    case "report-submit":
    case "report":
      return "reports";
    case "about":
      return "about";
    case "dev":
      return "dev";
    default:
      return "none";
  }
}

/**
 * Every navigation destination either flavor can offer, keyed by the id the Site Flavor
 * Config orders. The config owns *which* items appear and in *what order*; this registry
 * owns what each one is. `about` is looked up by its literal id in the header, so that id
 * is load-bearing beyond the ordered lists.
 */
const NAV_ITEM_DEFINITIONS: Record<SiteNavId, Omit<RouteChromeNavItem, "active">> = {
  substances: {
    id: "substances",
    label: "Substances",
    href: viewToPath(SUBSTANCES_VIEW),
    view: SUBSTANCES_VIEW,
    group: "substances",
    icon: "substances",
  },
  effects: {
    id: "effects",
    label: "Effects",
    href: viewToPath(EFFECTS_VIEW),
    view: EFFECTS_VIEW,
    group: "effects",
    icon: "effects",
  },
  replications: {
    id: "replications",
    label: "Replications",
    href: viewToPath(REPLICATIONS_VIEW),
    view: REPLICATIONS_VIEW,
    group: "replications",
    icon: "replications",
  },
  reports: {
    id: "reports",
    label: "Reports",
    href: viewToPath(REPORTS_VIEW),
    view: REPORTS_VIEW,
    group: "reports",
    icon: "reports",
  },
  about: {
    id: "about",
    label: "About",
    mobileLabel: "About",
    href: viewToPath(ABOUT_VIEW),
    view: ABOUT_VIEW,
    group: "about",
    icon: "about",
  },
};

function navItem(item: Omit<RouteChromeNavItem, "active">, activeGroup: RouteChromeNavGroup): RouteChromeNavItem {
  return {
    ...item,
    active: item.group === activeGroup,
  };
}

function buildNavItems(
  ids: readonly SiteNavId[],
  activeGroup: RouteChromeNavGroup,
): RouteChromeNavItem[] {
  return ids.map((id) => navItem(NAV_ITEM_DEFINITIONS[id], activeGroup));
}

export function getRouteChromeModel(
  pathname?: string | null,
  searchQuery?: string | null,
  config: SiteFlavorConfig = SITE_FLAVOR_CONFIG,
): RouteChromeModel {
  const currentView = parsePath(pathname ?? undefined, DEFAULT_SUBSTANCE_SLUG, DEFAULT_VIEW);
  const resolvedCurrentView =
    currentView.type === "search" && searchQuery != null
      ? ({ type: "search", query: searchQuery } satisfies AppView)
      : currentView;
  const activeGroup = getRouteChromeActiveGroup(resolvedCurrentView);

  return {
    currentView: resolvedCurrentView,
    pageTitle: getRouteChromePageTitle(resolvedCurrentView, config),
    activeGroup,
    headerLogo: {
      href: viewToPath(HOME_VIEW),
      view: HOME_VIEW,
    },
    footerLogo: {
      href: "/",
    },
    primaryNavItems: buildNavItems(config.primaryNavIds, activeGroup),
    secondaryNavItems: buildNavItems(config.secondaryNavIds, activeGroup),
    footerNavItems: [],
    footerExternalNavItems: [],
    footerShowsThemeToggle: config.showThemeToggle,
  };
}
