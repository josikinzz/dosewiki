import { Search } from "lucide-react";

import { Input } from "@/components/ui/input";

import type { StoryDef } from "../registry/types";

export const inputStory: StoryDef = {
  id: "input",
  name: "Input",
  tier: "primitive",
  status: "stable",
  summary:
    "The single text-field primitive. Variants describe validation state and size only — wire labels, hints, and form logic outside the input.",
  source: "src/components/ui/input.tsx",
  importLine: 'import { Input } from "@/components/ui/input";',
  exports: ["Input", "inputVariants"],
  examples: [
    {
      label: "Default",
      note: "A standard text field with placeholder.",
      render: () => (
        <Input className="max-w-xs" placeholder="Search substances…" defaultValue="" />
      ),
    },
    {
      label: "Sizes",
      note: "inputSize: sm / default / lg.",
      full: true,
      render: () => (
        <div className="flex w-full max-w-md flex-col gap-2">
          <Input inputSize="sm" placeholder="Small" />
          <Input inputSize="default" placeholder="Default" />
          <Input inputSize="lg" placeholder="Large" />
        </div>
      ),
    },
    {
      label: "Error state",
      note: "variant=\"error\" tints the border and focus ring with danger tokens.",
      render: () => (
        <Input
          className="max-w-xs"
          variant="error"
          placeholder="Required field"
          defaultValue="not-an-email"
          aria-invalid
        />
      ),
    },
    {
      label: "Disabled",
      note: "Native disabled — dims and blocks input.",
      render: () => (
        <Input className="max-w-xs" disabled defaultValue="Read-only value" />
      ),
    },
    {
      label: "Input types",
      note: "Pass any native input type (email, password, number, search).",
      full: true,
      render: () => (
        <div className="flex w-full max-w-md flex-col gap-2">
          <Input type="email" placeholder="you@example.com" />
          <Input type="password" placeholder="Password" />
          <Input type="number" placeholder="0" />
        </div>
      ),
    },
    {
      label: "With leading icon",
      note: "Icons are not built in — position one over a padded input in your wrapper.",
      render: () => (
        <div className="relative max-w-xs">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--theme-text-faint)]"
            aria-hidden
          />
          <Input className="pl-9" type="search" placeholder="Search…" />
        </div>
      ),
    },
  ],
  props: [
    {
      name: "variant",
      type: '"default" | "error"',
      default: '"default"',
      description: "Validation treatment. Use error to tint border/ring with danger tokens; pair with aria-invalid.",
    },
    {
      name: "inputSize",
      type: '"sm" | "default" | "lg"',
      default: '"default"',
      description: "Height/padding/text scale. Renamed from native size to avoid the input width attribute.",
    },
    {
      name: "type",
      type: "string",
      default: '"text"',
      description: "Any native input type (text, email, password, number, search, file, …).",
    },
    {
      name: "...props",
      type: 'React.ComponentProps<"input">',
      description: "All native input props (value, onChange, placeholder, disabled, ref, …) pass through.",
    },
  ],
  whenToUse: [
    "Any single-line text entry — search boxes, form fields, filters.",
    "Fields that need a validation error treatment (variant=\"error\").",
  ],
  whenNotToUse: [
    "Multi-line text — use a textarea primitive instead.",
    "Choice from a fixed set — use Select.",
    "Toggle/boolean state — use Checkbox or Switch.",
  ],
  notes: [
    "The native size attribute is omitted; use inputSize for the height scale.",
    "Labels, hint text, and error messages live outside Input — compose them with Label.",
  ],
};
