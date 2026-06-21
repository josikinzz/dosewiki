import { Button } from "@/components/ui/button";
import {
  ReferenceCitationList,
  ReferenceListItem,
  scrollToReferenceUse,
} from "@/components/common/ReferenceList";
import type { ProjectedCitation } from "@/lib/citationProjection";

import type { StoryDef } from "../registry/types";

const CITATIONS: ProjectedCitation[] = [
  {
    role: "reference",
    label:
      "Nichols, D. E. (2016). Psychedelics. Pharmacological Reviews, 68(2), 264–355. https://doi.org/10.1124/pr.115.011478",
    url: "https://doi.org/10.1124/pr.115.011478",
    favicon: null,
    number: 1,
    anchorId: "ref-1",
    referenceId: "r1",
  },
  {
    role: "reference",
    label:
      "Shulgin, A., & Shulgin, A. (1991). PIHKAL: A Chemical Love Story. Transform Press.",
    url: "",
    favicon: null,
    number: 2,
    anchorId: "ref-2",
    referenceId: "r2",
  },
  {
    role: "reference",
    label:
      "TripSit Factsheet — review of subjective effects and harm-reduction guidance. https://tripsit.me",
    url: "https://tripsit.me",
    favicon: null,
    number: 3,
    anchorId: "ref-3",
    referenceId: "r3",
  },
];

export const referenceListStory: StoryDef = {
  id: "reference-list",
  name: "Reference list",
  tier: "common",
  status: "stable",
  summary:
    "The Wikipedia-style numbered reference list shared by substance and effect articles: plum number chip, full citation text, accent-colored trailing URL, and optional per-use backlinks.",
  source: "src/components/common/ReferenceList.tsx",
  importLine:
    'import { ReferenceCitationList, ReferenceListItem, scrollToReferenceUse } from "@/components/common/ReferenceList";',
  exports: ["ReferenceCitationList", "ReferenceListItem", "scrollToReferenceUse"],
  examples: [
    {
      label: "Reference list",
      note: "ReferenceCitationList renders the full <ol>. Linked rows underline; the trailing URL is accent-colored.",
      background: "card",
      full: true,
      render: () => (
        <div className="w-full max-w-2xl">
          <ReferenceCitationList citations={CITATIONS} />
        </div>
      ),
    },
    {
      label: "Single item",
      note: "ReferenceListItem renders one <li>; wrap it in your own <ol>/<ul>.",
      background: "card",
      full: true,
      render: () => (
        <ol className="w-full max-w-2xl list-none space-y-3 p-0">
          <ReferenceListItem citation={CITATIONS[0]} />
        </ol>
      ),
    },
    {
      label: "With per-use backlinks",
      note: "Pass referenceBacklinks keyed by referenceId to show the up-arrow jump-to-use chips after a citation.",
      background: "card",
      full: true,
      render: () => (
        <div className="w-full max-w-2xl">
          <ReferenceCitationList
            citations={[CITATIONS[0]]}
            referenceBacklinks={{
              r1: [
                { href: "#use-a", label: "a", occurrenceIndex: 0, referenceId: "r1" },
                { href: "#use-b", label: "b", occurrenceIndex: 1, referenceId: "r1" },
              ],
            }}
          />
        </div>
      ),
    },
    {
      label: "scrollToReferenceUse",
      note: "Imperative helper used by the backlink chips: scrolls the page to the Nth in-article use of a reference (expanding collapsed sections first). No-op here without article markers.",
      render: () => (
        <Button variant="secondary" onClick={() => scrollToReferenceUse("r1", 0, "#sources")}>
          Jump to first use of [1]
        </Button>
      ),
    },
  ],
  props: [
    {
      name: "ReferenceCitationList: citations",
      type: "readonly ProjectedCitation[]",
      description: "Projected citations (role, label, url, number, anchorId, referenceId).",
    },
    {
      name: "ReferenceCitationList: referenceBacklinks",
      type: "Record<string, CitationBacklink[]>",
      description: "Optional per-reference jump-to-use links, keyed by referenceId.",
    },
    {
      name: "ReferenceListItem: citation",
      type: "ProjectedCitation",
      description: "A single projected citation rendered as an <li>.",
    },
    {
      name: "scrollToReferenceUse()",
      type: "(referenceId, occurrenceIndex, href) => void",
      description: "Scrolls to the matching in-article citation marker; expands collapsed article controls first.",
    },
  ],
  whenToUse: [
    "The bottom-of-article numbered sources list on substance and effect pages.",
    "Anywhere you render projected citations and want consistent numbering + backlinks.",
  ],
  whenNotToUse: [
    "Inline citation markers within prose — those are rendered by the article body, not here.",
    "Compact source chips — use CitationListItem instead.",
  ],
  notes: [
    "Client component ('use client'). scrollToReferenceUse touches document/window, so only call it from event handlers, never during render.",
  ],
};
