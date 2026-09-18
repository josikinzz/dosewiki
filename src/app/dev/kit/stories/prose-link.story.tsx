import { ProseLink, proseLinkClassName } from "@/components/common/ProseLink";

import type { StoryDef } from "../registry/types";

export const proseLinkStory: StoryDef = {
  id: "prose-link",
  name: "Prose Link",
  tier: "common",
  status: "stable",
  summary:
    "Inline link treatment for long-form prose — accent text, dotted underline that solidifies on hover, visible focus ring. Ships as a component and a className token.",
  source: "src/components/common/ProseLink.tsx",
  importLine: 'import { ProseLink, proseLinkClassName } from "@/components/common/ProseLink";',
  exports: ["ProseLink", "proseLinkClassName"],
  examples: [
    {
      label: "Inline in prose",
      note: "Reads as body text until you reach the link.",
      render: () => (
        <p className="theme-text-secondary max-w-prose text-sm leading-relaxed">
          The data flows through{" "}
          <ProseLink href="/docs/how" target="_top">
            the documented pipeline
          </ProseLink>{" "}
          before publication, with{" "}
          <ProseLink
            href="https://example.com"
            target="_blank"
            rel="noopener noreferrer"
          >
            external sources
          </ProseLink>{" "}
          cited per claim.
        </p>
      ),
    },
    {
      label: "Token on an existing anchor",
      note: "Use proseLinkClassName when the <a>/<Link> already exists.",
      render: () => (
        <a href="/docs/code" target="_top" className={proseLinkClassName}>
          Read the architecture overview
        </a>
      ),
    },
  ],
  props: [
    {
      name: "href / target / rel …",
      type: "AnchorHTMLAttributes",
      description: "All standard anchor attributes pass through to the underlying <a>.",
    },
    {
      name: "className",
      type: "string",
      description: "Merged after the prose treatment via cn — use --theme-* utilities only.",
    },
  ],
  whenToUse: [
    "Links embedded in paragraphs of long-form prose (docs, license, narrative pages).",
    "Styling an existing <a> or Next <Link> in prose — apply proseLinkClassName.",
  ],
  whenNotToUse: [
    "Links that should look like buttons — use Button with asChild.",
    "Navigation/menu links with their own chrome — use the relevant nav primitive.",
  ],
};
