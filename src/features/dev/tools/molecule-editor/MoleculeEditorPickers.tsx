import { useMemo, useState } from "react";
import { Icon } from "@/components/common/Icon";
import { cn } from "@/lib/utils";
import { Button, Input, Surface } from "@/components/ui";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { EditorStatusPill } from "@/features/dev/components";
import {
  groupMoleculePickerItems,
  type MoleculePickerItem,
} from "./moleculePickerOrdering";
import type { EditorMode } from "./moleculeEditorTypes";

const SAVED_PILL_TITLE = "Has a saved depiction";
const PUBLISHED_PILL_TITLE = "Article is publicly listed on the site";

export function TemplateInitialization({
  onUseClassStructure,
  smiles,
  onSmilesChange,
  onUseSmiles,
  members,
  selectedMember,
  onSelectMember,
  onUseMember,
  memberReady,
  classStructureReady,
  busy,
}: {
  onUseClassStructure: () => void;
  smiles: string;
  onSmilesChange: (value: string) => void;
  onUseSmiles: () => void;
  members: MoleculePickerItem[];
  selectedMember: string | null;
  onSelectMember: (slug: string) => void;
  onUseMember: () => void;
  memberReady: boolean;
  classStructureReady: boolean;
  busy: boolean;
}) {
  return (
    <Surface variant="muted" padding="sm" radius="lg" className="mt-4 grid gap-4 lg:grid-cols-3">
      <div className="space-y-2">
        <div>
          <p className="theme-text-primary text-sm font-medium">Start from the class structure</p>
          <p className="theme-text-muted text-xs">
            Load the familiar generic class depiction, without its R-group placeholders.
          </p>
        </div>
        <Button variant="accent" onClick={onUseClassStructure} disabled={busy || !classStructureReady}>
          <Icon icon={busy ? "lucide:loader-2" : "lucide:git-fork"} size={15} className={busy ? "animate-spin" : undefined} />
          Use class structure
        </Button>
      </div>
      <div className="space-y-2">
        <div>
          <p className="theme-text-primary text-sm font-medium">Start from SMILES</p>
          <p className="theme-text-muted text-xs">Paste a plain scaffold, then generate its editable layout.</p>
        </div>
        <div className="flex gap-2">
          <Input
            value={smiles}
            onChange={(event) => onSmilesChange(event.target.value)}
            placeholder="Paste scaffold SMILES…"
            aria-label="Template scaffold SMILES"
            disabled={busy}
          />
          <Button variant="outline" onClick={onUseSmiles} disabled={busy || !smiles.trim()}>
            <Icon icon={busy ? "lucide:loader-2" : "lucide:sparkles"} size={15} className={busy ? "animate-spin" : undefined} />
            Use SMILES
          </Button>
        </div>
      </div>
      <div className="space-y-2">
        <div>
          <p className="theme-text-primary text-sm font-medium">Start from a member</p>
          <p className="theme-text-muted text-xs">Load a class member&apos;s current depiction.</p>
        </div>
        {members.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            <SubstanceCombobox
              label="Select a class member"
              molecules={members}
              selected={selectedMember}
              onSelect={onSelectMember}
              loadTimedOut={false}
              mode="substances"
              placeholder="Select a member…"
              searchPlaceholder="Search class members…"
            />
            <Button variant="outline" onClick={onUseMember} disabled={busy || !memberReady}>
              <Icon icon={busy ? "lucide:loader-2" : "lucide:copy"} size={15} className={busy ? "animate-spin" : undefined} />
              Load member
            </Button>
          </div>
        ) : (
          <p className="theme-text-faint text-sm">No class members with stored MOL blocks are available.</p>
        )}
      </div>
    </Surface>
  );
}

export function SubstanceCombobox({
  label: ariaLabel,
  molecules,
  selected,
  onSelect,
  loadTimedOut,
  mode,
  placeholder,
  searchPlaceholder,
}: {
  label: string;
  molecules: MoleculePickerItem[] | null;
  selected: string | null;
  onSelect: (slug: string) => void;
  loadTimedOut: boolean;
  mode: EditorMode;
  placeholder?: string;
  searchPlaceholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const current = molecules?.find((molecule) => molecule.slug === selected) ?? null;
  const groups = useMemo(() => groupMoleculePickerItems(molecules ?? []), [molecules]);
  const label = !molecules
    ? loadTimedOut
      ? `${mode === "classes" ? "Classes" : "Substances"} unavailable`
      : `Loading ${mode}…`
    : current
      ? current.title
      : placeholder
        ? placeholder
        : mode === "classes" || mode === "templates"
          ? "Select a class…"
          : "Select a substance…";

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-label={ariaLabel}
          disabled={!molecules}
          className="w-full justify-between sm:w-[22rem]"
        >
          <span className="flex min-w-0 items-center gap-2">
            <Icon
              icon={mode === "substances" ? "lucide:pill" : "lucide:hexagon"}
              size={15}
              className="theme-text-faint shrink-0"
            />
            <span className={cn("truncate", !current && "theme-text-muted")}>{label}</span>
            {current?.hasOverride ? (
              <EditorStatusPill tone="info" icon="lucide:pencil" className="shrink-0" title={SAVED_PILL_TITLE}>
                {mode === "classes" ? "override" : "saved"}
              </EditorStatusPill>
            ) : null}
            {current?.publiclyListed ? (
              <EditorStatusPill tone="success" icon="lucide:globe" className="shrink-0" title={PUBLISHED_PILL_TITLE}>
                published
              </EditorStatusPill>
            ) : null}
          </span>
          <Icon icon="lucide:chevrons-up-down" size={15} className="theme-text-faint ml-2 shrink-0" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[min(26rem,90vw)] p-0" align="start">
        <Command>
          <CommandInput
            placeholder={
              searchPlaceholder ??
              (mode === "classes" || mode === "templates"
                ? "Search by label or key…"
                : "Search by name or slug…")
            }
          />
          <CommandList>
            <CommandEmpty>No molecules found</CommandEmpty>
            {groups.map((group) => (
              <CommandGroup key={group.key} heading={group.heading}>
                {group.items.map((molecule) => (
                  <CommandItem
                    key={molecule.slug}
                    value={`${molecule.title} ${molecule.slug}`}
                    onSelect={() => {
                      onSelect(molecule.slug);
                      setOpen(false);
                    }}
                  >
                    <Icon
                      icon="lucide:check"
                      size={15}
                      className={cn("mr-2 shrink-0", selected === molecule.slug ? "opacity-100" : "opacity-0")}
                    />
                    <span className="truncate font-medium">{molecule.title}</span>
                    <span className="theme-text-faint ml-2 shrink-0 text-xs">{molecule.slug}</span>
                    <span className="ml-auto flex shrink-0 items-center gap-1.5">
                      {molecule.hasOverride ? (
                        <EditorStatusPill tone="info" title={SAVED_PILL_TITLE}>
                          {mode === "classes" ? "override" : "saved"}
                        </EditorStatusPill>
                      ) : null}
                      {molecule.publiclyListed ? (
                        <EditorStatusPill tone="success" title={PUBLISHED_PILL_TITLE}>published</EditorStatusPill>
                      ) : null}
                    </span>
                  </CommandItem>
                ))}
              </CommandGroup>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
