import {
  PublicTableOfContents,
  type PublicTableOfContentsItem,
} from "@/components/common/PublicTableOfContents";

import type { StoryDef } from "../registry/types";

const sampleItems: PublicTableOfContentsItem[] = [
  { id: "summary", label: "Summary", icon: "lucide:file-text" },
  { id: "dosage", label: "Dosage", icon: "lucide:scale" },
  { id: "duration", label: "Duration", icon: "lucide:clock" },
  { id: "effects", label: "Subjective effects", icon: "lucide:sparkles" },
  { id: "interactions", label: "Interactions", icon: "lucide:zap" },
];

const tonedItems: PublicTableOfContentsItem[] = [
  { id: "overview", label: "Overview", icon: "lucide:file-text" },
  { id: "harm-reduction", label: "Harm reduction", icon: "lucide:shield", tone: "accent" },
  { id: "dangerous-interactions", label: "Dangerous interactions", icon: "lucide:triangle-alert", tone: "warning" },
];

export const publicTableOfContentsStory: StoryDef = {
  id: "public-table-of-contents",
  name: "PublicTableOfContents",
  tier: "common",
  status: "stable",
  summary:
    "Anchor-link contents rail for public substance articles. Renders a frosted panel inline under the hero or a bare sticky rail in the page gutter, with smooth in-page scroll on click.",
  source: "src/components/common/PublicTableOfContents.tsx",
  importLine:
    'import { PublicTableOfContents, type PublicTableOfContentsItem } from "@/components/common/PublicTableOfContents";',
  exports: ["PublicTableOfContents", "useActiveSection"],
  examples: [
    {
      label: "Panel (default)",
      note: "Frosted bordered card used inline under the article hero.",
      background: "subtle",
      render: () => <PublicTableOfContents items={sampleItems} />,
    },
    {
      label: "Bare",
      note: "Panel chrome dropped for the wide-screen sticky gutter rail.",
      background: "card",
      render: () => <PublicTableOfContents items={sampleItems} variant="bare" />,
    },
    {
      label: "Item tones",
      note: "Default, accent, and warning tones for highlighting harm-reduction and danger sections.",
      background: "subtle",
      render: () => <PublicTableOfContents items={tonedItems} />,
    },
    {
      label: "Custom title",
      note: "Heading text is overridable via the title prop.",
      background: "subtle",
      render: () => (
        <PublicTableOfContents
          title="On this page"
          items={[
            { id: "history", label: "History", icon: "lucide:scroll" },
            { id: "chemistry", label: "Chemistry", icon: "lucide:flask-conical" },
            { id: "pharmacology", label: "Pharmacology", icon: "lucide:activity" },
          ]}
        />
      ),
    },
    {
      label: "Empty (renders nothing)",
      note: "With no items the component returns null — there is no empty shell to show.",
      background: "plain",
      render: () => (
        <div className="text-sm text-[var(--theme-text-muted)]">
          <PublicTableOfContents items={[]} />
          items={"[]"} → renders nothing.
        </div>
      ),
    },
  ],
  props: [
    {
      name: "items",
      type: "PublicTableOfContentsItem[]",
      description:
        "Sections to link. Each has id (target element id / hash), label, icon (IconName), and optional tone.",
    },
    {
      name: "tone",
      type: '"default" | "accent" | "warning"',
      default: '"default"',
      description: "Per-item emphasis. accent uses the badge surface; warning uses the danger token set.",
    },
    { name: "title", type: "string", default: '"Contents"', description: "Heading shown above the list." },
    {
      name: "variant",
      type: '"panel" | "bare"',
      default: '"panel"',
      description: "panel is the frosted inline card; bare is the quiet gutter rail without panel chrome.",
    },
    { name: "className", type: "string", description: "Extra classes merged onto the outer wrapper." },
  ],
  whenToUse: [
    "In-page anchor navigation for long public substance articles.",
    "The sticky wide-screen contents rail (bare) and the inline hero contents card (panel).",
  ],
  whenNotToUse: [
    "Cross-page navigation — these are same-page #hash links, not router links.",
    "Dev/editor surfaces — this is tuned for public article chrome.",
  ],
  notes: [
    "Click is intercepted only for plain left-clicks; modifier/middle clicks fall back to the native #hash anchor.",
    "Smooth scroll respects prefers-reduced-motion via scrollIntoViewRespectingMotion.",
    "Memoised; returns null when items is empty.",
  ],
};
