"use client";

import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { useState, type FormEvent, type ReactNode } from "react";
import { Icon, type IconName } from "@/components/common/Icon";
import { IndexCard, IndexCardCountBadge, IndexCardSection } from "@/components/common/IndexCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { SearchablePicker, type SearchablePickerOption } from "@/features/dev/components";
import { getCategoryIcon } from "@/data/config/categoryIcons";
import { cn } from "@/lib/utils";
import type { BoardCategory, BoardDestination, BoardSection } from "./boardModel";
import { LayoutDrugRow, rowId } from "./LayoutDrugRow";
import type { LayoutSlot, MoveDirection } from "./layoutOps";

const CARD_CONTROL_CLASS =
  "h-7 gap-1 rounded-lg px-2 text-xs";

export interface BoardActions {
  destinations: readonly BoardDestination[];
  /** Substances not yet placed anywhere in this dataset, for the add rows. */
  addOptions: readonly SearchablePickerOption[];
  onBump: (slot: LayoutSlot, slug: string, direction: MoveDirection) => void;
  onMove: (from: LayoutSlot, slug: string, to: LayoutSlot) => void;
  onRemoveSlug: (slot: LayoutSlot, slug: string) => void;
  onAddSlug: (slot: LayoutSlot, slug: string) => void;
  onSortSlot: (slot: LayoutSlot) => void;
  onPlaceSection: (categoryKey: string, sectionKey: string, targetSectionKey: string, placement: "before" | "after") => void;
  onRenameSection: (categoryKey: string, sectionKey: string, label: string) => void;
  onAddSection: (categoryKey: string, label: string) => void;
  onRemoveSection: (categoryKey: string, sectionKey: string) => void;
  onUpdateCategory: (categoryKey: string, patch: { label?: string; iconKey?: string }) => void;
  onRemoveCategory: (categoryKey: string) => void;
}

/** One text field in a popover: rename a section, name a new one. */
function NamePopover({
  trigger,
  title,
  initial,
  submitLabel,
  onSubmit,
}: {
  trigger: ReactNode;
  title: string;
  initial: string;
  submitLabel: string;
  onSubmit: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(initial);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!value.trim()) return;
    onSubmit(value);
    setOpen(false);
  };
  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) setValue(initial);
      }}
    >
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent align="end" className="w-64 p-3">
        <form onSubmit={submit} className="space-y-2">
          <label className="theme-text-faint block text-[11px] uppercase tracking-[0.18em]" htmlFor={`name-${title}`}>
            {title}
          </label>
          <Input
            id={`name-${title}`}
           
            value={value}
            onChange={(event) => setValue(event.target.value)}
            inputSize="sm"
          />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="accent" size="sm" disabled={!value.trim()}>
              {submitLabel}
            </Button>
          </div>
        </form>
      </PopoverContent>
    </Popover>
  );
}

/** Label and icon key for a category, with the icon previewed as it resolves. */
function CategoryIdentityPopover({
  category,
  onSubmit,
}: {
  category: BoardCategory;
  onSubmit: (patch: { label: string; iconKey: string }) => void;
}) {
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState(category.label);
  const [iconKey, setIconKey] = useState(category.iconKey);
  const preview: IconName = getCategoryIcon(iconKey || category.key);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!label.trim()) return;
    onSubmit({ label, iconKey });
    setOpen(false);
  };
  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) {
          setLabel(category.label);
          setIconKey(category.iconKey);
        }
      }}
    >
      <PopoverTrigger asChild>
        <Button type="button" variant="ghost" size="auto" className={CARD_CONTROL_CLASS} aria-label={`Edit ${category.label}`}>
          <Icon icon="lucide:pencil" size={13} />
          Edit
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 p-3">
        <form onSubmit={submit} className="space-y-3">
          <div className="space-y-1">
            <label className="theme-text-faint block text-[11px] uppercase tracking-[0.18em]" htmlFor={`label-${category.key}`}>
              Category name
            </label>
            <Input id={`label-${category.key}`} value={label} onChange={(event) => setLabel(event.target.value)} inputSize="sm" />
          </div>
          <div className="space-y-1">
            <label className="theme-text-faint block text-[11px] uppercase tracking-[0.18em]" htmlFor={`icon-${category.key}`}>
              Icon key
            </label>
            <div className="flex items-center gap-2">
              <span className="theme-index-card-icon flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ring-1 ring-white/10">
                <Icon icon={preview} size={18} className="theme-index-card-icon-glyph" />
              </span>
              <Input id={`icon-${category.key}`} value={iconKey} onChange={(event) => setIconKey(event.target.value)} inputSize="sm" placeholder="psychedelic or lucide:zap" />
            </div>
            <p className="theme-text-faint text-xs">A class name from the icon map, or any iconify name.</p>
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="accent" size="sm" disabled={!label.trim()}>
              Save
            </Button>
          </div>
        </form>
      </PopoverContent>
    </Popover>
  );
}

