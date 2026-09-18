import { Header } from "@/components/layout/Header";
import type {
  AppView,
  RouteChromeModel,
  RouteChromeNavItem,
} from "@/types/navigation";

import type { StoryDef } from "../registry/types";

// Inert navigation handler. The public route shell wires these to the App Router;
// on the isolated dev page the header still mounts because its embedded GlobalSearch
// is loaded via next/dynamic (ssr:false) and stays idle until focused with a query.
const noopNavigate = (_view: AppView) => {};
const homeView: AppView = { type: "home" };

function navItem(
  id: string,
  label: string,
  href: string,
  icon: RouteChromeNavItem["icon"],
  group: RouteChromeNavItem["group"],
  active = false,
): RouteChromeNavItem {
  return { id, label, href, icon, group, active };
}

// Minimal mock of the chrome model the public layout normally derives server-side.
function mockModel(activeId: string): RouteChromeModel {
  return {
    currentView: homeView,
    pageTitle: "dose.wiki",
    activeGroup: "none",
    headerLogo: { href: "/", view: homeView },
    primaryNavItems: [
      navItem("substances", "Substances", "/substances", "substances", "substances", activeId === "substances"),
      navItem("effects", "Effects", "/effects", "effects", "effects", activeId === "effects"),
      navItem("reports", "Trip reports", "/reports", "reports", "reports", activeId === "reports"),
    ],
    secondaryNavItems: [
      { ...navItem("about", "About", "/about", "about", "about", activeId === "about"), mobileLabel: "About dose.wiki" },
    ],
    footerNavItems: [],
    footerExternalNavItems: [],
  };
}

export const headerStory: StoryDef = {
  id: "header",
  name: "Header",
  tier: "layout",
  status: "stable",
  summary:
    "The public site top bar: brand logo, centered global search, and primary/about navigation that collapses into a mobile menu button. Driven entirely by a RouteChromeModel.",
  source: "src/components/layout/Header.tsx",
  importLine: 'import { Header } from "@/components/layout/Header";',
  exports: ["Header"],
  examples: [
    {
      label: "Default (desktop chrome)",
      note: "Logo, centered search, and inline primary nav with a divided About link. Substances is the active route.",
      background: "subtle",
      full: true,
      render: () => (
        <Header model={mockModel("substances")} onNavigate={noopNavigate} />
      ),
    },
    {
      label: "Effects active",
      note: "data-active is wired from the model — here the Effects nav item carries the active ring.",
      background: "card",
      full: true,
      render: () => (
        <Header model={mockModel("effects")} onNavigate={noopNavigate} />
      ),
    },
    {
      label: "Forced mobile nav",
      note: "forceMobileNav hides the inline nav and shows the hamburger toggle regardless of viewport width.",
      background: "subtle",
      full: true,
      render: () => (
        <Header model={mockModel("reports")} onNavigate={noopNavigate} forceMobileNav />
      ),
    },
  ],
  props: [
    {
      name: "model",
      type: "RouteChromeModel",
      description:
        "Required. Supplies the logo href, current view, and the primary/secondary nav items (the About link is read from secondaryNavItems).",
    },
    {
      name: "onNavigate",
      type: "(view: AppView) => void",
      description: "Required. Forwarded to the embedded GlobalSearch for suggestion/submit navigation.",
    },
    {
      name: "onReplaceNavigate",
      type: "(view: AppView) => void",
      description: "Optional. Passed through to GlobalSearch to replace history while editing a live search.",
    },
    {
      name: "onLiveNavigate",
      type: "(view: AppView) => void",
      description: "Optional. Passed through to GlobalSearch for live results-page navigation.",
    },
    {
      name: "liveSearchClearView",
      type: "AppView | null",
      default: "null",
      description: "Optional. Route the embedded search returns to when a live search is cleared.",
    },
    {
      name: "forceMobileNav",
      type: "boolean",
      default: "false",
      description: "Always render the hamburger menu and hide the inline desktop nav, ignoring the lg breakpoint.",
    },
  ],
  whenToUse: [
    "The single top chrome bar on every public App Router page.",
    "When you already have a RouteChromeModel and want consistent brand, search, and nav.",
  ],
  whenNotToUse: [
    "Dev/editor surfaces — those have their own chrome and do not use the public RouteChromeModel.",
    "Section sub-headers inside an article — use SectionHeader instead.",
  ],
  notes: [
    "Client component: tracks the mobile menu via useState and closes it on outside-click, Escape, or route change.",
    "GlobalSearch is loaded with next/dynamic (ssr:false), so the server build renders a skeleton placeholder and the live field hydrates on the client.",
    "Active state, labels, hrefs, and the mobile-only About label all come from the model — the component renders no hardcoded routes beyond the brand link.",
  ],
};
