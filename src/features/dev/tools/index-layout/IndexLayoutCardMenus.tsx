"use client";

import { useId, useState, type FormEvent } from "react";

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
import { TOUCH_HALO } from "@/components/ui/touchTargets";
import { EditorField, type SearchablePickerOption } from "@/features/dev/components";
import { CATEGORY_ICON_KEYS, getCategoryIcon } from "@/data/config/categoryIcons";
import { cn } from "@/lib/utils";

import type { BoardCategory, BoardDestination, BoardSection } from "./boardModel";
import type { LayoutSlot, MoveDirection } from "./layoutOps";
import type { LayoutMoveRequest } from "./LayoutMoveDialog";
import type { RowPlace } from "./LayoutDrugRow";

const HANDLE_CLASS = cn(
  "theme-text-faint h-7 w-7 shrink-0 rounded-control p-0 transition-colors hover:text-dose-text group-hover:text-dose-text data-[state=open]:text-dose-text",
  TOUCH_HALO,
);

export interface BoardActions {
  destinations: readonly BoardDestination[];
  addOptions: readonly SearchablePickerOption[];
  listName: (slot: LayoutSlot) => string;
  onBump: (slot: LayoutSlot, slug: string, direction: MoveDirection) => void;
  onPlace?: (slot: LayoutSlot, slug: string, place: RowPlace) => void;
  onRequestMove: (request: LayoutMoveRequest) => void;
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
  isChanged?: (slot: LayoutSlot, slug: string) => boolean;
}

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
  const fieldId = useId();
  const unchanged = value.trim() === initial.trim() && initial.trim() !== "";
  const reason = !value.trim() ? "Type a name first." : unchanged ? "That is its name already." : null;

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
            if (reason) return;
            onSubmit(value.trim());
            onOpenChange(false);
          }}
        >
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>{description}</DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <EditorField label={fieldLabel} htmlFor={fieldId} description={reason && value ? reason : undefined}>
              <Input id={fieldId} value={value} onChange={(event) => setValue(event.target.value)} inputSize="sm" autoComplete="off" />
            </EditorField>
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="accent" size="sm" disabled={reason !== null}>
              {submitLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

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
  const labelId = useId();
  const iconId = useId();
  const preview: IconName = getCategoryIcon(iconKey || category.key);
  const unchanged = label.trim() === category.label && iconKey.trim() === category.iconKey;

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
            if (!label.trim() || unchanged) return;
            onSubmit({ label: label.trim(), iconKey: iconKey.trim() });
            onOpenChange(false);
          }}
        >
          <DialogHeader>
            <DialogTitle>{`${category.label}: name and icon`}</DialogTitle>
            <DialogDescription>Both show on the public index exactly as entered here.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <EditorField label="Name" htmlFor={labelId} description={!label.trim() ? "Type a name first." : undefined}>
              <Input id={labelId} value={label} onChange={(event) => setLabel(event.target.value)} inputSize="sm" autoComplete="off" />
            </EditorField>
            <EditorField
              label="Icon"
              htmlFor={iconId}
              description="A class name from the icon map (psychedelic) or any Iconify name (lucide:zap). Empty follows the category."
            >
              <div className="flex items-center gap-2">
                <span className="theme-index-card-icon flex h-10 w-10 shrink-0 items-center justify-center rounded-control ring-1 ring-dose-ring">
                  <Icon icon={preview} size={22} className="theme-index-card-icon-glyph" />
                  <span className="sr-only">Preview of the icon</span>
                </span>
                <Input
                  id={iconId}
                  value={iconKey}
                  onChange={(event) => setIconKey(event.target.value)}
                  inputSize="sm"
                  autoComplete="off"
                  spellCheck={false}
                  list={`${iconId}-keys`}
                />
                <datalist id={`${iconId}-keys`}>
                  {CATEGORY_ICON_KEYS.map((key) => <option key={key} value={key} />)}
                </datalist>
              </div>
            </EditorField>
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="accent" size="sm" disabled={!label.trim() || unchanged}>
              Save name and icon
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

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
            <Icon icon="lucide:pencil-line" size={15} />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-[min(16rem,calc(100vw-2rem))]">
          <div className="px-2 theme-text-primary py-2 text-sm font-medium">
            {category.label}
          </div>
          <DropdownMenuSeparator />
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
          {actions.onSortCategory ? (
            <DropdownMenuItem onSelect={() => actions.onSortCategory?.(category.key)}>
              <Icon icon="lucide:arrow-down-a-z" size={14} className="mr-2" />
              Sort every list A to Z
            </DropdownMenuItem>
          ) : null}
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
        description="A section groups some of the category's substances under their own heading. It starts empty."
        fieldLabel="Section name"
        initial=""
        submitLabel="Add section"
        onSubmit={(value) => actions.onAddSection(category.key, value)}
      />
    </>
  );
}

function MenuReason({ children }: { children: string }) {
  return <span className="theme-text-faint mt-0.5 block text-xs font-normal">{children}</span>;
}

export function SectionMenu({
  categoryKey,
  categoryLabel,
  section,
  previous,
  next,
  actions,
}: {
  categoryKey: string;
  categoryLabel?: string;
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
      ? "Common leads its category on the site."
      : section.rank === 2
        ? "Other closes its category on the site."
        : "Already at the end of its run.";
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
            <Icon icon="lucide:pencil-line" size={15} />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-[min(16rem,calc(100vw-2rem))]">
          <div className="px-2 space-y-0.5 py-2 font-normal">
            <span className="theme-text-primary block text-sm font-medium">{section.label ?? categoryLabel ?? "This list"}</span>
            {categoryLabel && section.label ? <span className="theme-text-muted block text-xs">{`In ${categoryLabel}`}</span> : null}
            {section.isGeneral ? (
              <span className="theme-text-muted block text-xs">The category&apos;s own list. It can be sorted, not renamed or removed.</span>
            ) : null}
          </div>
          <DropdownMenuSeparator />
          {editable ? (
            <>
              <DropdownMenuItem
                disabled={!canUp}
                onSelect={() =>
                  previous && actions.onPlaceSection(categoryKey, sectionKey, previous.slot.sectionKey!, "before")
                }
              >
                <Icon icon="lucide:chevron-up" size={14} className="mr-2 self-start mt-0.5" />
                <span>
                  Move up
                  {canUp ? null : <MenuReason>{pinNote}</MenuReason>}
                </span>
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={!canDown}
                onSelect={() => next && actions.onPlaceSection(categoryKey, sectionKey, next.slot.sectionKey!, "after")}
              >
                <Icon icon="lucide:chevron-down" size={14} className="mr-2 self-start mt-0.5" />
                <span>
                  Move down
                  {canDown ? null : <MenuReason>{pinNote}</MenuReason>}
                </span>
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
          {actions.onSortSlot ? (
            <DropdownMenuItem onSelect={() => actions.onSortSlot?.(section.slot)}>
              <Icon icon="lucide:arrow-down-a-z" size={14} className="mr-2" />
              Sort A to Z
            </DropdownMenuItem>
          ) : null}
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
          submitLabel="Rename section"
          onSubmit={(value) => actions.onRenameSection(categoryKey, sectionKey, value)}
        />
      ) : null}
    </>
  );
}
