import { SmartLink } from "@/components/common/SmartLink";
import { proseLinkClassName } from "@/components/common/ProseLink";

import type { StoryDef } from "../registry/types";

export const smartLinkStory: StoryDef = {
  id: "smart-link",
  name: "Smart Link",
  tier: "common",
  status: "stable",
  summary:
    "Drop-in next/link replacement for high-cardinality public surfaces: prefetches the route on navigation intent (pointer enter / focus) instead of on viewport entry, and surfaces in-flight navigations — the clicked anchor dims with a progress cursor and the route chrome's NavigationProgress bar appears once a navigation outlives the 150ms feedback delay.",
  source: "src/components/common/SmartLink.tsx",
  importLine: 'import { SmartLink } from "@/components/common/SmartLink";',
  exports: ["SmartLink", "useNavigationPending"],
  examples: [
    {
      label: "Inline in prose",
      note: "Identical rendering to next/link — only the prefetch and pending behavior differ.",
      render: () => (
        <p className="theme-text-secondary max-w-prose text-sm leading-relaxed">
          Compare with{" "}
          <SmartLink href="/2c-b" className={proseLinkClassName}>
            the 2C-B article
          </SmartLink>{" "}
          before dosing.
        </p>
      ),
    },
    {
      label: "As a card link",
      note: "While a navigation is pending, the anchor gains data-nav-pending and dims via utilities-theme.css.",
      render: () => (
        <SmartLink
          href="/effects"
          className="theme-public-card theme-public-card-interactive block rounded-2xl border p-4 theme-focus-ring"
        >
          <span className="theme-accent-heading text-sm font-semibold">
            Visual effects index
          </span>
        </SmartLink>
      ),
    },
  ],
  props: [
    {
      name: "href / replace / scroll …",
      type: "Omit<ComponentProps<typeof Link>, 'prefetch'>",
      description:
        "Every next/link prop except prefetch, which SmartLink owns (viewport prefetch off, intent prefetch on).",
    },
  ],
  whenToUse: [
    "Public links in dense surfaces — index cards, article cross-references, report lists — where default viewport prefetching would speculatively fetch hundreds of routes.",
    "Anywhere that previously wrote <Link prefetch={false}>.",
  ],
  whenNotToUse: [
    "The handful of always-visible, high-value links (header nav, home tiles) — keep next/link and its default viewport prefetch.",
    "External URLs or in-page anchors — plain <a> is enough; SmartLink only intent-prefetches internal paths.",
  ],
};
