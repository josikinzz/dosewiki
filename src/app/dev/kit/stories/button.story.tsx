import { Plus, Search, X } from "lucide-react";

import { Button } from "@/components/ui/button";

import type { StoryDef } from "../registry/types";

export const buttonStory: StoryDef = {
  id: "button",
  name: "Button",
  tier: "primitive",
  status: "stable",
  summary:
    "The single button primitive. Variants describe visual behaviour (tone, emphasis, shape, icon affordance) — never a feature or route.",
  source: "src/components/ui/button.tsx",
  importLine: 'import { Button } from "@/components/ui/button";',
  exports: ["Button", "buttonVariants"],
  examples: [
    {
      label: "Primary actions",
      render: () => (
        <>
          <Button variant="accent">Save</Button>
          <Button variant="default">Default</Button>
          <Button variant="secondary">Secondary</Button>
        </>
      ),
    },
    {
      label: "Quiet",
      render: () => (
        <>
          <Button variant="ghost">Ghost</Button>
          <Button variant="outline">Outline</Button>
          <Button variant="link">Link</Button>
        </>
      ),
    },
    {
      label: "Status tones",
      render: () => (
        <>
          <Button variant="success">Confirm</Button>
          <Button variant="destructive">Delete</Button>
          <Button variant="ghostDestructive">Remove</Button>
        </>
      ),
    },
    {
      label: "Pills & chips",
      render: () => (
        <>
          <Button variant="pill">Pill</Button>
          <Button variant="pillActive">Active</Button>
          <Button variant="glass">Glass</Button>
          <Button variant="chip" size="chip">
            Chip
          </Button>
          <Button variant="accent" size="pillLg">
            Accent pill
          </Button>
        </>
      ),
    },
    {
      label: "Quiet toggle controls",
      note: 'Transparent, borderless inline controls (e.g. a sort selector under tabs). Pair quiet (idle) with quietActive (selected); use size="quiet".',
      render: () => (
        <>
          <Button variant="quietActive" size="quiet">
            Name
          </Button>
          <Button variant="quiet" size="quiet">
            Report count
          </Button>
        </>
      ),
    },
    {
      label: "Sizes",
      render: () => (
        <>
          <Button variant="accent" size="sm">
            Small
          </Button>
          <Button variant="accent">Default</Button>
          <Button variant="accent" size="lg">
            Large
          </Button>
          <Button variant="accent" size="pillLg">
            Pill (CTA)
          </Button>
        </>
      ),
    },
    {
      label: "Icon affordances",
      render: () => (
        <>
          <Button variant="iconGhost" size="icon" aria-label="Add">
            <Plus />
          </Button>
          <Button variant="iconAction" size="icon" aria-label="Search">
            <Search />
          </Button>
          <Button variant="iconClose" size="icon" aria-label="Close">
            <X />
          </Button>
        </>
      ),
    },
    {
      label: "Legacy recipe variants",
      note: "Rendered for reference only — do not use in new code. Tracked for migration into owning components.",
      background: "card",
      full: true,
      render: () => (
        <div className="flex w-full flex-col gap-2">
          <Button variant="card" size="card">
            card
          </Button>
          <Button variant="listItem" size="listItem">
            listItem
          </Button>
          <Button variant="suggestion" size="suggestion">
            suggestion
          </Button>
        </div>
      ),
    },
  ],
  props: [
    {
      name: "variant",
      type: "see buttonVariants",
      default: '"default"',
      description: "Visual treatment. Use tone/emphasis/shape variants; legacy recipe variants are migrating out.",
    },
    { name: "size", type: "see buttonVariants", default: '"default"', description: "Height/padding scale." },
    {
      name: "asChild",
      type: "boolean",
      default: "false",
      description: "Render as the child element (e.g. a Next <Link>) via Radix Slot while keeping button styles.",
    },
  ],
  whenToUse: [
    "Any clickable action — primary, secondary, ghost, or icon-only.",
    "Links that should look like buttons (pass asChild and wrap a Link).",
  ],
  whenNotToUse: [
    "Feature-specific recipes — wrap Button in an owning component instead of adding a variant.",
    "Status/severity labels — use Badge.",
    "Show-more affordances — use ExpandButton.",
  ],
  notes: [
    "Variant names must stay primitive; ownership.test.ts blocks feature-named variants.",
  ],
};
