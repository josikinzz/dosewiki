import { Calendar, Search, Settings, Smile, User } from "lucide-react";

import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@/components/ui/command";

import type { StoryDef } from "../registry/types";

export const commandStory: StoryDef = {
  id: "command",
  name: "Command",
  tier: "primitive",
  status: "stable",
  summary:
    "A cmdk-based command palette / fuzzy-filter list primitive. Compose Input, List, Group, Item, and Separator into searchable menus and quick-switchers.",
  source: "src/components/ui/command.tsx",
  importLine:
    'import { Command, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem, CommandSeparator, CommandShortcut } from "@/components/ui/command";',
  exports: [
    "Command",
    "CommandDialog",
    "CommandInput",
    "CommandList",
    "CommandEmpty",
    "CommandGroup",
    "CommandItem",
    "CommandShortcut",
    "CommandSeparator",
  ],
  examples: [
    {
      label: "Searchable palette",
      note: "Full composition — type to fuzzy-filter the grouped items.",
      background: "plain",
      full: true,
      render: () => (
        <Command className="w-full max-w-md">
          <CommandInput placeholder="Type a command or search…" />
          <CommandList>
            <CommandEmpty>No results found.</CommandEmpty>
            <CommandGroup heading="Suggestions">
              <CommandItem value="calendar">
                <Calendar />
                <span>Calendar</span>
              </CommandItem>
              <CommandItem value="emoji">
                <Smile />
                <span>Search emoji</span>
              </CommandItem>
            </CommandGroup>
            <CommandSeparator />
            <CommandGroup heading="Settings">
              <CommandItem value="profile">
                <User />
                <span>Profile</span>
                <CommandShortcut>⌘P</CommandShortcut>
              </CommandItem>
              <CommandItem value="settings">
                <Settings />
                <span>Settings</span>
                <CommandShortcut>⌘S</CommandShortcut>
              </CommandItem>
            </CommandGroup>
          </CommandList>
        </Command>
      ),
    },
    {
      label: "Selected & disabled items",
      note: "Items expose data-selected / data-disabled states for keyboard-driven highlighting.",
      background: "plain",
      full: true,
      render: () => (
        <Command className="w-full max-w-md">
          <CommandList>
            <CommandGroup heading="States">
              <CommandItem value="enabled">Enabled item</CommandItem>
              <CommandItem value="disabled" disabled>
                Disabled item
              </CommandItem>
              <CommandItem value="shortcut">
                With shortcut
                <CommandShortcut>⌘K</CommandShortcut>
              </CommandItem>
            </CommandGroup>
          </CommandList>
        </Command>
      ),
    },
    {
      label: "Empty state",
      note: "CommandEmpty renders when a query matches nothing.",
      background: "plain",
      full: true,
      render: () => (
        <Command className="w-full max-w-md" defaultValue="__none__">
          <CommandInput placeholder="Search (nothing matches)…" />
          <CommandList>
            <CommandEmpty>No results found.</CommandEmpty>
            <CommandGroup heading="Hidden">
              <CommandItem value="zzz-unreachable">Unreachable item</CommandItem>
            </CommandGroup>
          </CommandList>
        </Command>
      ),
    },
    {
      label: "Input affordance",
      note: "CommandInput ships a leading search glyph and a divider; placeholder uses theme tokens.",
      background: "plain",
      full: true,
      render: () => (
        <Command className="w-full max-w-md">
          <CommandInput placeholder="Filter substances…" />
          <CommandList>
            <CommandGroup heading="Substances">
              <CommandItem value="lsd">
                <Search />
                <span>LSD</span>
              </CommandItem>
              <CommandItem value="psilocybin">
                <Search />
                <span>Psilocybin</span>
              </CommandItem>
            </CommandGroup>
          </CommandList>
        </Command>
      ),
    },
  ],
  props: [
    {
      name: "value / defaultValue",
      type: "string",
      description: "Controlled / uncontrolled selected item value (Command). Drives keyboard highlight and CommandEmpty.",
    },
    {
      name: "onValueChange",
      type: "(value: string) => void",
      description: "Fires when the active CommandItem changes via keyboard or pointer.",
    },
    {
      name: "value (CommandItem)",
      type: "string",
      description: "Stable identity used for fuzzy matching and selection; falls back to text content if omitted.",
    },
    { name: "disabled (CommandItem)", type: "boolean", default: "false", description: "Skips the item in keyboard navigation and dims it." },
    { name: "heading (CommandGroup)", type: "ReactNode", description: "Uppercase section label rendered above the group's items." },
    {
      name: "open / onOpenChange (CommandDialog)",
      type: "boolean / (open: boolean) => void",
      description: "Dialog open state — CommandDialog wraps Command inside the shared Dialog modal.",
    },
  ],
  whenToUse: [
    "Command palettes, quick-switchers, and ⌘K menus.",
    "Searchable / fuzzy-filtered lists where typing narrows the options.",
    "Use CommandDialog when the palette should appear as a modal overlay.",
  ],
  whenNotToUse: [
    "Simple form dropdowns — use Select instead.",
    "Static menus without search — use DropdownMenu.",
    "Free-text inputs that do not filter a fixed list — use a plain Input.",
  ],
  notes: [
    "Built on cmdk; Command provides the search context, so Input/List/Group/Item must live inside a Command.",
    "CommandDialog needs open state and a portal/Dialog context, so it is documented via props rather than rendered inline here.",
  ],
};
