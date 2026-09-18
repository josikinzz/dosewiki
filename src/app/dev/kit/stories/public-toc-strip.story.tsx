import type { PublicTableOfContentsItem } from "@/components/common/PublicTableOfContents";
import { PublicTocStrip } from "@/components/common/PublicTocStrip";

import type { StoryDef } from "../registry/types";

const sampleItems: PublicTableOfContentsItem[] = [
  { id: "summary", label: "Summary", icon: "lucide:file-text" },
  { id: "dosage", label: "Dosage", icon: "lucide:scale" },
  { id: "duration", label: "Duration", icon: "lucide:clock" },
  { id: "effects", label: "Subjective effects", icon: "lucide:sparkles" },
  { id: "interactions", label: "Interactions", icon: "lucide:zap", tone: "warning" },
  { id: "pharmacology", label: "Pharmacology", icon: "lucide:activity" },
  { id: "legality", label: "Legality", icon: "lucide:gavel" },
];

export const publicTocStripStory: StoryDef = {
  id: "public-toc-strip",
  name: "PublicTocStrip",
  tier: "common",
  status: "stable",
  summary:
    "Mobile companion of PublicTableOfContents: a sticky, swipeable chip strip that pins under the site header below 1200px, scrollspy-highlights the current section, and centers the active chip as the reader scrolls.",
  source: "src/components/common/PublicTocStrip.tsx",
  importLine: 'import { PublicTocStrip } from "@/components/common/PublicTocStrip";',
  exports: ["PublicTocStrip"],
  examples: [
    {
      label: "Bar",
      note:
        "Swipeable chip row on the frosted bar surface, normally full-bleed and flush under the sticky site header. Edge fades appear only while chips remain hidden beyond that edge. (Sticky pinning, the full-bleed breakout, and scrollspy need a real article page — at catalog width above 1200px the bar hides itself, so this story pins it open in place.)",
      background: "subtle",
      render: () => (
        <div className="max-w-sm">
          <PublicTocStrip items={sampleItems} className="!static !mx-0 !mt-0 !block" />
        </div>
      ),
    },
  ],
  props: [
    {
      name: "items",
      type: "PublicTableOfContentsItem[]",
      description:
        "Sections to link — the same item shape as PublicTableOfContents (id, label, icon, optional tone).",
    },
    { name: "className", type: "string", description: "Extra classes merged onto the sticky nav wrapper." },
  ],
  whenToUse: [
    "The mobile/tablet (<1200px) table of contents on long-form public pages, paired with StickyTocLayout's gutter rail.",
    "Any page that renders it must add theme-toc-strip-scope to its layout root so anchor targets scroll clear of the header + strip.",
  ],
  whenNotToUse: [
    "Wide screens — at >=1200px it renders display:none; use the bare PublicTableOfContents gutter rail.",
    "Short pages with fewer than two sections — render nothing instead.",
  ],
  notes: [
    "Sticky offset comes from --public-toc-strip-top, defaulting to the site header height; the review workbench overrides it with its command-bar height.",
    "When scrollspy flips to a new section, the bar centers that chip with one native smooth scroll (instant under prefers-reduced-motion) — no per-frame scroll work. It stands down while a finger is on the strip.",
  ],
};
