import { SectionCard } from "@/components/common/SectionCard";

import type { StoryDef } from "../registry/types";

function SectionBody({ title, body }: { title: string; body: string }) {
  return (
    <div className="flex flex-col gap-2">
      <h2 className="text-lg font-semibold text-[var(--theme-text-primary)]">{title}</h2>
      <p className="text-sm leading-relaxed text-[var(--theme-text-secondary)]">{body}</p>
    </div>
  );
}

export const sectionCardStory: StoryDef = {
  id: "section-card",
  name: "SectionCard",
  tier: "common",
  status: "stable",
  summary:
    "The standard public-article section wrapper: a large-padding interactive content card rendered as a <section>, with a staggered scroll-in entrance animation.",
  source: "src/components/common/SectionCard.tsx",
  importLine: 'import { SectionCard } from "@/components/common/SectionCard";',
  exports: ["SectionCard"],
  intents: [
    { family: "cards", need: "A titled content block inside an article or index page" },
  ],
  examples: [
    {
      label: "Default section",
      note: "Wraps article content in the standard lg-padded, xl-radius card.",
      background: "plain",
      full: true,
      render: () => (
        <SectionCard className="w-full">
          <SectionBody
            title="Effects"
            body="SectionCard is the canonical container for the stacked content blocks on a public substance article. It presets padding, radius, and the entrance animation so sections stay visually consistent."
          />
        </SectionCard>
      ),
    },
    {
      label: "With id anchor",
      note: "The id lands on the inner <section>, so it can be a scroll/deep-link target.",
      background: "plain",
      full: true,
      render: () => (
        <SectionCard id="dosage" className="w-full">
          <SectionBody
            title="Dosage"
            body="Passing id applies it to the inner section element (id=dosage), which the article table of contents links to. The card chrome is unchanged."
          />
        </SectionCard>
      ),
    },
    {
      label: "Staggered delay",
      note: "delay sets --theme-section-card-delay (seconds) to offset each card's entrance.",
      background: "plain",
      full: true,
      render: () => (
        <div className="flex w-full flex-col gap-4">
          {[
            { title: "Pharmacology", delay: 0 },
            { title: "Subjective effects", delay: 0.1 },
            { title: "Interactions", delay: 0.2 },
          ].map((s) => (
            <SectionCard key={s.title} delay={s.delay} className="w-full">
              <SectionBody
                title={s.title}
                body={`delay=${s.delay}s — sequential sections fade in slightly after one another on scroll.`}
              />
            </SectionCard>
          ))}
        </div>
      ),
    },
  ],
  props: [
    {
      name: "children",
      type: "ReactNode",
      description: "Section content rendered inside the card and the inner <section> element.",
    },
    {
      name: "delay",
      type: "number",
      default: "0",
      description: "Entrance-animation delay in seconds. When > 0, sets the --theme-section-card-delay CSS variable.",
    },
    {
      name: "id",
      type: "string",
      description: "Applied to the inner <section>, used as a table-of-contents anchor / scroll target.",
    },
    {
      name: "className",
      type: "string",
      default: '""',
      description: "Extra classes merged onto the card alongside the theme-section-card-enter animation class.",
    },
  ],
  whenToUse: [
    "Top-level content sections on a public substance or content article.",
    "Any stacked block that needs the consistent section chrome plus the scroll-in entrance.",
  ],
  whenNotToUse: [
    "Inner/nested panels — use NestedContentCard from the surface recipes instead.",
    "Clickable navigation cards — use InteractiveContentCard directly; SectionCard is a layout container, not an action.",
    "Dev editor panels — those use dev-owned editor primitives.",
  ],
  notes: [
    "Built on InteractiveContentCard (padding=\"lg\", radius=\"xl\") and rendered via asChild onto a <section>.",
    "The entrance is driven by the theme-section-card-enter class; delay only offsets timing, it does not change the look.",
  ],
};
