import { Bullet } from "@/components/common/Bullet";

import type { StoryDef } from "../registry/types";

export const bulletStory: StoryDef = {
  id: "bullet",
  name: "Bullet",
  tier: "common",
  status: "stable",
  summary:
    "Tiny decorative dot used as a leading marker in lists, key/value rows, and metadata strips. Purely visual and aria-hidden.",
  source: "src/components/common/Bullet.tsx",
  importLine: 'import { Bullet } from "@/components/common/Bullet";',
  exports: ["Bullet"],
  intents: [
    { family: "dividers", need: "A quiet separator between inline metadata items", policy: "#divider-policy" },
  ],
  examples: [
    {
      label: "Colors",
      note: "Fuchsia (accent) is the default; rose is the alternate tone.",
      render: () => (
        <div className="flex items-center gap-6">
          <span className="flex items-center gap-2">
            <Bullet color="fuchsia" />
            <span className="text-sm text-[var(--theme-text-secondary)]">fuchsia (default)</span>
          </span>
          <span className="flex items-center gap-2">
            <Bullet color="rose" />
            <span className="text-sm text-[var(--theme-text-secondary)]">rose</span>
          </span>
        </div>
      ),
    },
    {
      label: "As a list marker",
      note: "Pairs with flex rows to build custom unordered lists without browser bullets.",
      background: "card",
      render: () => (
        <ul className="flex flex-col gap-2">
          {["Onset and come-up", "Peak effects", "Comedown and after-effects"].map((item) => (
            <li key={item} className="flex items-center gap-2">
              <Bullet />
              <span className="text-sm text-[var(--theme-text-primary)]">{item}</span>
            </li>
          ))}
        </ul>
      ),
    },
    {
      label: "Inline metadata separator",
      note: "Sits between metadata items as a visual divider.",
      render: () => (
        <div className="flex items-center gap-2 text-sm text-[var(--theme-text-secondary)]">
          <span>Stimulant</span>
          <Bullet color="rose" />
          <span>Phenethylamine</span>
          <Bullet color="rose" />
          <span>Schedule I</span>
        </div>
      ),
    },
    {
      label: "Custom sizing via className",
      note: "className merges through cn, so size/spacing overrides compose cleanly.",
      render: () => (
        <div className="flex items-center gap-6">
          <Bullet className="h-1 w-1" />
          <Bullet />
          <Bullet className="h-2.5 w-2.5" />
        </div>
      ),
    },
  ],
  props: [
    {
      name: "color",
      type: '"fuchsia" | "rose"',
      default: '"fuchsia"',
      description: "Dot tone. fuchsia maps to the dose accent token; rose to bg-rose-400.",
    },
    {
      name: "className",
      type: "string",
      description: "Extra classes merged via cn — override size, spacing, or color.",
    },
  ],
  whenToUse: [
    "Leading markers for custom flex/grid lists where native list bullets don't fit.",
    "Compact visual separators between inline metadata items.",
  ],
  whenNotToUse: [
    "Status or severity meaning — use Badge, which carries a label.",
    "Interactive targets — Bullet is aria-hidden and has no semantics.",
  ],
  notes: [
    "Renders a 1.5×1.5 rounded span with flex-shrink-0 and aria-hidden=\"true\", so it never collapses or reaches assistive tech.",
    "Decorative only: keep the adjacent text as the accessible content.",
  ],
};
