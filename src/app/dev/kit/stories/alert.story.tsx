import { AlertTriangle, CheckCircle2, Info, OctagonAlert } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

import type { StoryDef } from "../registry/types";

export const alertStory: StoryDef = {
  id: "alert",
  name: "Alert",
  tier: "primitive",
  status: "stable",
  summary:
    "An inline callout box for messages and status notices, with tone variants and optional leading icon, title, and description.",
  source: "src/components/ui/alert.tsx",
  importLine:
    'import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";',
  exports: ["Alert", "AlertTitle", "AlertDescription"],
  examples: [
    {
      label: "Default",
      note: "Neutral card-surface notice with title and description.",
      background: "plain",
      render: () => (
        <Alert className="w-full">
          <Info className="h-4 w-4" />
          <AlertTitle>Heads up</AlertTitle>
          <AlertDescription>
            This is a neutral informational message rendered on the default card surface.
          </AlertDescription>
        </Alert>
      ),
    },
    {
      label: "Destructive",
      note: "Errors and safety-critical failures.",
      background: "plain",
      render: () => (
        <Alert variant="destructive" className="w-full">
          <OctagonAlert className="h-4 w-4" />
          <AlertTitle>Something went wrong</AlertTitle>
          <AlertDescription>
            The change could not be saved. Check your connection and try again.
          </AlertDescription>
        </Alert>
      ),
    },
    {
      label: "Warning",
      note: "Caution that needs attention but is not an error.",
      background: "plain",
      render: () => (
        <Alert variant="warning" className="w-full">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Unsaved changes</AlertTitle>
          <AlertDescription>
            You have edits that have not been published yet.
          </AlertDescription>
        </Alert>
      ),
    },
    {
      label: "Success",
      note: "Confirmation of a completed action.",
      background: "plain",
      render: () => (
        <Alert variant="success" className="w-full">
          <CheckCircle2 className="h-4 w-4" />
          <AlertTitle>Saved</AlertTitle>
          <AlertDescription>Your changes have been published.</AlertDescription>
        </Alert>
      ),
    },
    {
      label: "Without icon",
      note: "Title and description only — the icon is optional.",
      background: "plain",
      render: () => (
        <Alert className="w-full">
          <AlertTitle>Notice</AlertTitle>
          <AlertDescription>
            An alert with no leading icon; the description aligns to the box edge.
          </AlertDescription>
        </Alert>
      ),
    },
    {
      label: "Description only",
      note: "A compact one-line message with no title.",
      background: "plain",
      render: () => (
        <Alert variant="warning" className="w-full">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            Rate limit reached — please wait a moment before retrying.
          </AlertDescription>
        </Alert>
      ),
    },
  ],
  props: [
    {
      name: "variant",
      type: '"default" | "destructive" | "warning" | "success"',
      default: '"default"',
      description: "Tone of the callout. Maps to the danger/warning/success theme tokens; default uses the card surface.",
    },
    {
      name: "role",
      type: "string",
      default: '"alert" for destructive, otherwise "status"',
      description:
        'ARIA live-region role. Defaults by tone: destructive announces assertively (role="alert"), all other variants announce politely (role="status"). Pass an explicit role (e.g. "note") to override.',
    },
    {
      name: "className",
      type: "string",
      description: "Extra classes; the box stretches full width and rounds to 2xl by default.",
    },
    {
      name: "children",
      type: "ReactNode",
      description:
        "Compose with AlertTitle and AlertDescription; a leading <svg> icon is auto-positioned in the top-left.",
    },
  ],
  whenToUse: [
    "Inline status messages within a form, panel, or page section.",
    "Surfacing errors, warnings, or success confirmations near the relevant content.",
  ],
  whenNotToUse: [
    "Transient, dismissable notifications — use a toast instead.",
    "Safety-critical article callouts on public pages — use Surface's DangerCallout recipe.",
  ],
  notes: [
    "A single leading <svg> child is absolutely positioned top-left; the title and description indent to clear it automatically.",
    'The ARIA role defaults by tone: the destructive variant uses role="alert" (assertive), while default/warning/success use role="status" (polite) so informational callouts do not interrupt screen readers. Pass an explicit `role` to override.',
  ],
};