function SectionBlock({
  category,
  section,
  previous,
  next,
  showHeader,
  actions,
}: {
  category: BoardCategory;
  section: BoardSection;
  previous: BoardSection | null;
  next: BoardSection | null;
  showHeader: boolean;
  actions: BoardActions;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: section.id });
  const sectionKey = section.slot.sectionKey;
  const movable = sectionKey !== null && !section.isGeneral;
  const canUp = movable && previous !== null && previous.slot.sectionKey !== null && previous.rank === section.rank;
  const canDown = movable && next !== null && next.slot.sectionKey !== null && next.rank === section.rank;
  const pinNote =
    section.rank === 0 ? "Common leads its category on the site" : section.rank === 2 ? "Other closes its category on the site" : null;
  const ids = section.items.map((item) => rowId(section.slot, item.slug));

  return (
    <div>
      {showHeader && section.label !== undefined ? (
        <div className="group/section mb-1.5 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
          <p className="theme-index-card-section-label flex min-w-0 max-w-full flex-wrap items-center gap-x-2 gap-y-1 text-[0.78rem] font-semibold uppercase tracking-[0.18em]">
            <span className="min-w-0 break-words">{section.label}</span>
            <IndexCardCountBadge count={section.items.length} size="sm" />
            {section.hiddenOnSite ? (
              <span className="theme-text-faint normal-case tracking-normal" title="Empty sections do not render on the site">
                · not shown
              </span>
            ) : null}
          </p>
          <span className="ml-auto flex shrink-0 items-center opacity-0 transition-opacity group-hover/section:opacity-100 group-focus-within/section:opacity-100 [@media(pointer:coarse)]:opacity-100">
            {movable ? (
              <>
                <Button
                  type="button"
                  variant="ghost"
                  size="auto"
                  className="h-7 w-7 rounded-lg p-0"
                  disabled={!canUp}
                  title={!canUp && pinNote ? pinNote : undefined}
                  aria-label={`Move ${section.label} section up`}
                  onClick={() => previous && actions.onPlaceSection(category.key, sectionKey, previous.slot.sectionKey!, "before")}
                >
                  <Icon icon="lucide:chevron-up" size={15} />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="auto"
                  className="h-7 w-7 rounded-lg p-0"
                  disabled={!canDown}
                  title={!canDown && pinNote ? pinNote : undefined}
                  aria-label={`Move ${section.label} section down`}
                  onClick={() => next && actions.onPlaceSection(category.key, sectionKey, next.slot.sectionKey!, "after")}
                >
                  <Icon icon="lucide:chevron-down" size={15} />
                </Button>
                <NamePopover
                  title="Section name"
                  initial={section.label}
                  submitLabel="Rename"
                  onSubmit={(value) => actions.onRenameSection(category.key, sectionKey, value)}
                  trigger={
                    <Button type="button" variant="ghost" size="auto" className="h-7 w-7 rounded-lg p-0" aria-label={`Rename ${section.label} section`}>
                      <Icon icon="lucide:pencil" size={13} />
                    </Button>
                  }
                />
              </>
            ) : null}
            <Button
              type="button"
              variant="ghost"
              size="auto"
              className="h-7 w-7 rounded-lg p-0"
              aria-label={`Sort ${section.label} A to Z`}
              title="Sort A to Z"
              onClick={() => actions.onSortSlot(section.slot)}
            >
              <Icon icon="lucide:arrow-down-a-z" size={14} />
            </Button>
            {movable ? (
              <Button
                type="button"
                variant="ghost"
                size="auto"
                className="h-7 w-7 rounded-lg p-0 hover:text-dose-danger"
                aria-label={`Remove ${section.label} section`}
                onClick={() => actions.onRemoveSection(category.key, sectionKey)}
              >
                <Icon icon="lucide:trash-2" size={13} />
              </Button>
            ) : null}
          </span>
        </div>
      ) : null}
      <SortableContext id={section.id} items={ids} strategy={verticalListSortingStrategy}>
        <ul
          ref={setNodeRef}
          className={cn(
            "-mb-1 min-h-[2.25rem] space-y-0.5 rounded-xl pb-1 transition-colors",
            isOver && "bg-dose-surface-muted ring-1 ring-dose-accent-strong",
          )}
          aria-label={section.label ? `${section.label} substances` : `${category.label} substances`}
        >
          {section.items.length === 0 ? (
            <li className="theme-text-faint px-3 py-2 text-sm italic">Drop a substance here</li>
          ) : null}
          {section.items.map((item, index) => (
            <LayoutDrugRow
              key={rowId(section.slot, item.slug)}
              slot={section.slot}
              item={item}
              index={index}
              count={section.items.length}
              destinations={actions.destinations}
              onBump={actions.onBump}
              onMove={actions.onMove}
              onRemove={actions.onRemoveSlug}
            />
          ))}
        </ul>
      </SortableContext>
      <div className="mt-0.5">
        <SearchablePicker
          options={actions.addOptions}
          value={null}
          onChange={(slug) => {
            if (slug) actions.onAddSlug(section.slot, slug);
          }}
          placeholder="Add substance"
          triggerVariant="quiet"
          emptyText="Every substance is already placed in this index."
          ariaLabel={`Add a substance to ${section.label ?? category.label}`}
        />
      </div>
    </div>
  );
}

