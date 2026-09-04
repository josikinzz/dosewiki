import { memo, useCallback, useId, useMemo, useState } from "react";
import { Icon } from "@/components/common/Icon";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EmptyStateSurface } from "@/components/ui/surface";
import { slugify } from "@/utils/slug";
import type { ManualSectionLinkType } from "@/data/builders/manualIndexLoader";
import type { ManualCategorySection, SubstanceOption, SlugStatus } from "./types";
import { ensureString, iconButtonClass, inlineLabelInputClass } from "./utils";
import { AddSubstanceControl } from "./AddSubstanceControl";
import { SubstanceListItem } from "./SubstanceListItem";

interface SectionEditorProps {
  section: ManualCategorySection;
  sortableId: string;
  onUpdate: (next: ManualCategorySection) => void;
  /** Confirmed upstream: the tab owns the remove dialog. */
  onRemove: () => void;
  onMove: (direction: "up" | "down") => void;
  isFirst: boolean;
  isLast: boolean;
  showTopDivider: boolean;
  substanceOptions: SubstanceOption[];
  slugStatuses: Map<string, SlugStatus>;
  categorySlugSet: ReadonlySet<string>;
  datasetSlugSet: ReadonlySet<string>;
  sortSlugsWithCommonPriority: (slugs: readonly string[]) => string[];
}

