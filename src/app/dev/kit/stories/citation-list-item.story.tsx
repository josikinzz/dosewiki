import { CitationListItem } from "@/components/common/CitationListItem";

import type { StoryDef } from "../registry/types";

export const citationListItemStory: StoryDef = {
  id: "citation-list-item",
  name: "CitationListItem",
  tier: "common",
  status: "stable",
  summary:
    "A single citation/reference chip rendered as an <li> — numbered badge or favicon, label, and an optional external-link affordance.",
  source: "src/components/common/CitationListItem.tsx",
  importLine: 'import { CitationListItem } from "@/components/common/CitationListItem";',
  exports: ["CitationListItem"],
  examples: [
    {
      label: "Numbered reference",
      note: "Default form: a numbered badge (1.125rem reference token) plus a truncating label.",
      background: "card",
      render: () => (
        <ul className="m-0 flex list-none flex-wrap gap-2 p-0">
          <CitationListItem number={1} label="PsychonautWiki — 2C-B" />
          <CitationListItem number={2} label="Erowid Experience Vaults" />
        </ul>
      ),
    },
    {
      label: "Linked with favicon",
      note: "A favicon replaces the number badge; with href + showHref a small external-link glyph trails the label.",
      background: "card",
      render: () => (
        <ul className="m-0 flex list-none flex-wrap gap-2 p-0">
          <CitationListItem
            number={3}
            label="en.wikipedia.org"
            href="https://en.wikipedia.org/wiki/2C-B"
            faviconSrc="https://en.wikipedia.org/static/favicon/wikipedia.ico"
            showHref
          />
          <CitationListItem
            number={4}
            label="TripSit factsheet"
            href="https://tripsit.me"
            showHref
          />
        </ul>
      ),
    },
    {
      label: "Truncated vs. wrapped",
      note: "truncateLabel (default true) caps width and ellipsises; set false to let long titles wrap.",
      background: "card",
      full: true,
      render: () => (
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          <CitationListItem
            number={5}
            label="A very long citation title that demonstrates the default single-line truncation behaviour"
          />
          <CitationListItem
            number={6}
            label="A very long citation title that demonstrates the wrapped, multi-line behaviour when truncateLabel is disabled"
            truncateLabel={false}
          />
        </ul>
      ),
    },
    {
      label: "Reference list",
      note: "Several items flow inline as wrapping chips — the typical footnote/reference cluster.",
      background: "subtle",
      full: true,
      render: () => (
        <ul className="m-0 flex list-none flex-wrap gap-2 p-0">
          {[
            "PubChem",
            "DrugBank",
            "Isomer Design",
            "PiHKAL #20",
            "Shulgin Index",
          ].map((label, index) => (
            <CitationListItem key={label} number={index + 1} label={label} />
          ))}
        </ul>
      ),
    },
  ],
  props: [
    { name: "number", type: "number", description: "Reference number shown in the badge when no favicon is supplied." },
    { name: "label", type: "ReactNode", description: "The citation text (or any node) shown beside the badge/favicon." },
    { name: "href", type: "string", description: "When set, the chip becomes an external anchor (target=_blank, noopener)." },
    {
      name: "faviconSrc",
      type: "string | null",
      description: "16px favicon that replaces the number badge; falsy falls back to the numbered badge.",
    },
    {
      name: "showHref",
      type: "boolean",
      default: "false",
      description: "With an href present, trails the label with a small external-link glyph.",
    },
    {
      name: "truncateLabel",
      type: "boolean",
      default: "true",
      description: "Single-line truncation with a max width; false lets the label wrap.",
    },
    { name: "className", type: "string", description: "Extra classes merged onto the <li> via cn." },
  ],
  whenToUse: [
    "Rendering footnote/reference chips in an article's citation cluster.",
    "Showing a linked source with its favicon as a compact pill.",
  ],
  whenNotToUse: [
    "Full citation cards with metadata blocks — use a ContentCard recipe instead.",
    "Standalone navigation links outside a reference list — reach for a plain anchor or PublicNameChip.",
  ],
  notes: [
    "Renders an <li>, so mount it inside a <ul>/<ol> for valid markup.",
    "Built on PublicNameChip; the linked variant uses the chip's interactive hit-target styling.",
  ],
};
