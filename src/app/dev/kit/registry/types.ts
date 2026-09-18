import type { ReactNode } from "react";

/**
 * The UI Kit catalog contract.
 *
 * Every shared component documented in /dev/kit ships exactly one StoryDef.
 * The completeness test (registry/completeness.test.ts) reads the `exports`
 * field across all stories and fails the build if a symbol exported from the
 * shared barrels (ui / common / layout) has no catalog entry. That is what
 * keeps the kit from drifting: you cannot add a primitive without showing it.
 */

export type KitTier = "primitive" | "common" | "layout";

/**
 * stable  - use freely in new code.
 * legacy  - still rendered for reference, but do not reach for it in new code.
 * wip     - shared but still stabilising; check with the owner first.
 */
export type StoryStatus = "stable" | "legacy" | "wip";

/**
 * The families a builder starts from. The catalog's "Which one?" guide groups
 * intents by family, so look-alikes (chip vs badge vs pill) sit side by side
 * with the policy that separates them.
 */
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
  /** The need, phrased the way a builder thinks: "a chip carrying an entity name". */
  need: string;
  /** Index into `examples` to render beside the entry; defaults to the first. */
  example?: number;
  /** Anchor in docs/design/ui-kit.md that justifies the recommendation, e.g. "#name-chip-policy". */
  policy?: string;
}

export interface StoryExample {
  /** Short label for the variant/state being shown. */
  label: string;
  /** Optional one-line caption under the label. */
  note?: string;
  /** Stage treatment behind the example. */
  background?: "subtle" | "card" | "plain";
  /** Let the example span the full stage width (tables, headers, rows). */
  full?: boolean;
  /** Lazy render so examples stay client-only and tree-shakeable. */
  render: () => ReactNode;
}

export interface PropDoc {
  name: string;
  type: string;
  default?: string;
  description: string;
}

export interface StoryDef {
  /** Stable, unique, kebab-case id used for nav anchors. */
  id: string;
  /** Display name, e.g. "Button". */
  name: string;
  tier: KitTier;
  status?: StoryStatus;
  /** One-line summary of what it is and when to reach for it. */
  summary: string;
  /** Repo-relative source path, shown for quick navigation. */
  source: string;
  /** Copy-paste import line. */
  importLine: string;
  /**
   * Exported symbols this story documents. Drives the completeness test, so
   * list every reusable export you intend to cover here (components only;
   * pure type exports are allowlisted separately in the test).
   */
  exports: string[];
  examples: StoryExample[];
  props?: PropDoc[];
  whenToUse?: string[];
  whenNotToUse?: string[];
  notes?: string[];
  /** Builder intents this component answers; drives the catalog's "Which one?" guide. */
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
];

export const STATUS_META: Record<StoryStatus, { label: string; tone: string }> = {
  stable: { label: "Stable", tone: "var(--theme-success-text)" },
  legacy: { label: "Legacy", tone: "var(--theme-warning-text)" },
  wip: { label: "WIP", tone: "var(--theme-text-muted)" },
};
