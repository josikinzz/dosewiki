import { useState } from "react";
import { ChevronDown } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

import type { StoryDef } from "../registry/types";

function BasicMenu() {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline">
          Actions
          <ChevronDown className="ml-1" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <DropdownMenuLabel>Article</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuItem>
            Edit
            <DropdownMenuShortcut>⌘E</DropdownMenuShortcut>
          </DropdownMenuItem>
          <DropdownMenuItem>
            Duplicate
            <DropdownMenuShortcut>⌘D</DropdownMenuShortcut>
          </DropdownMenuItem>
          <DropdownMenuItem disabled>Archive</DropdownMenuItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem className="text-[var(--theme-error-text)]">Delete</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function CheckboxMenu() {
  const [showDose, setShowDose] = useState(true);
  const [showDuration, setShowDuration] = useState(false);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline">
          Columns
          <ChevronDown className="ml-1" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <DropdownMenuLabel>Visible columns</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuCheckboxItem checked={showDose} onCheckedChange={setShowDose}>
          Dosage
        </DropdownMenuCheckboxItem>
        <DropdownMenuCheckboxItem checked={showDuration} onCheckedChange={setShowDuration}>
          Duration
        </DropdownMenuCheckboxItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function RadioMenu() {
  const [sort, setSort] = useState("name");
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline">
          Sort by
          <ChevronDown className="ml-1" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <DropdownMenuLabel>Sort order</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuRadioGroup value={sort} onValueChange={setSort}>
          <DropdownMenuRadioItem value="name">Name</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="recent">Recently updated</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="class">Class</DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function SubMenu() {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline">
          More
          <ChevronDown className="ml-1" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <DropdownMenuItem>Open</DropdownMenuItem>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>Move to</DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            <DropdownMenuItem>Drafts</DropdownMenuItem>
            <DropdownMenuItem>Published</DropdownMenuItem>
            <DropdownMenuItem>Trash</DropdownMenuItem>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSeparator />
        <DropdownMenuItem>Settings</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export const dropdownMenuStory: StoryDef = {
  id: "dropdown-menu",
  name: "DropdownMenu",
  tier: "primitive",
  status: "stable",
  summary:
    "Radix dropdown menu styled with theme overlay tokens — a trigger that opens a floating menu of items, checkboxes, radios, and nested submenus.",
  source: "src/components/ui/dropdown-menu.tsx",
  importLine:
    'import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from "@/components/ui/dropdown-menu";',
  exports: [
    "DropdownMenu",
    "DropdownMenuTrigger",
    "DropdownMenuContent",
    "DropdownMenuItem",
    "DropdownMenuCheckboxItem",
    "DropdownMenuRadioItem",
    "DropdownMenuLabel",
    "DropdownMenuSeparator",
    "DropdownMenuShortcut",
    "DropdownMenuGroup",
    "DropdownMenuPortal",
    "DropdownMenuSub",
    "DropdownMenuSubContent",
    "DropdownMenuSubTrigger",
    "DropdownMenuRadioGroup",
  ],
  examples: [
    {
      label: "Basic menu",
      note: "Trigger, label, grouped items, shortcut, separator, and a disabled item.",
      background: "plain",
      render: () => <BasicMenu />,
    },
    {
      label: "Checkbox items",
      note: "Toggle state with checked / onCheckedChange.",
      background: "plain",
      render: () => <CheckboxMenu />,
    },
    {
      label: "Radio group",
      note: "Single-select with DropdownMenuRadioGroup + DropdownMenuRadioItem.",
      background: "plain",
      render: () => <RadioMenu />,
    },
    {
      label: "Submenu",
      note: "Nested menu via DropdownMenuSub / SubTrigger / SubContent.",
      background: "plain",
      render: () => <SubMenu />,
    },
  ],
  props: [
    {
      name: "DropdownMenuContent.container",
      type: "HTMLElement | null",
      default: "document.body",
      description: "Portal destination. Keep menus inside a fullscreen element or modal outlet when the trigger lives there.",
    },
    {
      name: "DropdownMenuContent.sideOffset",
      type: "number",
      default: "4",
      description: "Gap in pixels between the trigger and the floating content.",
    },
    {
      name: "DropdownMenuContent.align",
      type: '"start" | "center" | "end"',
      default: '"center"',
      description: "Alignment of the content relative to the trigger.",
    },
    {
      name: "DropdownMenuItem.inset",
      type: "boolean",
      default: "false",
      description: "Adds left padding to align items under a label or with leading-icon items.",
    },
    {
      name: "DropdownMenuCheckboxItem.checked",
      type: "boolean | \"indeterminate\"",
      description: "Controlled checked state; pair with onCheckedChange.",
    },
    {
      name: "DropdownMenuRadioGroup.value",
      type: "string",
      description: "Controlled selected value; pair with onValueChange.",
    },
  ],
  whenToUse: [
    "Action overflow menus triggered by a button or icon button.",
    "Compact single-select sorting or filtering controls.",
    "Toggling boolean view options with checkbox items.",
  ],
  whenNotToUse: [
    "Selecting a value within a form — use Select for an accessible combobox.",
    "Right-click context actions — use a context menu primitive instead.",
    "Primary navigation — use real links and nav chrome.",
  ],
  notes: [
    "DropdownMenuContent renders in a portal and uses theme-overlay-surface tokens; the trigger and content live under one DropdownMenu root.",
    "Pass asChild to DropdownMenuTrigger to drive it from any element (e.g. a Button) while keeping a single accessible control.",
  ],
};
