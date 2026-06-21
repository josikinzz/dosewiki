import { StickyTocLayout } from "@/components/common/StickyTocLayout";

import type { StoryDef } from "../registry/types";

function MockToc() {
  return (
    <nav className="flex flex-col gap-1.5 text-xs text-[var(--theme-text-muted)]">
      <p className="mb-1 font-semibold uppercase tracking-wide text-[var(--theme-text-primary)]">
        On this page
      </p>
      {["Summary", "Dosage", "Duration", "Effects", "Interactions", "Sources"].map((item) => (
        <span key={item} className="hover:text-[var(--theme-text-primary)]">
          {item}
        </span>
      ))}
    </nav>
  );
}

function MockArticle() {
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold text-[var(--theme-text-primary)]">Example substance</h1>
      {["Summary", "Dosage", "Duration"].map((heading) => (
        <section key={heading} className="flex flex-col gap-2">
          <h2 className="text-lg font-semibold text-[var(--theme-text-primary)]">{heading}</h2>
          <p className="text-sm text-[var(--theme-text-muted)]">
            Placeholder article copy. Below 1200px this is a single centered column; at 1200px and up a
            sticky TOC floats in the left gutter while the article stays centered.
          </p>
        </section>
      ))}
    </div>
  );
}

export const stickyTocLayoutStory: StoryDef = {
  id: "sticky-toc-layout",
  name: "StickyTocLayout",
  tier: "common",
  status: "stable",
  summary:
    "The shared long-form article shell (substances, effects, trip reports). One centered column below 1200px; a centered article + sticky left-gutter table-of-contents pair at >=1200px.",
  source: "src/components/common/StickyTocLayout.tsx",
  importLine: 'import { StickyTocLayout } from "@/components/common/StickyTocLayout";',
  exports: ["StickyTocLayout"],
  examples: [
    {
      label: "Article with gutter TOC",
      note: "Pass the bare TOC as `toc` and the article as children. The gutter only appears at >=1200px — in this narrower catalog stage it renders as the single-column fallback.",
      background: "subtle",
      full: true,
      render: () => (
        <StickyTocLayout toc={<MockToc />}>
          <MockArticle />
        </StickyTocLayout>
      ),
    },
    {
      label: "Without a gutter (toc={null})",
      note: "Pass null for toc to render a plain centered column with no rail.",
      background: "subtle",
      full: true,
      render: () => (
        <StickyTocLayout toc={null} maxWidthClass="max-w-2xl">
          <MockArticle />
        </StickyTocLayout>
      ),
    },
  ],
  props: [
    { name: "toc", type: "ReactNode", description: "Bare-variant TOC for the wide-screen left gutter; pass null for no rail." },
    { name: "children", type: "ReactNode", description: "Article content (include the inline/panel TOC wrapped in min-[1200px]:hidden)." },
    { name: "maxWidthClass", type: "string", default: '"max-w-4xl"', description: "Width cap for the article column." },
    { name: "contentClassName", type: "string", description: "Spacing utility for the content column, e.g. gap-8." },
    { name: "className", type: "string", description: "Extra classes for the outer shell." },
  ],
  whenToUse: [
    "Long-form article pages that need a sticky table of contents on wide screens.",
    "Substance, effect, and trip-report detail pages — keep them visually consistent.",
  ],
  whenNotToUse: [
    "Index/grid pages — use IndexPanelLayout.",
    "Short pages with no TOC — a plain mx-auto max-w container is enough.",
  ],
  notes: [
    "The two-column pair only engages at >=1200px (the earliest a 896px article plus a gutter rail fit); below that it is an unchanged single centered column.",
  ],
};