export interface IndexLayoutCardProps {
  category: BoardCategory;
  /** Which of the category's sections this panel carries; the whole category by default. */
  sections?: readonly BoardSection[];
  /** Panel title; defaults to the category label. */
  title?: string;
  hideIcon?: boolean;
  /** Hide section headings when the panel is one section shown on its own. */
  showSectionHeaders?: boolean;
  /** Category-level chrome (edit, add section, remove) belongs on the category panel only. */
  showCategoryTools?: boolean;
  actions: BoardActions;
}

/**
 * An index panel exactly as the public page draws it, with editing chrome
 * threaded through: the category's own tools sit in a quiet strip under the
 * header, each section carries its handles in its heading, and every list ends
 * with an add row.
 */
export function IndexLayoutCard({
  category,
  sections = category.sections,
  title = category.label,
  hideIcon = false,
  showSectionHeaders = true,
  showCategoryTools = true,
  actions,
}: IndexLayoutCardProps) {
  const count = sections === category.sections ? category.total : new Set(sections.flatMap((section) => section.items.filter((item) => !item.hiddenOnSite).map((item) => item.slug))).size;

  return (
    <IndexCard
      title={title}
      icon={category.icon}
      count={count}
      hideIcon={hideIcon}
      contentId={`layout-card-${category.key}-${sections === category.sections ? "all" : sections[0]?.id ?? "empty"}`}
      description={category.hiddenOnSite && showCategoryTools ? "Empty categories do not render on the site." : undefined}
    >
      {showCategoryTools ? (
        <div className="mb-3 flex flex-wrap items-center gap-1 border-b border-[color:var(--editor-panel-border)] pb-2">
          <CategoryIdentityPopover
            category={category}
            onSubmit={(patch) => actions.onUpdateCategory(category.key, patch)}
          />
          <NamePopover
            title="New section"
            initial=""
            submitLabel="Add section"
            onSubmit={(value) => actions.onAddSection(category.key, value)}
            trigger={
              <Button type="button" variant="ghost" size="auto" className={CARD_CONTROL_CLASS}>
                <Icon icon="lucide:plus" size={13} />
                Section
              </Button>
            }
          />
          <Button
            type="button"
            variant="ghost"
            size="auto"
            className={cn(CARD_CONTROL_CLASS, "ml-auto hover:text-dose-danger")}
            aria-label={`Remove ${category.label} category`}
            onClick={() => actions.onRemoveCategory(category.key)}
          >
            <Icon icon="lucide:trash-2" size={13} />
            Remove
          </Button>
        </div>
      ) : null}
      <div className="min-w-0 space-y-6">
        {sections.map((section, index) => (
          <IndexCardSection key={section.id} showDivider={index > 0}>
            <SectionBlock
              category={category}
              section={section}
              previous={index > 0 ? sections[index - 1] : null}
              next={index < sections.length - 1 ? sections[index + 1] : null}
              showHeader={showSectionHeaders}
              actions={actions}
            />
          </IndexCardSection>
        ))}
      </div>
    </IndexCard>
  );
}