export const SectionEditor = memo(
  ({
    section,
    sortableId,
    onUpdate,
    onRemove,
    onMove,
    isFirst,
    isLast,
    showTopDivider,
    substanceOptions,
    slugStatuses,
    categorySlugSet,
    datasetSlugSet,
    sortSlugsWithCommonPriority,
  }: SectionEditorProps) => {
    const {
      attributes,
      listeners,
      setNodeRef,
      transform,
      transition,
      isDragging,
    } = useSortable({ id: sortableId });
    const dragStyle = {
      transform: CSS.Transform.toString(transform),
      transition,
    };
    const handleSlugAdd = useCallback(
      (slug: string) => {
        const nextDrugs = sortSlugsWithCommonPriority([...section.drugs, slug]);
        onUpdate({ ...section, drugs: nextDrugs });
      },
      [onUpdate, section, sortSlugsWithCommonPriority],
    );

    const handleSlugRemove = useCallback(
      (slug: string) => {
        const nextDrugs = sortSlugsWithCommonPriority(
          section.drugs.filter((entry) => entry !== slug),
        );
        onUpdate({ ...section, drugs: nextDrugs });
      },
      [onUpdate, section, sortSlugsWithCommonPriority],
    );

    const handleLabelChange = useCallback(
      (value: string) => {
        onUpdate({ ...section, label: value });
      },
      [onUpdate, section],
    );

    const handleKeyChange = useCallback(
      (value: string) => {
        onUpdate({ ...section, key: value });
      },
      [onUpdate, section],
    );

    const handleNotesChange = useCallback(
      (value: string) => {
        onUpdate({ ...section, notes: value });
      },
      [onUpdate, section],
    );

    const handleLinkTypeChange = useCallback(
      (type: ManualSectionLinkType | "") => {
        if (!type) {
          const { link: _link, ...rest } = section;
          onUpdate(rest);
          return;
        }
        const value = section.link?.value ?? "";
        onUpdate({ ...section, link: { type, value } });
      },
      [onUpdate, section],
    );

    const handleLinkValueChange = useCallback(
      (value: string) => {
        const normalized = ensureString(value);
        if (!section.link) {
          onUpdate({ ...section, link: { type: "chemicalClass", value: normalized } });
          return;
        }
        onUpdate({ ...section, link: { ...section.link, value: normalized } });
      },
      [onUpdate, section],
    );

    const [detailsOpen, setDetailsOpen] = useState(false);
    const sortedSectionDrugs = useMemo(
      () => sortSlugsWithCommonPriority(section.drugs),
      [section.drugs, sortSlugsWithCommonPriority],
    );

    const sectionWrapperClass = showTopDivider
      ? "relative space-y-3 pt-4 before:absolute before:left-0 before:right-0 before:top-0 before:h-px before:bg-[image:var(--theme-horizontal-divider-image)] before:content-['']"
      : "space-y-3";

    const sectionSlugSet = useMemo(() => new Set(section.drugs.map((slug) => slugify(slug))), [section.drugs]);
    const sectionKeyId = useId();
    const sectionLinkTypeId = useId();
    const sectionLinkValueId = useId();
    const sectionNotesId = useId();

    return (
      <div ref={setNodeRef} style={dragStyle} className={sectionWrapperClass}>
        <header className="theme-text-secondary flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <Button
              variant="glass"
              size="icon"
              className={`${iconButtonClass} shrink-0 cursor-grab touch-none active:cursor-grabbing`}
              aria-label="Drag section"
              {...attributes}
              {...listeners}
            >
              <Icon icon="lucide:grip-vertical" className="h-3.5 w-3.5" size={14} />
            </Button>
            {/* Long section names outgrow the card column, so the label edits through a
                wrap-capable textarea that auto-grows via field-sizing while staying a
                one-line value (matches the category label treatment). */}
            <Textarea
              rows={1}
              className={`${inlineLabelInputClass} min-h-0 min-w-0 flex-1 resize-none overflow-hidden field-sizing-content text-[16px] font-semibold uppercase leading-snug tracking-wide md:text-sm`}
              placeholder="Section label"
              aria-label="Section label"
              value={section.label}
              onChange={(event) => handleLabelChange(event.target.value.replace(/\r?\n/g, " "))}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                }
              }}
            />
          </div>
          <div className="flex flex-wrap items-center gap-2 pl-8">
            <p className="theme-text-faint text-[10px] uppercase tracking-[0.3em]">
              {section.drugs.length} substance{section.drugs.length === 1 ? "" : "s"}
            </p>
            <div className="ml-auto flex items-center gap-1">
              <Button
                variant="glass"
                size="icon"
                onClick={() => onMove("up")}
                disabled={isFirst}
                aria-label="Move section up"
                className={iconButtonClass}
              >
                <Icon icon="lucide:arrow-up" className="h-3.5 w-3.5" size={14} />
              </Button>
              <Button
                variant="glass"
                size="icon"
                onClick={() => onMove("down")}
                disabled={isLast}
                aria-label="Move section down"
                className={iconButtonClass}
              >
                <Icon icon="lucide:arrow-down" className="h-3.5 w-3.5" size={14} />
              </Button>
              <Button
                variant="glass"
                size="icon"
                onClick={() => setDetailsOpen((previous) => !previous)}
                aria-expanded={detailsOpen}
                aria-label="Toggle section details"
                className={iconButtonClass}
              >
                <Icon icon="lucide:sliders-horizontal" className="h-3.5 w-3.5" size={14} />
              </Button>
              <Button
                variant="ghostDestructive"
                size="icon"
                onClick={onRemove}
                aria-label="Remove section"
                className={`${iconButtonClass} ml-2`}
              >
                <Icon icon="lucide:trash-2" className="h-3.5 w-3.5" size={14} />
              </Button>
            </div>
          </div>
        </header>

        {detailsOpen && (
          <div className="theme-text-secondary space-y-3 text-sm">
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1">
                <label htmlFor={sectionKeyId} className="theme-text-muted text-xs uppercase tracking-wide">Section key</label>
                <Input
                  id={sectionKeyId}
                  className="w-full"
                  placeholder="Section key"
                  value={section.key}
                  onChange={(event) => handleKeyChange(event.target.value)}
                />
              </div>
              <div className="space-y-1">
                <label htmlFor={sectionLinkTypeId} className="theme-text-muted text-xs uppercase tracking-wide">Link type</label>
                <Select
                  value={section.link?.type ?? "none"}
                  onValueChange={(value) =>
                    handleLinkTypeChange(value === "none" ? "" : (value as ManualSectionLinkType))}
                >
                  <SelectTrigger id={sectionLinkTypeId} className="w-full">
                    <SelectValue placeholder="No link" />
                  </SelectTrigger>
                  <SelectContent>
                    {/* Radix SelectItem forbids empty-string values; "none" is the no-link sentinel. */}
                    <SelectItem value="none">No link</SelectItem>
                    <SelectItem value="chemicalClass">Chemical class</SelectItem>
                    <SelectItem value="psychoactiveClass">Psychoactive class</SelectItem>
                    <SelectItem value="mechanism">Mechanism</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            {section.link?.type && (
              <div className="space-y-1">
                <label htmlFor={sectionLinkValueId} className="theme-text-muted text-xs uppercase tracking-wide">Link value</label>
                <Input
                  id={sectionLinkValueId}
                  className="w-full"
                  placeholder="e.g. Tryptamine"
                  value={section.link?.value ?? ""}
                  onChange={(event) => handleLinkValueChange(event.target.value)}
                />
              </div>
            )}
            <div className="space-y-1">
              <label htmlFor={sectionNotesId} className="theme-text-muted text-xs uppercase tracking-wide">Editor notes</label>
              <Textarea
                id={sectionNotesId}
                className="min-h-[80px] w-full"
                value={section.notes ?? ""}
                onChange={(event) => handleNotesChange(event.target.value)}
                placeholder="Optional editor notes"
              />
              <p className="theme-text-faint text-xs">
                Editor-facing only, never rendered on /substances. Public index prose is a
                copy block; edit it in Copy Studio.
              </p>
            </div>
          </div>
        )}

        <div className={`space-y-3 ${isDragging ? "opacity-60" : ""}`}>
          {section.drugs.length > 0 ? (
            <ul className="theme-text-secondary space-y-1 text-sm">
              {sortedSectionDrugs.map((slug) => (
                <SubstanceListItem
                  key={slug}
                  status={slugStatuses.get(slug) ?? { slug, issues: [] }}
                  onRemove={() => handleSlugRemove(slug)}
                />
              ))}
            </ul>
          ) : (
            <EmptyStateSurface padding="sm" radius="lg" className="theme-text-muted text-sm">
              No substances added yet.
            </EmptyStateSurface>
          )}
          <AddSubstanceControl
            label="Add substance…"
            existingSlugs={[...section.drugs]}
            onAdd={handleSlugAdd}
            options={substanceOptions}
            filterContext={{
              sectionSlugs: sectionSlugSet,
              categorySlugs: categorySlugSet,
              datasetSlugs: datasetSlugSet,
            }}
          />
        </div>
      </div>
    );
  },
  (previous, next) =>
    previous.section === next.section
    && previous.sortableId === next.sortableId
    && previous.isFirst === next.isFirst
    && previous.isLast === next.isLast
    && previous.showTopDivider === next.showTopDivider
    && previous.substanceOptions === next.substanceOptions
    && previous.slugStatuses === next.slugStatuses
    && previous.categorySlugSet === next.categorySlugSet
    && previous.datasetSlugSet === next.datasetSlugSet
    && previous.sortSlugsWithCommonPriority === next.sortSlugsWithCommonPriority
    && previous.onMove === next.onMove
    && previous.onRemove === next.onRemove
    && previous.onUpdate === next.onUpdate,
);
