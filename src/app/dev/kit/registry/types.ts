import type { ReactNode } from "react";

export type KitTier = "primitive" | "common" | "layout" | "editor";

export type StoryStatus = "stable" | "legacy" | "wip";

export type IntentFamily =
  | "chips"
  | "badges"
  | "pills"
  | "expand"
  | "dividers"
  | "cards"
  | "surfaces";

export interface StoryIntent {
  family: IntentFamily;
  need: string;
  example?: number;
  policy?: string;
}

export interface StoryExample {
  label: string;
  note?: string;
  background?: "subtle" | "card" | "plain";
  full?: boolean;
  render: () => ReactNode;
}

export interface PropDoc {
  name: string;
  type: string;
  default?: string;
  description: string;
}

export interface StoryDef {
  id: string;
  name: string;
  tier: KitTier;
  status?: StoryStatus;
  summary: string;
  source: string;
  importLine: string;
  exports: string[];
  examples: StoryExample[];
  props?: PropDoc[];
  whenToUse?: string[];
  whenNotToUse?: string[];
  notes?: string[];
  intents?: StoryIntent[];
}

export const KIT_TIERS: { id: KitTier; label: string; blurb: string }[] = [
  {
    id: "primitive",
    label: "Primitives",
    blurb: "Low-level Radix / shadcn building blocks. src/components/ui",
  },
  {
    id: "common",
    label: "Common",
    blurb: "Shared recipes built on the primitives. src/components/common",
  },
  {
    id: "layout",
    label: "Layout & chrome",
    blurb: "Public page shells and chrome. src/components/layout",
  },
  {
    id: "editor",
    label: "Editor kit",
    blurb: "The dev tool and in-page editor components. src/features/dev/components",
  },
];

export const STATUS_META: Record<StoryStatus, { label: string; tone: string }> = {
  stable: { label: "Stable", tone: "var(--theme-success-text)" },
  legacy: { label: "Legacy", tone: "var(--theme-warning-text)" },
  wip: { label: "WIP", tone: "var(--theme-text-muted)" },
};
