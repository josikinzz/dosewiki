import {
  INDEX_PANEL_MASONRY_ITEM_CLASS_NAME,
  INDEX_PANEL_STACK_CLASS_NAME,
  IndexPanelGrid,
  IndexPanelMasonry,
} from "@/components/common/IndexPanelLayout";

import type { StoryDef } from "../registry/types";

function PanelCard({ title, lines = 2 }: { title: string; lines?: number }) {
  return (
    <div className="rounded-xl border border-[var(--theme-border-subtle)] bg-[var(--theme-surface-muted)] p-4">
      <p className="text-sm font-semibold text-[var(--theme-text-primary)]">{title}</p>
      {Array.from({ length: lines }).map((_, i) => (
        <p key={i} className="mt-1.5 text-xs text-[var(--theme-text-muted)]">
          Placeholder row for an index card body.
        </p>
      ))}
    </div>
  );
}

export const indexPanelLayoutStory: StoryDef = {
  id: "index-panel-layout",
  name: "Index panel layout",
  tier: "common",
  status: "stable",
  summary:
    "The column scaffolds behind the substances / effects / reports index panels — a balanced masonry (CSS columns) and a fixed responsive grid — plus the shared spacing constants.",
  source: "src/components/common/IndexPanelLayout.tsx",
  importLine:
    'import { IndexPanelGrid, IndexPanelMasonry } from "@/components/common/IndexPanelLayout";',
  exports: [
    "IndexPanelMasonry",
    "IndexPanelGrid",
    "INDEX_PANEL_STACK_CLASS_NAME",
    "INDEX_PANEL_MASONRY_ITEM_CLASS_NAME",
  ],
  examples: [
    {
      label: "IndexPanelGrid",
      note: "Fixed column count (collapses to a single column under 640px). Each cell is equal-width.",
      full: true,
      render: () => (
        <div className="w-full">
          <IndexPanelGrid columns={3}>
            <PanelCard title="Stimulants" />
            <PanelCard title="Depressants" lines={3} />
            <PanelCard title="Psychedelics" />
          </IndexPanelGrid>
        </div>
      ),
    },
    {
      label: "IndexPanelMasonry",
      note: "CSS-columns masonry for uneven card heights. Apply INDEX_PANEL_MASONRY_ITEM_CLASS_NAME to each child so it doesn't break across columns.",
      full: true,
      render: () => (
        <div className="w-full">
          <IndexPanelMasonry>
            <div className={INDEX_PANEL_MASONRY_ITEM_CLASS_NAME}>
              <PanelCard title="2C-B" lines={3} />
            </div>
            <div className={INDEX_PANEL_MASONRY_ITEM_CLASS_NAME}>
              <PanelCard title="LSD" lines={1} />
            </div>
            <div className={INDEX_PANEL_MASONRY_ITEM_CLASS_NAME}>
              <PanelCard title="Ketamine" lines={2} />
            </div>
          </IndexPanelMasonry>
        </div>
      ),
    },
    {
      label: "Stack class",
      note: "INDEX_PANEL_STACK_CLASS_NAME is the single-column stack used inside each grid column.",
      full: true,
      render: () => (
        <div className="w-full max-w-sm">
          <div className={INDEX_PANEL_STACK_CLASS_NAME}>
            <PanelCard title="Stacked A" />
            <PanelCard title="Stacked B" />
          </div>
        </div>
      ),
    },
  ],
  props: [
    { name: "IndexPanelGrid: columns", type: "number", description: "Number of equal columns at >=640px; clamps to >=1." },
    { name: "IndexPanelGrid: gate", type: "IndexPanelColumnGate | null", description: "From useResponsiveColumnCount().gate. While set, pre-paint CSS keeps the grid unpainted in viewport bands where `columns` is the server guess, so hydration never visibly reshuffles cards. Omit for a fixed count." },
    { name: "IndexPanelGrid / Masonry: children", type: "ReactNode", description: "The index cards to lay out." },
    { name: "IndexPanelGrid / Masonry: padded", type: "boolean", default: "true", description: "Page gutters. Pass false when nesting inside a column that already has its own padding — an article body — so the panels keep its left edge." },
    { name: "INDEX_PANEL_STACK_CLASS_NAME", type: "string", description: "Utility class for a single-column gap-matched stack." },
    { name: "INDEX_PANEL_MASONRY_ITEM_CLASS_NAME", type: "string", description: "Per-item class for masonry children (margin + break-inside-avoid)." },
  ],
  whenToUse: [
    "Laying out the substances / effects / reports index card panels.",
    "Any index-style page that needs masonry or a fixed responsive grid with the shared spacing.",
  ],
  whenNotToUse: [
    "General page content — use the layout/ public content primitives or a plain grid.",
    "Single cards or detail pages.",
  ],
  notes: [
    "Masonry uses CSS columns, so children flow top-to-bottom then wrap; always wrap each child in INDEX_PANEL_MASONRY_ITEM_CLASS_NAME.",
  ],
};
