import { ErrorBoundary, ErrorBoundaryFallback } from "@/components/common/ErrorBoundary";

import type { StoryDef } from "../registry/types";

export const errorBoundaryStory: StoryDef = {
  id: "error-boundary",
  name: "ErrorBoundary",
  tier: "common",
  status: "stable",
  summary:
    "Keeps a render failure inside one region: the region shows a translated fallback, the page around it stays usable, and the error is reported once through reportClientError.",
  source: "src/components/common/ErrorBoundary.tsx",
  importLine: 'import { ErrorBoundary } from "@/components/common/ErrorBoundary";',
  exports: ["ErrorBoundary", "ErrorBoundaryFallback"],
  intents: [
    { family: "surfaces", need: "A region that fails on its own without taking the page down" },
  ],
  examples: [
    {
      label: "Healthy region",
      note: "With nothing thrown, the boundary renders its children and adds no markup.",
      background: "card",
      render: () => (
        <ErrorBoundary name="kit-example">
          <p className="theme-text-secondary text-sm">The wrapped region renders normally.</p>
        </ErrorBoundary>
      ),
    },
    {
      label: "Default fallback",
      note: "What a failed region shows unless the caller supplies `fallback`. Copy goes through useT().",
      background: "card",
      full: true,
      render: () => <ErrorBoundaryFallback error={null} reset={() => {}} />,
    },
  ],
  props: [
    { name: "name", type: "string", description: "Stable region name carried into the error report." },
    { name: "children", type: "ReactNode", description: "The region to protect." },
    {
      name: "fallback",
      type: "({ error, reset }) => ReactNode",
      description: "Region-specific fallback, for surfaces such as the dark replication stage where the default does not fit.",
    },
    {
      name: "resetKeys",
      type: "readonly unknown[]",
      description: "A change in any key clears an error already on screen, e.g. the active work's slug.",
    },
    { name: "className", type: "string", description: "Classes for the default fallback's wrapper." },
  ],
  whenToUse: [
    "A heavy client region (media stage, canvas editor) whose failure should not blank the page.",
  ],
  whenNotToUse: [
    "Whole-route failures: those belong to the route's error.tsx.",
    "Expected empty or failed data states: render StateCard directly.",
  ],
  notes: [
    "Server rendering never catches: the boundary only acts in the browser, like every React error boundary.",
  ],
};
