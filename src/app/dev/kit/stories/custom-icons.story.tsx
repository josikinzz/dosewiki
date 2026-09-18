import { customIcons } from "@/components/common/customIcons";

import type { StoryDef } from "../registry/types";

export const customIconsStory: StoryDef = {
  id: "custom-icons",
  name: "Custom icons",
  tier: "common",
  status: "stable",
  summary:
    "Registry of bespoke inline SVG glyphs (elf, benzene, rectal) that have no Lucide/Iconify equivalent. Looked up by key and tinted via currentColor.",
  source: "src/components/common/customIcons.tsx",
  importLine: 'import { customIcons } from "@/components/common/customIcons";',
  exports: ["customIcons"],
  examples: [
    {
      label: "All glyphs",
      note: "Each key maps to an SVG component that fills with currentColor.",
      render: () => (
        <div className="flex flex-wrap gap-6 text-[var(--theme-text-primary)]">
          {Object.entries(customIcons).map(([key, IconComponent]) => (
            <div key={key} className="flex flex-col items-center gap-2">
              <IconComponent className="h-8 w-8" aria-hidden />
              <span className="font-mono text-xs text-[var(--theme-text-muted)]">{key}</span>
            </div>
          ))}
        </div>
      ),
    },
    {
      label: "Sizing",
      note: "Sized with width/height utility classes like any inline SVG.",
      render: () => {
        const Benzene = customIcons.benzene;
        return (
          <div className="flex items-end gap-4 text-[var(--theme-text-primary)]">
            <Benzene className="h-4 w-4" aria-hidden />
            <Benzene className="h-6 w-6" aria-hidden />
            <Benzene className="h-8 w-8" aria-hidden />
            <Benzene className="h-12 w-12" aria-hidden />
          </div>
        );
      },
    },
    {
      label: "Colour via currentColor",
      note: "Inherits text color, so theme token classes recolour the glyph.",
      background: "card",
      render: () => {
        const Elf = customIcons.elf;
        return (
          <div className="flex items-center gap-6">
            <Elf className="h-8 w-8 text-[var(--theme-text-primary)]" aria-hidden />
            <Elf className="h-8 w-8 text-[var(--theme-text-muted)]" aria-hidden />
            <Elf className="h-8 w-8 text-[var(--theme-accent)]" aria-hidden />
            <Elf className="h-8 w-8 text-[var(--theme-danger-text)]" aria-hidden />
          </div>
        );
      },
    },
    {
      label: "Inline with label",
      note: "Drop a glyph beside text like a route-of-administration badge.",
      render: () => {
        const Rectal = customIcons.rectal;
        return (
          <span className="inline-flex items-center gap-2 text-sm text-[var(--theme-text-secondary)]">
            <Rectal className="h-5 w-5" aria-hidden />
            Rectal
          </span>
        );
      },
    },
  ],
  props: [
    {
      name: "(key)",
      type: '"elf" | "benzene" | "rectal"',
      description: "Object key selecting which custom glyph component to render.",
    },
    {
      name: "...props",
      type: "SVGProps<SVGSVGElement>",
      description: "Forwarded to the underlying <svg>: className, width/height, aria-*, style, etc.",
    },
    {
      name: "className",
      type: "string",
      description: "Size and recolour the glyph; fill/stroke follow currentColor.",
    },
  ],
  whenToUse: [
    "Domain-specific glyphs with no Lucide/Iconify equivalent (e.g. benzene ring, route-of-administration marks).",
    "Through the shared Icon component, which looks these up by key for safe fallback.",
  ],
  whenNotToUse: [
    "Anything Lucide or Iconify already covers — use those before adding a bespoke SVG.",
    "Substance molecule structures — those are RDKit-generated assets in public/molecules, not registry glyphs.",
  ],
  notes: [
    "customIcons is a Record, not a component; consumers pick a key then render the returned component.",
    "Glyphs use fill/stroke=\"currentColor\", so they tint from the inherited text color with no extra props.",
    "Icon.tsx resolves these via customIcons[customKey] as a fallback layer over the icon-set lookups.",
  ],
};
