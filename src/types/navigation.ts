export type DevTab =
  | "change-log"
  | "tag-editor"
  | "profile"
  | "index-layout"
  | "about"
  | "citation-review"
  | "trip-report-submissions"
  | "articles";

export type AppView =
  | { type: "home" }
  | { type: "substances" }
  | { type: "substance"; slug: string }
  | { type: "category"; categoryKey: string }
  | { type: "mantras" }
  | { type: "effects" }
  | { type: "effect"; effectSlug: string }
  | { type: "effect-category"; categorySlug: string }
  | { type: "mechanism"; mechanismSlug: string; qualifierSlug?: string }
  | { type: "classification"; classification: "chemical" | "psychoactive"; slug: string }
  | { type: "about" }
  | { type: "search"; query: string }
  | { type: "dev"; tab: DevTab; slug?: string }
  | { type: "contributor"; profileKey: string }
  | { type: "reports" }
  | { type: "report-submit" }
  | { type: "report"; slug: string; fromSubstanceSlug?: string };

export type RouteChromeNavGroup = "substances" | "effects" | "reports" | "about" | "dev" | "none";

export type RouteChromeIcon = "substances" | "effects" | "reports" | "about" | "dev" | "github";

export interface RouteChromeNavItem {
  id: string;
  label: string;
  mobileLabel?: string;
  href: string;
  view?: AppView;
  group: RouteChromeNavGroup;
  icon: RouteChromeIcon;
  active: boolean;
}

export interface RouteChromeExternalNavItem {
  id: string;
  label: string;
  href: string;
  icon: RouteChromeIcon;
}

export interface RouteChromeModel {
  currentView: AppView;
  pageTitle: string;
  activeGroup: RouteChromeNavGroup;
  headerLogo: {
    href: string;
    view: AppView;
  };
  footerLogo: {
    href: string;
  };
  primaryNavItems: RouteChromeNavItem[];
  secondaryNavItems: RouteChromeNavItem[];
  footerNavItems: RouteChromeNavItem[];
  footerExternalNavItems: RouteChromeExternalNavItem[];
  footerShowsThemeToggle: boolean;
}
