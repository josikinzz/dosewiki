import { SiteSupporter } from "@/components/common/SiteSupporter";
import { SITE_FLAVOR_CONFIGS } from "@/config/siteFlavor";

import type { StoryDef } from "../registry/types";

export const siteSupporterStory: StoryDef = {
  id: "site-supporter",
  name: "SiteSupporter",
  tier: "common",
  status: "stable",
  summary:
    "Supporter credit, currently rendered on the About page only. Reads `footer.supporter` from the site flavor and renders nothing when the publication has no supporter to name.",
  source: "src/components/common/SiteSupporter.tsx",
  importLine: 'import { SiteSupporter } from "@/components/common/SiteSupporter";',
  exports: ["SiteSupporter"],
  examples: [
    {
      label: "Default",
      note: "Two rows: an 11px tracked uppercase label over a 24px mark. The mark sits one tone above the label, so the supporter's name reads first.",
      background: "card",
      render: () => <SiteSupporter config={SITE_FLAVOR_CONFIGS.dosewiki} />,
    },
    {
      label: "About page — larger, centred mark",
      note: "The About page centres the credit under the contributor roster at a 36px mark; this example uses a 28px mark to fit the card.",
      background: "card",
      render: () => (
        <SiteSupporter align="center" config={SITE_FLAVOR_CONFIGS.dosewiki} markHeightRem={1.75} />
      ),
    },
    {
      label: "Flavor with no supporter",
      note: "Effect Index sets `footer.supporter: null`, so the component returns null — nothing renders between the rules below.",
      background: "card",
      full: true,
      render: () => (
        <div className="flex flex-col gap-2">
          <hr className="theme-divider border-t" />
          <SiteSupporter config={SITE_FLAVOR_CONFIGS.effectindex} />
          <hr className="theme-divider border-t" />
        </div>
      ),
    },
  ],
  props: [
    {
      name: "align",
      type: '"start" | "center"',
      default: '"start"',
      description:
        "Cross-axis alignment of the two rows. Pass this rather than an `items-*` class: competing Tailwind alignment utilities resolve by stylesheet order, not class order.",
    },
    {
      name: "className",
      type: "string",
      default: "—",
      description: "Extra classes on the anchor. Callers use it for outer spacing in the footer and for the homepage's fixed corner placement.",
    },
    {
      name: "config",
      type: "SiteFlavorConfig",
      default: "ambient flavor",
      description: "Injected flavor config; defaults to the build-time flavor.",
    },
    {
      name: "markHeightRem",
      type: "number",
      default: "1.5",
      description: "Mark height in rem. The width follows from the supporter's declared aspect ratio.",
    },
  ],
  whenToUse: [
    "Chrome that credits whoever pays the bills: the site footer, and the homepage hero on routes that suppress the footer.",
  ],
  whenNotToUse: [
    "Source or citation attribution — that is ExternalSourcePill.",
    "A paid ad placement. That needs `rel=\"sponsored\"` and different wording; this component deliberately carries neither.",
    "Any surface where the credit would read as editorial endorsement of the page's content.",
  ],
  notes: [
    'The wording is load-bearing: "Supported by" claims only that the named company funds the publication. "Sponsored by", "Backed by" and "A project by" each assert a commercial, equity or ownership relationship, so none of them are interchangeable here.',
    'The prefix and the mark are separate accessible strings: the mark carries the supporter\'s name as its `aria-label`, so screen readers hear "Supported by, Mindstate Design Labs".',
    "Adding a supporter to a flavor means adding a monochrome white-on-transparent asset under `public/supporters/` and its intrinsic aspect ratio to the config.",
  ],
};
