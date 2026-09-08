import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

import type { StoryDef } from "../registry/types";

export const dialogStory: StoryDef = {
  id: "dialog",
  name: "Dialog",
  tier: "primitive",
  status: "stable",
  summary:
    "Radix-backed modal primitive. Compose Dialog with Trigger, Content, Header/Title/Description, and Footer for focused, interruptive flows.",
  source: "src/components/ui/dialog.tsx",
  importLine:
    'import { Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from "@/components/ui/dialog";',
  exports: [
    "Dialog",
    "DialogPortal",
    "DialogOverlay",
    "DialogClose",
    "DialogTrigger",
    "DialogContent",
    "DialogHeader",
    "DialogFooter",
    "DialogTitle",
    "DialogDescription",
  ],
  examples: [
    {
      label: "Basic dialog",
      note: "Trigger opens a themed overlay surface with header, body, and footer actions.",
      render: () => (
        <Dialog>
          <DialogTrigger asChild>
            <Button variant="accent">Open dialog</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Update substance</DialogTitle>
              <DialogDescription>
                Review the changes before saving. This action updates the live draft.
              </DialogDescription>
            </DialogHeader>
            <p className="text-sm text-[var(--theme-text-secondary)]">
              Dialog body content goes here. Keep it focused on a single task.
            </p>
            <DialogFooter>
              <DialogClose asChild>
                <Button variant="ghost">Cancel</Button>
              </DialogClose>
              <DialogClose asChild>
                <Button variant="accent">Save</Button>
              </DialogClose>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      ),
    },
    {
      label: "Destructive confirmation",
      note: "Use status-toned footer buttons for irreversible actions.",
      render: () => (
        <Dialog>
          <DialogTrigger asChild>
            <Button variant="ghostDestructive">Delete article</Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Delete this article?</DialogTitle>
              <DialogDescription>
                This permanently removes the article and cannot be undone.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <DialogClose asChild>
                <Button variant="outline">Cancel</Button>
              </DialogClose>
              <DialogClose asChild>
                <Button variant="destructive">Delete</Button>
              </DialogClose>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      ),
    },
    {
      label: "Without close button",
      note: "Pass showClose={false} when the body provides its own dismissal affordances.",
      render: () => (
        <Dialog>
          <DialogTrigger asChild>
            <Button variant="secondary">Open without X</Button>
          </DialogTrigger>
          <DialogContent showClose={false}>
            <DialogHeader>
              <DialogTitle>Pick an option</DialogTitle>
              <DialogDescription>
                No corner close button — dismissal happens through the footer.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <DialogClose asChild>
                <Button variant="default">Got it</Button>
              </DialogClose>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      ),
    },
    {
      label: "Scrollable / wide content",
      note: "Override max-w via className for content-heavy dialogs.",
      render: () => (
        <Dialog>
          <DialogTrigger asChild>
            <Button variant="outline">Open wide dialog</Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Preview</DialogTitle>
              <DialogDescription>A wider surface for tables or previews.</DialogDescription>
            </DialogHeader>
            <div className="max-h-64 overflow-auto rounded-md border border-[var(--theme-border-subtle)] p-3 text-sm text-[var(--theme-text-secondary)]">
              {Array.from({ length: 12 }).map((_, i) => (
                <p key={i} className="py-1">
                  Scrollable row {i + 1}
                </p>
              ))}
            </div>
            <DialogFooter>
              <DialogClose asChild>
                <Button variant="accent">Close</Button>
              </DialogClose>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      ),
    },
  ],
  props: [
    {
      name: "open / onOpenChange",
      type: "boolean / (open: boolean) => void",
      description: "Controlled open state on Dialog (Radix Root). Omit for uncontrolled trigger-driven behaviour.",
    },
    {
      name: "showClose",
      type: "boolean",
      default: "true",
      description: "DialogContent prop. Renders the absolute top-right close (X) button.",
    },
    {
      name: "container",
      type: "HTMLElement | null",
      description: "Portal container for a dialog opened within an existing viewer or native fullscreen focus boundary. Defaults to document.body.",
    },
    {
      name: "asChild",
      type: "boolean",
      default: "false",
      description: "On DialogTrigger / DialogClose — merge props onto the child (e.g. a Button) instead of rendering an extra element.",
    },
    {
      name: "className",
      type: "string",
      description: "DialogContent accepts className to override the default max-w-lg width and spacing.",
    },
  ],
  whenToUse: [
    "Focused, interruptive tasks that must block the rest of the page (confirmations, quick edits).",
    "Destructive confirmations where the user must explicitly proceed or cancel.",
  ],
  whenNotToUse: [
    "Non-blocking, transient feedback — use a toast.",
    "Lightweight contextual menus or pickers — use DropdownMenu, Popover, or Select.",
    "Large multi-step flows that deserve their own route or page.",
  ],
  notes: [
    "DialogContent renders through a portal with a themed overlay (theme-overlay-surface); focus is trapped automatically by Radix.",
    "Always include a DialogTitle (visually or via sr-only) for accessibility — Radix warns if it is missing.",
  ],
};
