import { ExternalSourcePill } from "@/components/common/ExternalSourcePill";

import type { StoryDef } from "../registry/types";

export const externalSourcePillStory: StoryDef = {
  id: "external-source-pill",
  name: "ExternalSourcePill",
  tier: "common",
  status: "stable",
  summary:
    "Attribution pill that credits an external source with an optional favicon, prefix/suffix copy, and an external-link affordance. Links the whole pill via an overlay anchor.",
  source: "src/components/common/ExternalSourcePill.tsx",
  importLine:
    'import { ExternalSourcePill } from "@/components/common/ExternalSourcePill";',
  exports: ["ExternalSourcePill"],
  intents: [
    { family: "pills", need: "Attribution to an external source, with its favicon", policy: "#name-chip-policy" },
  ],
  examples: [
    {
      label: "Inline (default)",
      note: 'Default variant and "Powered by" prefix; a rounded pill sized to its content.',
      render: () => (
        <ExternalSourcePill
          label="PsychonautWiki"
          href="https://psychonautwiki.org/"
        />
      ),
    },
    {
      label: "With favicon",
      note: "Pass faviconSrc to show a 20px source mark before the label.",
      render: () => (
        <ExternalSourcePill
          label="Wikipedia"
          href="https://en.wikipedia.org/"
          faviconSrc="https://en.wikipedia.org/static/favicon/wikipedia.ico"
          faviconAlt="Wikipedia"
        />
      ),
    },
    {
      label: "Custom prefix & suffix",
      note: "Override prefix copy and append a suffix for context.",
      render: () => (
        <ExternalSourcePill
          prefix="Data from"
          label="TripSit"
          suffix="factsheet"
          href="https://tripsit.me/"
        />
      ),
    },
    {
      label: "Static (no href)",
      note: "Without href the overlay anchor is omitted, but the external-link glyph still renders.",
      render: () => <ExternalSourcePill prefix="Source" label="Erowid" />,
    },
    {
      label: "Credit variant",
      note: "Stacks the prefix above the source on narrow viewports; collapses to an inline pill at sm and up.",
      background: "card",
      full: true,
      render: () => (
        <div className="max-w-sm">
          <ExternalSourcePill
            variant="credit"
            prefix="Effect descriptions adapted from"
            label="PsychonautWiki"
            suffix="(CC BY-SA)"
            href="https://psychonautwiki.org/"
          />
        </div>
      ),
    },
    {
      label: "On a card surface",
      note: "How the inline pill reads against a content card.",
      background: "card",
      render: () => (
        <ExternalSourcePill
          label="DrugBank"
          href="https://go.drugbank.com/"
          faviconSrc="https://go.drugbank.com/favicon.ico"
          faviconAlt="DrugBank"
        />
      ),
    },
  ],
  props: [
    {
      name: "label",
      type: "ReactNode",
      description: "Required source name shown as the emphasised text.",
    },
    {
      name: "prefix",
      type: "ReactNode",
      default: '"Powered by"',
      description: "Faint lead-in copy before the label.",
    },
    {
      name: "suffix",
      type: "ReactNode",
      description: "Optional faint trailing copy after the label.",
    },
    {
      name: "href",
      type: "string",
      description:
        "When set, an absolute-positioned overlay anchor makes the whole pill clickable.",
    },
    {
      name: "variant",
      type: '"inline" | "credit"',
      default: '"inline"',
      description:
        'Layout treatment. "credit" wraps responsively for longer attribution copy.',
    },
    {
      name: "faviconSrc",
      type: "string",
      description: "Optional 20px source mark rendered via AppImage before the label.",
    },
    {
      name: "faviconAlt",
      type: "string",
      default: '""',
      description: "Alt text for the favicon image.",
    },
    {
      name: "ariaLabel",
      type: "string",
      description:
        "Accessible label for the overlay link; falls back to `${prefix} ${label}` when both are strings.",
    },
    {
      name: "target",
      type: "string",
      default: '"_blank"',
      description: "Anchor target.",
    },
    {
      name: "rel",
      type: "string",
      default: '"noopener noreferrer"',
      description: "Anchor rel attribute.",
    },
    {
      name: "className",
      type: "string",
      description: "Extra classes merged onto the outer pill via cn.",
    },
  ],
  whenToUse: [
    "Crediting an external data source or provider near content it backs.",
    "Linking out to a source homepage or factsheet as a compact attribution chip.",
  ],
  whenNotToUse: [
    "Primary navigation or actions — this is attribution chrome, use Button or a link.",
    "Inline prose citations — use the citation/reference components instead.",
  ],
  notes: [
    'Defaults target="_blank" with rel="noopener noreferrer"; the overlay anchor covers the full pill and shows a focus-visible ring.',
    "The external-link glyph renders even without an href, signalling an outbound source.",
    'The "credit" variant is responsive: it stacks on small screens and becomes an inline pill at the sm breakpoint.',
  ],
};
