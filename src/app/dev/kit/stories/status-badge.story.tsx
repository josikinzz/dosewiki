import { StatusBadge } from "@/components/common/StatusBadge";

import type { StoryDef } from "../registry/types";

const TONES = [
  "red",
  "rose",
  "yellow",
  "orange",
  "blue",
  "green",
  "emerald",
  "gray",
  "white",
] as const;

export const statusBadgeStory: StoryDef = {
  id: "status-badge",
  name: "StatusBadge",
  tier: "common",
  status: "stable",
  summary:
    "Inline pill badge for status/severity labels in article sections (harm potential, toxicity, legality). Emits the theme-status-badge class and a data-badge-tone attribute.",
  source: "src/components/common/StatusBadge.tsx",
  importLine: 'import { StatusBadge } from "@/components/common/StatusBadge";',
  exports: ["StatusBadge"],
  intents: [
    { family: "badges", need: "Editorial or review status with a semantic tone", policy: "#name-chip-policy" },
  ],
  examples: [
    {
      label: "Tones",
      note: "Nine semantic tones, driven by the data-badge-tone attribute and theme tokens.",
      render: () => (
        <div className="flex flex-wrap items-center gap-2">
          {TONES.map((tone) => (
            <StatusBadge key={tone} tone={tone}>
              {tone}
            </StatusBadge>
          ))}
        </div>
      ),
    },
    {
      label: "With surface class",
      note: "Pass a semantic surface class (e.g. theme-semantic-danger-badge) through className for the full fill.",
      render: () => (
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge tone="emerald" className="theme-evidence-surface">
            Extremely Low
          </StatusBadge>
          <StatusBadge tone="yellow" className="theme-semantic-caution-badge">
            Moderate
          </StatusBadge>
          <StatusBadge tone="orange" className="theme-semantic-unsafe-badge">
            High
          </StatusBadge>
          <StatusBadge tone="rose" className="theme-semantic-danger-badge">
            Extremely High
          </StatusBadge>
        </div>
      ),
    },
    {
      label: "Compact override",
      note: "Override padding/size via className; the base layout classes still apply.",
      render: () => (
        <StatusBadge tone="gray" className="px-2 py-0.5 text-[10px]">
          Unknown
        </StatusBadge>
      ),
    },
  ],
  props: [
    {
      name: "tone",
      type: '"red" | "rose" | "yellow" | "orange" | "blue" | "green" | "emerald" | "gray" | "white"',
      description: "Semantic color, set via the data-badge-tone attribute and theme tokens.",
    },
    {
      name: "children",
      type: "ReactNode",
      description: "Badge label content.",
    },
    {
      name: "className",
      type: "string",
      description: "Extra classes (e.g. semantic surface fills, size overrides) merged via cn.",
    },
  ],
  whenToUse: [
    "Status/severity pills in article sections (risk level, carcinogenicity, legality).",
    "Any small inline label that needs one of the nine semantic tones.",
  ],
  whenNotToUse: [
    "Large emphasis labels — reach for a Badge primitive instead.",
    "Interactive triggers — this is a plain span with no button semantics.",
  ],
  notes: [
    "Color comes from the theme-status-badge CSS plus the data-badge-tone attribute; light/dark are handled by tokens.",
    "Pair with a semantic surface class via className when a solid fill is required.",
  ],
};
