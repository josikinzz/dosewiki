import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

import type { StoryDef } from "../registry/types";

export const cardStory: StoryDef = {
  id: "card",
  name: "Card",
  tier: "primitive",
  status: "stable",
  summary:
    "A shadcn-style card built on InteractiveSurface (variant card, lg padding, xl radius) with header/title/description/content/footer slots.",
  source: "src/components/ui/card.tsx",
  importLine:
    'import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";',
  exports: [
    "Card",
    "CardHeader",
    "CardFooter",
    "CardTitle",
    "CardDescription",
    "CardContent",
  ],
  intents: [
    { family: "cards", need: "A generic bordered content card" },
  ],
  examples: [
    {
      label: "Full composition",
      note: "Header (title + description), content, and a footer action row.",
      background: "plain",
      render: () => (
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Substance overview</CardTitle>
            <CardDescription>
              A short summary of what this card documents.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-[var(--theme-text-secondary)]">
              Card content sits in CardContent. It carries the body copy, lists,
              or any nested composition the card needs to show.
            </p>
          </CardContent>
          <CardFooter className="justify-end gap-2">
            <Button variant="ghost">Cancel</Button>
            <Button variant="accent">Save</Button>
          </CardFooter>
        </Card>
      ),
    },
    {
      label: "Header only",
      note: "Title and description with no body — useful for compact summaries.",
      background: "plain",
      render: () => (
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Quick fact</CardTitle>
            <CardDescription>
              CardTitle uses the accent heading style; CardDescription is muted.
            </CardDescription>
          </CardHeader>
        </Card>
      ),
    },
    {
      label: "Content only",
      note: "Plain card without the header/footer scaffold.",
      background: "plain",
      render: () => (
        <Card className="w-full max-w-md">
          <CardContent className="p-0">
            <span className="text-sm text-[var(--theme-text-primary)]">
              Card is just a styled surface — you can drop arbitrary children in
              directly when you don&apos;t need the slots.
            </span>
          </CardContent>
        </Card>
      ),
    },
    {
      label: "Footer actions",
      note: "CardFooter is a flex row; align actions to the end with utilities.",
      background: "plain",
      render: () => (
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Confirm action</CardTitle>
            <CardDescription>This cannot be undone.</CardDescription>
          </CardHeader>
          <CardFooter className="justify-between">
            <span className="text-xs text-[var(--theme-text-muted)]">
              Step 2 of 3
            </span>
            <Button variant="destructive" size="sm">
              Delete
            </Button>
          </CardFooter>
        </Card>
      ),
    },
  ],
  props: [
    {
      name: "className",
      type: "string",
      description:
        "Merged onto the underlying InteractiveSurface (Card) or the slot div (sub-components). Use it to size, align, or override padding.",
    },
    {
      name: "...props",
      type: "React.HTMLAttributes<HTMLDivElement>",
      description:
        "All parts spread native div attributes (id, role, event handlers, etc.).",
    },
  ],
  whenToUse: [
    "Self-contained panels that group a title, body, and actions.",
    "shadcn-shaped layouts where you want the header/content/footer slots.",
  ],
  whenNotToUse: [
    "Public article content cards — reach for the Surface recipes (ContentCard, NestedContentCard).",
    "Plain text groupings that need no container.",
  ],
  notes: [
    "Card is a thin wrapper over InteractiveSurface; the surface tokens (variant card, padding lg, radius xl) come from there.",
    "CardTitle/CardDescription/CardHeader/CardFooter carry their own internal padding (p-6); compose them rather than re-padding the outer Card.",
  ],
};
