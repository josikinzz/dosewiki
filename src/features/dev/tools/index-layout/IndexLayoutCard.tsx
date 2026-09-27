"use client";

import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { IndexCard, IndexCardCountBadge, IndexCardSection } from "@/components/common/IndexCard";
import { SearchablePicker } from "@/features/dev/components/SearchablePicker";
import { cn } from "@/lib/utils";
import {
  CategoryMenu,
  SectionMenu,
  type BoardActions,
} from "./IndexLayoutCardMenus";
import type { BoardCategory, BoardSection } from "./boardModel";
import { LayoutDrugRow, rowId } from "./LayoutDrugRow";

/** The substances of one slot: a drop target, its rows, and the add row. */
function SlotList({
  category,
  section,
  actions,
}: {
  category: BoardCategory;
  section: BoardSection;
  actions: BoardActions;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: section.id });
  const listLabel = actions.listName(section.slot);

  return (
    <>
      <SortableContext
        id={section.id}
        items={section.items.map((item) => rowId(section.slot, item.slug))}
        strategy={verticalListSortingStrategy}
      >
        <ul
          ref={setNodeRef}
          className={cn(
            "-mb-1 min-h-[2.25rem] space-y-0.5 rounded-xl pb-1 transition-colors",
            isOver && "bg-dose-surface-muted ring-1 ring-dose-accent-strong",
          )}
          aria-label={`${listLabel}, ${section.items.length} ${section.items.length === 1 ? "substance" : "substances"}`}
        >
          {section.items.length === 0 ? (
            <li className="theme-text-faint px-3 py-2 text-sm">
              Empty. Drop a substance here or add one below.
            </li>
          ) : null}
          {section.items.map((item, index) => (
            <LayoutDrugRow
              key={rowId(section.slot, item.slug)}
              slot={section.slot}
              item={item}
              index={index}
              count={section.items.length}
              listLabel={listLabel}
              onBump={actions.onBump}
              onPlace={actions.onPlace}
              onRequestMove={actions.onRequestMove}
              onRemove={actions.onRemoveSlug}
              changed={actions.isChanged?.(section.slot, item.slug) ?? false}
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
    </>
  );
}

export interface IndexLayoutCardProps {
  category: BoardCategory;
  /** The sections this panel carries, in render order. */
  sections: readonly BoardSection[];
  title: string;
  hideIcon?: boolean;
  /**
   * "category" draws the whole category: the header menu edits the category and
   * every section keeps its heading. "section" draws one section as its own
   * panel, the way a single-class tab does on the site, so the header menu
   * edits that section instead.
   */
  chrome: "category" | "section";
  /** Panel-order siblings, so a section knows what it can trade places with. */
  siblings?: readonly BoardSection[];
  actions: BoardActions;
}

/**
 * An index panel as the public page draws it, editable in place. The resting
 * composition is the reader's — icon, title, count, section labels, rows — and
 * the editing handles fade in on hover, on focus, or wherever the pointer is
 * coarse.
 */
export function IndexLayoutCard({
  category,
  sections,
  title,
  hideIcon = false,
  chrome,
  siblings = sections,
  actions,
}: IndexLayoutCardProps) {
  const visible = new Set<string>();
  for (const section of sections) {
    for (const item of section.items) {
      if (!item.hiddenOnSite) visible.add(item.slug);
    }
  }

  const single = chrome === "section" ? sections[0] : undefined;
  const singleIndex = single ? siblings.indexOf(single) : -1;

  return (
    <IndexCard
      title={title}
      icon={category.icon}
      count={visible.size}
      hideIcon={hideIcon}
      tone={category.hiddenOnSite ? "dim" : "default"}
      contentId={`layout-card-${single ? single.id : category.key}`}
      description={
        category.hiddenOnSite && chrome === "category"
          ? "Nothing visible here, so the site drops this panel."
          : undefined
      }
      actions={
        single ? (
          <SectionMenu
            categoryKey={category.key}
            categoryLabel={category.label}
            section={single}
            previous={singleIndex > 0 ? siblings[singleIndex - 1] : null}
            next={singleIndex >= 0 && singleIndex < siblings.length - 1 ? siblings[singleIndex + 1] : null}
            actions={actions}
          />
        ) : (
          <CategoryMenu category={category} actions={actions} />
        )
      }
    >
      <div className="min-w-0 space-y-6">
        {sections.map((section, index) => (
          <IndexCardSection key={section.id} showDivider={index > 0}>
            {chrome === "category" && section.label !== undefined ? (
              <div className="mb-2.5 flex min-w-0 items-center gap-x-2">
                <p className="theme-index-card-section-label flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-[0.78rem] font-semibold uppercase tracking-[0.18em]">
                  <span className="min-w-0 break-words">{section.label}</span>
                  <IndexCardCountBadge count={section.items.length} size="sm" />
                  {section.hiddenOnSite ? (
                    <span className="theme-text-faint text-xs font-normal normal-case tracking-normal">
                      <span className="sr-only">, </span>
                      not on the site, nothing visible
                    </span>
                  ) : null}
                </p>
                <span className="ml-auto flex shrink-0 items-center">
                  <SectionMenu
                    categoryKey={category.key}
                    categoryLabel={category.label}
                    section={section}
                    previous={index > 0 ? sections[index - 1] : null}
                    next={index < sections.length - 1 ? sections[index + 1] : null}
                    actions={actions}
                  />
                </span>
              </div>
            ) : null}
            <SlotList category={category} section={section} actions={actions} />
          </IndexCardSection>
        ))}
      </div>
    </IndexCard>
  );
}
