import { Textarea } from "@/components/ui/textarea";

import type { StoryDef } from "../registry/types";

export const textareaStory: StoryDef = {
  id: "textarea",
  name: "TextArea",
  tier: "primitive",
  status: "stable",
  summary:
    "Multi-line text input primitive — tokenised border/surface with focus ring, plus variant (default/error) and size scales for forms and editor fields.",
  source: "src/components/ui/textarea.tsx",
  importLine: 'import { Textarea } from "@/components/ui/textarea";',
  exports: ["Textarea", "textareaVariants"],
  examples: [
    {
      label: "Default",
      note: "Resting field with placeholder.",
      render: () => (
        <Textarea
          className="w-full"
          placeholder="Write a note…"
          defaultValue=""
        />
      ),
    },
    {
      label: "With value",
      note: "Filled field showing wrapped content.",
      render: () => (
        <Textarea
          className="w-full"
          defaultValue="A few lines of text already entered into the field so you can see how content wraps and sits inside the surface."
        />
      ),
    },
    {
      label: "Sizes",
      note: "min-height grows with the size scale.",
      full: true,
      render: () => (
        <div className="grid w-full gap-3 sm:grid-cols-3">
          <Textarea textareaSize="sm" placeholder="sm" />
          <Textarea textareaSize="default" placeholder="default" />
          <Textarea textareaSize="lg" placeholder="lg" />
        </div>
      ),
    },
    {
      label: "Error",
      note: "Danger border + ring for invalid input.",
      render: () => (
        <Textarea
          className="w-full"
          variant="error"
          defaultValue="This value failed validation."
          aria-invalid
        />
      ),
    },
    {
      label: "Disabled",
      note: "Non-interactive, dimmed.",
      render: () => (
        <Textarea
          className="w-full"
          disabled
          defaultValue="You cannot edit this field."
        />
      ),
    },
  ],
  props: [
    {
      name: "variant",
      type: '"default" | "error"',
      default: '"default"',
      description: "Visual state. Use error to surface validation failures (danger border + ring).",
    },
    {
      name: "textareaSize",
      type: '"sm" | "default" | "lg"',
      default: '"default"',
      description: "Min-height and padding scale (60px / 80px / 120px).",
    },
    {
      name: "...props",
      type: 'React.ComponentProps<"textarea">',
      description: "All native textarea props (placeholder, value, rows, onChange, disabled, etc.) pass through.",
    },
  ],
  whenToUse: [
    "Any multi-line free-text input — notes, descriptions, longform editor fields.",
    "Form fields that need an invalid state (variant=\"error\").",
  ],
  whenNotToUse: [
    "Single-line input — use the Input primitive instead.",
    "Rich text / markdown editing surfaces with their own toolbar and rendering.",
  ],
  notes: [
    "Border, surface, focus ring, and placeholder colours all resolve from --theme-* tokens; avoid overriding them with raw utilities.",
  ],
};
