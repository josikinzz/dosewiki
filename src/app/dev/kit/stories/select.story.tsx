import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import type { StoryDef } from "../registry/types";

export const selectStory: StoryDef = {
  id: "select",
  name: "Select",
  tier: "primitive",
  status: "stable",
  summary:
    "Radix select primitive wired to the theme tokens. Compose Select + SelectTrigger/SelectValue + SelectContent/SelectItem for a single-choice dropdown.",
  source: "src/components/ui/select.tsx",
  importLine:
    'import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";',
  exports: [
    "Select",
    "SelectGroup",
    "SelectValue",
    "SelectTrigger",
    "SelectContent",
    "SelectLabel",
    "SelectItem",
    "SelectSeparator",
    "SelectScrollUpButton",
    "SelectScrollDownButton",
    "selectTriggerVariants",
  ],
  examples: [
    {
      label: "Basic select",
      note: "Trigger + value placeholder, items in the popper content.",
      render: () => (
        <Select>
          <SelectTrigger className="w-60">
            <SelectValue placeholder="Choose a substance" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="caffeine">Caffeine</SelectItem>
            <SelectItem value="lsd">LSD</SelectItem>
            <SelectItem value="psilocybin">Psilocybin</SelectItem>
            <SelectItem value="mdma">MDMA</SelectItem>
          </SelectContent>
        </Select>
      ),
    },
    {
      label: "Default value",
      note: "Pass defaultValue on Select for an uncontrolled preset.",
      render: () => (
        <Select defaultValue="lsd">
          <SelectTrigger className="w-60">
            <SelectValue placeholder="Choose a substance" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="caffeine">Caffeine</SelectItem>
            <SelectItem value="lsd">LSD</SelectItem>
            <SelectItem value="psilocybin">Psilocybin</SelectItem>
          </SelectContent>
        </Select>
      ),
    },
    {
      label: "Grouped with labels & separator",
      note: "SelectGroup + SelectLabel + SelectSeparator organise long lists.",
      render: () => (
        <Select>
          <SelectTrigger className="w-60">
            <SelectValue placeholder="Pick a class" />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectLabel>Psychedelics</SelectLabel>
              <SelectItem value="lsd">LSD</SelectItem>
              <SelectItem value="psilocybin">Psilocybin</SelectItem>
            </SelectGroup>
            <SelectSeparator />
            <SelectGroup>
              <SelectLabel>Stimulants</SelectLabel>
              <SelectItem value="caffeine">Caffeine</SelectItem>
              <SelectItem value="amphetamine">Amphetamine</SelectItem>
            </SelectGroup>
          </SelectContent>
        </Select>
      ),
    },
    {
      label: "Sizes",
      note: "selectSize controls trigger height: sm, compact, default, lg. sm matches Input inputSize=\"sm\" for dense entry rows.",
      full: true,
      render: () => (
        <div className="flex w-full flex-col gap-3">
          <Select>
            <SelectTrigger selectSize="sm" className="w-60">
              <SelectValue placeholder="Small" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="a">Option A</SelectItem>
              <SelectItem value="b">Option B</SelectItem>
            </SelectContent>
          </Select>
          <Select>
            <SelectTrigger selectSize="compact" className="w-60">
              <SelectValue placeholder="Compact" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="a">Option A</SelectItem>
              <SelectItem value="b">Option B</SelectItem>
            </SelectContent>
          </Select>
          <Select>
            <SelectTrigger selectSize="default" className="w-60">
              <SelectValue placeholder="Default" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="a">Option A</SelectItem>
              <SelectItem value="b">Option B</SelectItem>
            </SelectContent>
          </Select>
          <Select>
            <SelectTrigger selectSize="lg" className="w-60">
              <SelectValue placeholder="Large" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="a">Option A</SelectItem>
              <SelectItem value="b">Option B</SelectItem>
            </SelectContent>
          </Select>
        </div>
      ),
    },
    {
      label: "Error & disabled",
      note: "variant=\"error\" for invalid state; disabled trigger or per-item disabled.",
      full: true,
      render: () => (
        <div className="flex w-full flex-col gap-3">
          <Select>
            <SelectTrigger variant="error" className="w-60">
              <SelectValue placeholder="Required field" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="a">Option A</SelectItem>
              <SelectItem value="b">Option B</SelectItem>
            </SelectContent>
          </Select>
          <Select disabled>
            <SelectTrigger className="w-60">
              <SelectValue placeholder="Disabled" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="a">Option A</SelectItem>
            </SelectContent>
          </Select>
          <Select>
            <SelectTrigger className="w-60">
              <SelectValue placeholder="With disabled item" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="a">Available</SelectItem>
              <SelectItem value="b" disabled>
                Unavailable
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
      ),
    },
  ],
  props: [
    {
      name: "value / defaultValue",
      type: "string",
      description: "Controlled or uncontrolled selected value (set on Select). Pair value with onValueChange.",
    },
    {
      name: "onValueChange",
      type: "(value: string) => void",
      description: "Fires when the user picks an item (set on Select).",
    },
    {
      name: "variant",
      type: '"default" | "error"',
      default: '"default"',
      description: "SelectTrigger visual state; use error to flag invalid input.",
    },
    {
      name: "selectSize",
      type: '"sm" | "default" | "compact" | "lg"',
      default: '"default"',
      description: "SelectTrigger height/padding scale. sm (h-10) lines up with Input inputSize=\"sm\".",
    },
    {
      name: "placeholder",
      type: "string",
      description: "Empty-state text shown by SelectValue before a choice is made.",
    },
    {
      name: "disabled",
      type: "boolean",
      default: "false",
      description: "Disable the whole Select or an individual SelectItem.",
    },
  ],
  whenToUse: [
    "Single-choice selection from a known, modest list of options.",
    "Form fields where a native-feeling dropdown with grouping/labels is wanted.",
  ],
  whenNotToUse: [
    "Multi-select or free-text search — reach for a command/combobox pattern instead.",
    "Two or three mutually exclusive toggles — use buttons, tabs, or a radio group.",
    "Very long, searchable datasets where typeahead filtering is needed.",
  ],
  notes: [
    "Content renders in a portal with position=\"popper\" by default; the trigger needs a width (e.g. w-60).",
    "Every SelectItem requires a unique value string.",
  ],
};
