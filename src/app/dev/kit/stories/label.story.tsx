import { Label } from "@/components/ui/label";

import type { StoryDef } from "../registry/types";

export const labelStory: StoryDef = {
  id: "label",
  name: "Label",
  tier: "primitive",
  status: "stable",
  summary:
    "The form field label primitive — a Radix Label styled as a faint, uppercase, tracked caption that pairs with an input via htmlFor.",
  source: "src/components/ui/label.tsx",
  importLine: 'import { Label } from "@/components/ui/label";',
  exports: ["Label"],
  examples: [
    {
      label: "Default",
      note: "Faint, uppercase, tracked caption styling baked in.",
      render: () => <Label>Substance name</Label>,
    },
    {
      label: "Paired with an input",
      note: "htmlFor links the label to a control so clicking it focuses the field.",
      background: "card",
      full: true,
      render: () => (
        <div className="flex w-full max-w-xs flex-col gap-1.5">
          <Label htmlFor="kit-label-dose">Dose</Label>
          <input
            id="kit-label-dose"
            placeholder="e.g. 100 mg"
            className="rounded-md border border-[var(--theme-border)] bg-[var(--theme-surface)] px-3 py-2 text-sm text-[var(--theme-text-primary)] placeholder:text-[var(--theme-text-muted)]"
          />
        </div>
      ),
    },
    {
      label: "Peer-disabled",
      note: "When wrapping a disabled peer control the label dims and shows a not-allowed cursor.",
      background: "card",
      full: true,
      render: () => (
        <div className="flex w-full max-w-xs flex-col gap-1.5">
          <input
            id="kit-label-disabled"
            disabled
            placeholder="Disabled field"
            className="peer rounded-md border border-[var(--theme-border)] bg-[var(--theme-surface)] px-3 py-2 text-sm text-[var(--theme-text-primary)] placeholder:text-[var(--theme-text-muted)] disabled:opacity-50"
          />
          <Label htmlFor="kit-label-disabled">Locked field</Label>
        </div>
      ),
    },
    {
      label: "Extending the style",
      note: "Pass className to layer on top of the baked-in caption treatment.",
      render: () => (
        <Label className="text-[var(--theme-text-secondary)]">Override tone</Label>
      ),
    },
  ],
  props: [
    {
      name: "htmlFor",
      type: "string",
      description: "Id of the control this label describes; clicking the label focuses that control.",
    },
    {
      name: "className",
      type: "string",
      description: "Extra classes merged after the baked-in faint/uppercase caption styling.",
    },
    {
      name: "...props",
      type: "React.ComponentPropsWithoutRef<typeof LabelPrimitive.Root>",
      description: "All Radix Label root props (children, ref, etc.) pass straight through.",
    },
  ],
  whenToUse: [
    "Labelling a form input, select, switch, or other control.",
    "Short caption-style field titles that should read as quiet uppercase metadata.",
  ],
  whenNotToUse: [
    "Body copy or headings — this primitive is locked to a small uppercase caption style.",
    "Status or severity chips — use Badge instead.",
  ],
  notes: [
    "Always pair with the control via htmlFor (or by nesting the control) so it stays accessible.",
    "Styling is fixed (faint, uppercase, tracked); use className for tweaks rather than expecting variants.",
  ],
};
