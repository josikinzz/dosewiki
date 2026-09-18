import { MotionCard } from "@/components/ui/motion-card";

import type { StoryDef } from "../registry/types";

function Filler({ label, body }: { label: string; body: string }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-sm font-medium text-[var(--theme-text-primary)]">{label}</span>
      <span className="text-xs text-[var(--theme-text-muted)]">{body}</span>
    </div>
  );
}

export const motionCardStory: StoryDef = {
  id: "motion-card",
  name: "MotionCard",
  tier: "primitive",
  status: "stable",
  summary:
    "A Surface card that fades/slides in on mount via framer-motion, honouring reduced-motion. Reach for it when a card should animate into a list or grid.",
  source: "src/components/ui/motion-card.tsx",
  importLine: 'import { MotionCard } from "@/components/ui/motion-card";',
  exports: ["MotionCard"],
  examples: [
    {
      label: "Default",
      note: "Subtle public card surface; animates in on mount.",
      background: "plain",
      render: () => (
        <MotionCard className="w-full">
          <Filler label="MotionCard" body="Fades and slides up when it enters the viewport." />
        </MotionCard>
      ),
    },
    {
      label: "Accent",
      note: "Frosted accent panel treatment.",
      background: "plain",
      render: () => (
        <MotionCard variant="accent" className="w-full">
          <Filler label="Accent" body="Frosted panel border over a card surface." />
        </MotionCard>
      ),
    },
    {
      label: "Danger",
      note: "Safety-critical / destructive tone.",
      background: "plain",
      render: () => (
        <MotionCard variant="danger" className="w-full">
          <Filler label="Danger" body="Danger tokens for warnings and risky content." />
        </MotionCard>
      ),
    },
    {
      label: "Staggered list",
      note: "Increasing delay per card to cascade a list/grid in.",
      background: "plain",
      full: true,
      render: () => (
        <div className="grid w-full gap-3 sm:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <MotionCard key={i} delay={i * 0.08}>
              <Filler label={`Card ${i + 1}`} body={`delay={${(i * 0.08).toFixed(2)}}`} />
            </MotionCard>
          ))}
        </div>
      ),
    },
  ],
  props: [
    {
      name: "variant",
      type: '"default" | "accent" | "danger"',
      default: '"default"',
      description: "Surface tone — subtle public card, frosted accent panel, or danger callout.",
    },
    {
      name: "delay",
      type: "number",
      default: "0",
      description: "Seconds to delay the entrance animation; stagger across a list to cascade cards in.",
    },
    {
      name: "className",
      type: "string",
      default: '""',
      description: "Extra classes merged onto the card surface (use --theme-* tokens).",
    },
  ],
  whenToUse: [
    "Cards that should animate into a list, grid, or page section on mount.",
    "Staggered reveals — pass an increasing delay per item.",
  ],
  whenNotToUse: [
    "Static cards with no entrance animation — use ContentCard / Surface instead.",
    "Clickable cards needing hover/selected affordances — use InteractiveContentCard.",
  ],
  notes: [
    "Renders a <motion.section> and respects prefers-reduced-motion (no transform/opacity animation when reduced).",
  ],
};
