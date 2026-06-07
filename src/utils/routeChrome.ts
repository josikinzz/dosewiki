import type { AppView, RouteChromeModel, RouteChromeNavGroup, RouteChromeNavItem } from "@/types/navigation";
import { parsePath, viewToPath } from "./routing";

const DEFAULT_VIEW: AppView = { type: "home" };
const DEFAULT_SUBSTANCE_SLUG = "lsd";
const HOME_VIEW: AppView = { type: "home" };
const SUBSTANCES_VIEW: AppView = { type: "substances" };
const EFFECTS_VIEW: AppView = { type: "effects" };
const REPORTS_VIEW: AppView = { type: "reports" };
const ABOUT_VIEW: AppView = { type: "about" };

function routeLabel(value: string): string {
  return value.replace(/-/g, " ");
}

export function getRouteChromePageTitle(view: AppView): string {
  switch (view.type) {
    case "home":
      return "dose.wiki";
    case "substances":
      return "Substance Index";
    case "substance":
      return `${routeLabel(view.slug)} - Substance Profile`;
    case "category":
      return `${view.categoryKey} Category`;
    case "effects":
      return "Subjective Effects Index";
    case "effect":
      return `${routeLabel(view.effectSlug)} - Subjective Effect`;
    case "effect-category":
      return `${routeLabel(view.categorySlug)} Effects`;
    case "mechanism":
      return `${routeLabel(view.mechanismSlug)} Mechanism`;
    case "classification":
      return `${routeLabel(view.slug)} ${view.classification === "chemical" ? "Chemical" : "Psychoactive"} Class`;
    case "search":
      return `Search Results for "${view.query}"`;
    case "about":
      return "About dose.wiki";
    case "contributor":
      return "Contributor Profile";
    case "reports":
      return "Trip Reports";
    case "report":
      return "Trip Report";
    case "dev":
      return `Developer Tools - ${view.tab}`;
    default:
      return "dose.wiki";
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
    case "reports":
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

function navItem(item: Omit<RouteChromeNavItem, "active">, activeGroup: RouteChromeNavGroup): RouteChromeNavItem {
  return {
    ...item,
    active: item.group === activeGroup,
  };
}

export function getRouteChromeModel(pathname?: string | null, searchQuery?: string | null): RouteChromeModel {
  const currentView = parsePath(pathname ?? undefined, DEFAULT_SUBSTANCE_SLUG, DEFAULT_VIEW);
  const resolvedCurrentView =
    currentView.type === "search" && searchQuery != null
      ? ({ type: "search", query: searchQuery } satisfies AppView)
      : currentView;
  const activeGroup = getRouteChromeActiveGroup(resolvedCurrentView);

  const primaryNavItems = [
    navItem(
      {
        id: "substances",
        label: "Substances",
        href: viewToPath(SUBSTANCES_VIEW),
        view: SUBSTANCES_VIEW,
        group: "substances",
        icon: "substances",
      },
      activeGroup,
    ),
    navItem(
      {
        id: "effects",
        label: "Effects",
        href: viewToPath(EFFECTS_VIEW),
        view: EFFECTS_VIEW,
        group: "effects",
        icon: "effects",
      },
      activeGroup,
    ),
    navItem(
      {
        id: "reports",
        label: "Reports",
        href: viewToPath(REPORTS_VIEW),
        view: REPORTS_VIEW,
        group: "reports",
        icon: "reports",
      },
      activeGroup,
    ),
  ];

  const aboutItem = navItem(
    {
      id: "about",
      label: "About",
      mobileLabel: "About dose.wiki",
      href: viewToPath(ABOUT_VIEW),
      view: ABOUT_VIEW,
      group: "about",
      icon: "about",
    },
    activeGroup,
  );

  return {
    currentView: resolvedCurrentView,
    pageTitle: getRouteChromePageTitle(resolvedCurrentView),
    activeGroup,
    headerLogo: {
      href: viewToPath(HOME_VIEW),
      view: HOME_VIEW,
    },
    footerLogo: {
      href: "/",
    },
    primaryNavItems,
    secondaryNavItems: [aboutItem],
    footerNavItems: [],
    footerExternalNavItems: [],
    footerShowsThemeToggle: true,
  };
}
