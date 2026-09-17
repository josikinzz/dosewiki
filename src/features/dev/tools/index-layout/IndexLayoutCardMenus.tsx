"use client";

import { useState, type FormEvent } from "react";

import { Icon, type IconName } from "@/components/common/Icon";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import type { SearchablePickerOption } from "@/features/dev/components";
import { getCategoryIcon } from "@/data/config/categoryIcons";

import type { BoardCategory, BoardDestination, BoardSection } from "./boardModel";
import type { LayoutSlot, MoveDirection } from "./layoutOps";

/**
 * One 28px trigger, invisible until the card is hovered or holds focus. A
 * reader's panel and an editor's panel are the same object at rest, and a
 * single track costs the title far less width than a strip of icons.
 */
const HANDLE_CLASS =
  "h-7 w-7 shrink-0 rounded-lg p-0 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 data-[state=open]:opacity-100 [@media(pointer:coarse)]:opacity-100";

export interface BoardActions {
  destinations: readonly BoardDestination[];
  /** Substances not yet placed anywhere in this dataset, for the add rows. */
  addOptions: readonly SearchablePickerOption[];
  onBump: (slot: LayoutSlot, slug: string, direction: MoveDirection) => void;
  onMove: (from: LayoutSlot, slug: string, to: LayoutSlot) => void;
  onRemoveSlug: (slot: LayoutSlot, slug: string) => void;
  onAddSlug: (slot: LayoutSlot, slug: string) => void;
  onSortSlot?: (slot: LayoutSlot) => void;
  onSortCategory?: (categoryKey: string) => void;
  onPlaceSection: (
    categoryKey: string,
    sectionKey: string,
    targetSectionKey: string,
    placement: "before" | "after",
  ) => void;
  onRenameSection: (categoryKey: string, sectionKey: string, label: string) => void;
  onAddSection: (categoryKey: string, label: string) => void;
  onRemoveSection: (categoryKey: string, sectionKey: string) => void;
  onUpdateCategory: (categoryKey: string, patch: { label?: string; iconKey?: string }) => void;
  onRemoveCategory: (categoryKey: string) => void;
}

/** Name a section, or rename one. */
function NameDialog({
  open,
  onOpenChange,
  title,
  description,
  fieldLabel,
  initial,
  submitLabel,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  fieldLabel: string;
  initial: string;
  submitLabel: string;
  onSubmit: (value: string) => void;
}) {
  const [value, setValue] = useState(initial);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (next) setValue(initial);
      }}
    >
      <DialogContent className="max-w-sm">
        <form
          onSubmit={(event: FormEvent) => {
            event.preventDefault();
            if (!value.trim()) return;
            onSubmit(value);
            onOpenChange(false);
          }}
        >
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>{description}</DialogDescription>
          </DialogHeader>
          <div className="space-y-1 py-4">
            <label className="theme-text-faint block text-[11px] uppercase tracking-[0.18em]" htmlFor="layout-name">
              {fieldLabel}
            </label>
            <Input
              id="layout-name"
              value={value}
              onChange={(event) => setValue(event.target.value)}
              inputSize="sm"
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="accent" size="sm" disabled={!value.trim()}>
              {submitLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Category name and icon, with the glyph previewed as the key resolves. */
function CategoryIdentityDialog({
  open,
  onOpenChange,
  category,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  category: BoardCategory;
  onSubmit: (patch: { label: string; iconKey: string }) => void;
}) {
  const [label, setLabel] = useState(category.label);
  const [iconKey, setIconKey] = useState(category.iconKey);
  const preview: IconName = getCategoryIcon(iconKey || category.key);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (next) {
          setLabel(category.label);
          setIconKey(category.iconKey);
        }
      }}
    >
      <DialogContent className="max-w-sm">
        <form
          onSubmit={(event: FormEvent) => {
            event.preventDefault();
            if (!label.trim()) return;
            onSubmit({ label, iconKey });
            onOpenChange(false);
          }}
        >
          <DialogHeader>
            <DialogTitle>Category name and icon</DialogTitle>
            <DialogDescription>Both show on the public index exactly as entered here.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-1">
              <label
                className="theme-text-faint block text-[11px] uppercase tracking-[0.18em]"
                htmlFor="layout-category-label"
              >
                Name
              </label>
              <Input
                id="layout-category-label"
                value={label}
                onChange={(event) => setLabel(event.target.value)}
                inputSize="sm"
              />
            </div>
            <div className="space-y-1">
              <label
                className="theme-text-faint block text-[11px] uppercase tracking-[0.18em]"
                htmlFor="layout-category-icon"
              >
                Icon key
              </label>
              <div className="flex items-center gap-2">
                <span className="theme-index-card-icon flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ring-1 ring-dose-ring">
                  <Icon icon={preview} size={20} className="theme-index-card-icon-glyph" />
                </span>
                <Input
                  id="layout-category-icon"
                  value={iconKey}
                  onChange={(event) => setIconKey(event.target.value)}
                  inputSize="sm"
                  placeholder="psychedelic or lucide:zap"
                />
              </div>
              <p className="theme-text-faint text-xs">A class name from the icon map, or any iconify name.</p>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="accent" size="sm" disabled={!label.trim()}>
              Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Everything you can do to one category, behind one trigger. */
