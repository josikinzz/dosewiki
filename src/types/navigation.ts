import type { DevModeTab } from "@/features/dev/pages/devTabRegistry";

export type AppView =
  | { type: "home" }
  | { type: "glossary"; locale?: string; directory?: boolean }
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

export interface RouteChromeNavChild {
  id: string;
  label: string;
  href: string;
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
