import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import type { StoryDef } from "../registry/types";

function Panel({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-[var(--theme-text-secondary)]">{children}</p>;
}

export const tabsStory: StoryDef = {
  id: "tabs",
  name: "Tabs",
  tier: "primitive",
  status: "stable",
  summary:
    "Radix tabs primitive styled as a pill list. Compose Tabs > TabsList > TabsTrigger with matching TabsContent panels to switch between views without navigating.",
  source: "src/components/ui/tabs.tsx",
  importLine:
    'import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";',
  exports: ["Tabs", "TabsList", "TabsTrigger", "TabsContent"],
  examples: [
    {
      label: "Basic tabs",
      note: "TabsTrigger value must match the TabsContent value it reveals.",
      background: "plain",
      full: true,
      render: () => (
        <Tabs defaultValue="overview" className="w-full">
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="dosage">Dosage</TabsTrigger>
            <TabsTrigger value="effects">Effects</TabsTrigger>
          </TabsList>
          <TabsContent value="overview">
            <Panel>Summary of the substance and its common context.</Panel>
          </TabsContent>
          <TabsContent value="dosage">
            <Panel>Dose ranges and routes of administration.</Panel>
          </TabsContent>
          <TabsContent value="effects">
            <Panel>Subjective and physical effects.</Panel>
          </TabsContent>
        </Tabs>
      ),
    },
    {
      label: "Default selection",
      note: "defaultValue sets the initially active tab (uncontrolled).",
      background: "plain",
      full: true,
      render: () => (
        <Tabs defaultValue="second" className="w-full">
          <TabsList>
            <TabsTrigger value="first">First</TabsTrigger>
            <TabsTrigger value="second">Second (default)</TabsTrigger>
            <TabsTrigger value="third">Third</TabsTrigger>
          </TabsList>
          <TabsContent value="first">
            <Panel>First panel.</Panel>
          </TabsContent>
          <TabsContent value="second">
            <Panel>Second panel is shown first because it is the default.</Panel>
          </TabsContent>
          <TabsContent value="third">
            <Panel>Third panel.</Panel>
          </TabsContent>
        </Tabs>
      ),
    },
    {
      label: "Disabled trigger",
      note: "Set disabled on a TabsTrigger to lock a tab out of the rotation.",
      background: "plain",
      full: true,
      render: () => (
        <Tabs defaultValue="available" className="w-full">
          <TabsList>
            <TabsTrigger value="available">Available</TabsTrigger>
            <TabsTrigger value="soon" disabled>
              Coming soon
            </TabsTrigger>
          </TabsList>
          <TabsContent value="available">
            <Panel>This tab is selectable.</Panel>
          </TabsContent>
          <TabsContent value="soon">
            <Panel>Unreachable while disabled.</Panel>
          </TabsContent>
        </Tabs>
      ),
    },
  ],
  props: [
    {
      name: "defaultValue",
      type: "string",
      description: "Tab selected on mount when used uncontrolled (Tabs root).",
    },
    {
      name: "value / onValueChange",
      type: "string / (value: string) => void",
      description: "Controlled active tab and its change handler (Tabs root).",
    },
    {
      name: "value",
      type: "string",
      description: "Required identifier on each TabsTrigger and TabsContent; matching values pair a trigger to its panel.",
    },
    {
      name: "disabled",
      type: "boolean",
      default: "false",
      description: "Disables an individual TabsTrigger.",
    },
    {
      name: "orientation",
      type: '"horizontal" | "vertical"',
      default: '"horizontal"',
      description: "Tab list orientation and arrow-key navigation axis (Tabs root).",
    },
  ],
  whenToUse: [
    "Switching between a small set of sibling views in the same place (overview / dosage / effects).",
    "Content that should not change the URL or reload — tabs keep state local.",
  ],
  whenNotToUse: [
    "Primary navigation between routes — use links, not tabs.",
    "More than a handful of sections, or sections that need their own URL — prefer pages or an accordion.",
  ],
  notes: [
    "TabsList renders as a frosted pill row; the active TabsTrigger gets the raised control background automatically.",
    "Every TabsTrigger needs a TabsContent with the same value or the panel will never show.",
  ],
};