export function CategoryMenu({ category, actions }: { category: BoardCategory; actions: BoardActions }) {
  const [dialog, setDialog] = useState<"identity" | "section" | null>(null);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="auto"
            className={HANDLE_CLASS}
            aria-label={`Edit the ${category.label} category`}
          >
            <Icon icon="lucide:ellipsis" size={15} />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-[13rem]">
          <DropdownMenuItem
            onSelect={(event) => {
              event.preventDefault();
              setDialog("identity");
            }}
          >
            <Icon icon="lucide:pencil" size={14} className="mr-2" />
            Name and icon
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={(event) => {
              event.preventDefault();
              setDialog("section");
            }}
          >
            <Icon icon="lucide:plus" size={14} className="mr-2" />
            Add a section
          </DropdownMenuItem>
          {actions.onSortCategory && <DropdownMenuItem onSelect={() => actions.onSortCategory?.(category.key)}>
            <Icon icon="lucide:arrow-down-a-z" size={14} className="mr-2" />
            Sort every list A to Z
          </DropdownMenuItem>}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            className="text-dose-danger focus:text-dose-danger"
            onSelect={() => actions.onRemoveCategory(category.key)}
          >
            <Icon icon="lucide:trash-2" size={14} className="mr-2" />
            Remove category
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <CategoryIdentityDialog
        open={dialog === "identity"}
        onOpenChange={(open) => setDialog(open ? "identity" : null)}
        category={category}
        onSubmit={(patch) => actions.onUpdateCategory(category.key, patch)}
      />
      <NameDialog
        open={dialog === "section"}
        onOpenChange={(open) => setDialog(open ? "section" : null)}
        title={`New section in ${category.label}`}
        description="Sections group a category's substances under their own heading."
        fieldLabel="Section name"
        initial=""
        submitLabel="Add section"
        onSubmit={(value) => actions.onAddSection(category.key, value)}
      />
    </>
  );
}

/**
 * Everything you can do to one section. Common and Other are pinned by the
 * page's own ordering rule, so their move entries carry the reason instead of
 * disappearing.
 */
export function SectionMenu({
  categoryKey,
  section,
  previous,
  next,
  actions,
}: {
  categoryKey: string;
  section: BoardSection;
  previous: BoardSection | null;
  next: BoardSection | null;
  actions: BoardActions;
}) {
  const [renaming, setRenaming] = useState(false);
  const sectionKey = section.slot.sectionKey;
  const editable = sectionKey !== null && !section.isGeneral;
  const canUp = editable && previous !== null && previous.slot.sectionKey !== null && previous.rank === section.rank;
  const canDown = editable && next !== null && next.slot.sectionKey !== null && next.rank === section.rank;
  const pinNote =
    section.rank === 0
      ? "Common leads its category on the site"
      : section.rank === 2
        ? "Other closes its category on the site"
        : "Already at the end of its run";
  const name = section.label ?? "list";

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="auto"
            className={HANDLE_CLASS}
            aria-label={`Edit the ${name} section`}
          >
            <Icon icon="lucide:ellipsis" size={15} />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-[13rem]">
          {editable ? (
            <>
              <DropdownMenuItem
                disabled={!canUp}
                title={canUp ? undefined : pinNote}
                onSelect={() =>
                  previous && actions.onPlaceSection(categoryKey, sectionKey, previous.slot.sectionKey!, "before")
                }
              >
                <Icon icon="lucide:chevron-up" size={14} className="mr-2" />
                Move up
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={!canDown}
                title={canDown ? undefined : pinNote}
                onSelect={() => next && actions.onPlaceSection(categoryKey, sectionKey, next.slot.sectionKey!, "after")}
              >
                <Icon icon="lucide:chevron-down" size={14} className="mr-2" />
                Move down
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={(event) => {
                  event.preventDefault();
                  setRenaming(true);
                }}
              >
                <Icon icon="lucide:pencil" size={14} className="mr-2" />
                Rename
              </DropdownMenuItem>
            </>
          ) : null}
          {actions.onSortSlot && <DropdownMenuItem onSelect={() => actions.onSortSlot?.(section.slot)}>
            <Icon icon="lucide:arrow-down-a-z" size={14} className="mr-2" />
            Sort A to Z
          </DropdownMenuItem>}
          {editable ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-dose-danger focus:text-dose-danger"
                onSelect={() => actions.onRemoveSection(categoryKey, sectionKey)}
              >
                <Icon icon="lucide:trash-2" size={14} className="mr-2" />
                Remove section
              </DropdownMenuItem>
            </>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
      {editable ? (
        <NameDialog
          open={renaming}
          onOpenChange={setRenaming}
          title={`Rename ${name}`}
          description="The heading readers see above this group."
          fieldLabel="Section name"
          initial={section.label ?? ""}
          submitLabel="Rename"
          onSubmit={(value) => actions.onRenameSection(categoryKey, sectionKey, value)}
        />
      ) : null}
    </>
  );
}
