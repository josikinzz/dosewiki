import { Footer } from "@/components/layout/Footer";

import type { RouteChromeModel } from "@/types/navigation";
import type { StoryDef } from "../registry/types";

/**
 * Build a minimal RouteChromeModel for the footer examples. Only the
 * footer-facing slice of the model is read by <Footer />, so the rest is
 * filled with inert defaults to satisfy the type without pulling in the real
 * route-chrome builder (a runtime util we must not import here).
 */
function mockFooterModel(overrides: {
  footerNavItems?: RouteChromeModel["footerNavItems"];
  footerExternalNavItems?: RouteChromeModel["footerExternalNavItems"];
}): RouteChromeModel {
  return {
    currentView: { type: "home" },
    pageTitle: "dose.wiki",
    activeGroup: "none",
    headerLogo: { href: "/", view: { type: "home" } },
    primaryNavItems: [],
    secondaryNavItems: [],
    footerNavItems: overrides.footerNavItems ?? [],
    footerExternalNavItems: overrides.footerExternalNavItems ?? [],
  };
}

export const footerStory: StoryDef = {
  id: "footer",
  name: "Footer",
  tier: "layout",
  status: "stable",
  summary:
    "Public site footer chrome: harm-reduction disclaimer, license link, optional icon nav, and the reader appearance controls. It carries no brand mark — the header already has one on every page that renders this footer.",
  source: "src/components/layout/Footer.tsx",
  importLine: 'import { Footer } from "@/components/layout/Footer";',
  exports: ["Footer"],
  examples: [
    {
      label: "Default",
      note: "No footer nav items — disclaimer, license link, and the appearance cog only. This is the shipped public default.",
      background: "plain",
      full: true,
      render: () => <Footer model={mockFooterModel({})} />,
    },
    {
      label: "With icon nav + external link",
      note: "footerNavItems render internal <Link> circles; footerExternalNavItems open in a new tab (e.g. the GitHub repo).",
      background: "plain",
      full: true,
      render: () => (
        <Footer
          model={mockFooterModel({
            footerNavItems: [
              {
                id: "about",
                label: "About",
                href: "/about",
                group: "about",
                icon: "about",
                active: false,
              },
              {
                id: "reports",
                label: "Trip Reports",
                href: "/reports",
                group: "reports",
                icon: "reports",
                active: false,
              },
            ],
            footerExternalNavItems: [
              {
                id: "github",
                label: "Source on GitHub",
                href: "https://github.com/",
                icon: "github",
              },
            ],
          })}
        />
      ),
    },
  ],
  props: [
    {
      name: "model",
      type: "RouteChromeModel",
      default: 'getRouteChromeModel("/")',
      description:
        "Route chrome model. Footer reads only its footer slice: footerNavItems and footerExternalNavItems.",
    },
  ],
  whenToUse: [
    "The bottom chrome of public App Router pages, rendered once per page shell.",
    "Surfacing the harm-reduction disclaimer, CC0 license link, and the appearance controls.",
  ],
  whenNotToUse: [
    "Dev editor or admin surfaces — those use their own chrome, not the public footer.",
    "Inside content cards or sections — this is page-level chrome and owns a semantic <footer> landmark.",
  ],
  notes: [
    "Defaults its model from getRouteChromeModel(\"/\"), so it renders standalone without props.",
    "footerNavItems use internal next/link; footerExternalNavItems render <a> with target=_blank rel=noopener.",
    "The appearance cog is publication policy, not a prop: day/night follows showColorSchemeToggle, and the Fun/Pro row is omitted entirely on a publication whose style is locked.",
    "Appearance state comes from the root ThemeProvider — the cog holds none of its own, so the footer's and the homepage's always agree.",
  ],
};
