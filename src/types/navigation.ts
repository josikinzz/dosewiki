import type { DevModeTab } from "@/features/dev/pages/devTabRegistry";

export type AppView =
  | { type: "home" }
  | { type: "substances" }
  | { type: "substance"; slug: string }
  | { type: "category"; categoryKey: string }
  | { type: "mantras" }
  | { type: "replications" }
  | { type: "effects" }
  | { type: "effect"; effectSlug: string }
  | { type: "effect-category"; categorySlug: string }
  | { type: "mechanism"; mechanismSlug: string; qualifierSlug?: string }
  | { type: "classification"; classification: "chemical" | "psychoactive"; slug: string }
  | { type: "about" }
  | { type: "search"; query: string }
  | { type: "dev"; tab: DevModeTab; slug?: string; filter?: string }
  | { type: "contributor"; profileKey: string }
  | { type: "reports" }
  | { type: "report-submit" }
  | { type: "report"; slug: string; fromSubstanceSlug?: string };

export type RouteChromeNavGroup =
  | "substances"
  | "effects"
  | "replications"
  | "reports"
  | "about"
  | "dev"
  | "none";

export type RouteChromeIcon =
  | "substances"
  | "effects"
  | "replications"
  | "reports"
  | "about"
  | "dev"
  | "github";

/**
 * One entry in a top-level nav item's dropdown.
 *
 * Children are deliberately addressed by `href` rather than by {@link AppView}: a flavor may
 * point one at a routed subsection, query string, or another site, none of which the in-app
 * view union models. They therefore carry no active state either: the chrome only knows
 * which section the reader is in, not which view within it.
 */
export interface RouteChromeNavChild {
  id: string;
  label: string;
  href: string;
  /** `true` renders an anchor that opens in a new tab. */
  external: boolean;
}

export interface RouteChromeNavItem {
  id: string;
  label: string;
  mobileLabel?: string;
  href: string;
  view?: AppView;
  group: RouteChromeNavGroup;
  icon: RouteChromeIcon;
  active: boolean;
  /**
   * Dropdown children, or `undefined` when this item is a plain link. Absent on every
   * dose.wiki item, since that publication's header is flat, and the submenu code path must stay
   * inert rather than render an empty panel.
   */
  submenu?: readonly RouteChromeNavChild[];
}

interface RouteChromeExternalNavItem {
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
  primaryNavItems: RouteChromeNavItem[];
  secondaryNavItems: RouteChromeNavItem[];
  footerNavItems: RouteChromeNavItem[];
  footerExternalNavItems: RouteChromeExternalNavItem[];
}
