import { SiteLicenceNotice } from "@/components/common/SiteLicenceNotice";
import { SiteWordmark } from "@/components/common/SiteWordmark";
import { SiteVersionBadge } from "@/components/common/SiteVersionBadge";
import { SITE_FLAVOR_CONFIGS } from "@/config/siteFlavor";

import type { StoryDef } from "../registry/types";

export const siteBrandStory: StoryDef = {
  id: "site-brand",
  name: "SiteWordmark, SiteVersionBadge & SiteLicenceNotice",
  tier: "common",
  status: "stable",
  summary:
    "The brand strings that differ per publication: the two-run wordmark, the pre-release version pill, and the footer's reuse-rights sentence. All read the build-time site flavor and all accept an injected config.",
  source: "src/components/common/SiteWordmark.tsx",
  importLine:
    'import { SiteWordmark } from "@/components/common/SiteWordmark";',
  exports: ["SiteWordmark", "SiteVersionBadge", "SiteLicenceNotice"],
  examples: [
    {
      label: "Wordmark per flavor",
      note: "The accent run is a separate span so the heading-accent token can colour just the suffix. Never join lead + accent into one string.",
      render: () => (
        <div className="flex flex-col gap-3 font-display text-2xl font-bold tracking-tight">
          <span className="theme-text-primary">
            <SiteWordmark config={SITE_FLAVOR_CONFIGS.dosewiki} />
          </span>
          <span className="theme-text-primary">
            <SiteWordmark config={SITE_FLAVOR_CONFIGS.effectindex} />
          </span>
        </div>
      ),
    },
    {
      label: "Custom accent class",
      note: "The footer dims the accent run on hover, so it passes its own class rather than the default token.",
      background: "card",
      render: () => (
        <span className="theme-text-primary font-display text-base font-semibold tracking-tight">
          <SiteWordmark
            accentClassName="theme-accent-heading transition-opacity hover:opacity-85"
            config={SITE_FLAVOR_CONFIGS.dosewiki}
          />
        </span>
      ),
    },
    {
      label: "Version badge variants",
      note: "Hero shows the full version; header shows the stage only and is aria-hidden so it never leaks into the brand link's accessible name. A flavor with `versionBadge: null` (Effect Index) renders nothing.",
      render: () => (
        <div className="flex items-center gap-4">
          <SiteVersionBadge variant="hero" config={SITE_FLAVOR_CONFIGS.dosewiki} />
          <SiteVersionBadge variant="header" config={SITE_FLAVOR_CONFIGS.dosewiki} />
        </div>
      ),
    },
    {
      label: "Licence notice per flavor",
      note: "This is a legal statement, not decoration: dose.wiki is CC0 and links in-app, Effect Index is CC BY-NC-SA and links out to the deed.",
      render: () => (
        <div className="flex flex-col gap-2">
          <SiteLicenceNotice config={SITE_FLAVOR_CONFIGS.dosewiki} />
          <SiteLicenceNotice config={SITE_FLAVOR_CONFIGS.effectindex} />
        </div>
      ),
    },
  ],
  props: [
    {
      name: "accentClassName",
      type: "string",
      default: '"theme-accent-heading"',
      description: "SiteWordmark only — classes for the accented run.",
    },
    {
      name: "className",
      type: "string",
      default: '"theme-text-faint text-xs leading-5"',
      description: "SiteLicenceNotice only — classes for the paragraph.",
    },
    {
      name: "config",
      type: "SiteFlavorConfig",
      default: "ambient flavor",
      description: "Injected flavor config; defaults to the build-time flavor.",
    },
    {
      name: "variant",
      type: '"hero" | "header"',
      description: "SiteVersionBadge only — full version pill vs. stage-only micro-pill.",
    },
  ],
  whenToUse: [
    "Any chrome surface that spells the site's name: header, footer, homepage hero, status pages.",
    "The footer's reuse-rights line, which must follow the publication's actual licence.",
  ],
  whenNotToUse: [
    "Page titles and metadata — those read the flavor config directly, not a component.",
    "Anywhere you need the plain display name as a string; use the flavor config's `name`.",
  ],
  notes: [
    "SiteWordmark renders a fragment, not an element: wrap it in the span that carries the type styles.",
    "Passing `config` is how tests reach the other flavor without touching process.env.",
  ],
};
