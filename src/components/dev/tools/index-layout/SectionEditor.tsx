import { memo, useCallback, useId, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, GripVertical, SlidersHorizontal, Trash2 } from "lucide-react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { slugify } from "../../../../utils/slug";
import type { ManualSectionLinkType } from "../../../../data/builders/manualIndexLoader";
import type { ManualCategorySection, SubstanceOption, SlugStatus } from "./types";
import { ensureString } from "./utils";
import { AddSubstanceControl } from "./AddSubstanceControl";
import { SubstanceListItem } from "./SubstanceListItem";

interface SectionEditorProps {
  section: ManualCategorySection;
  sortableId: string;
  onUpdate: (next: ManualCategorySection) => void;
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

    const handleRemove = useCallback(() => {
      if (typeof window !== "undefined") {
        const confirmed = window.confirm(`Remove "${section.label}" section? This cannot be undone.`);
        if (!confirmed) {
          return;
        }
      }
      onRemove();
    }, [onRemove, section.label]);

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
      ? "relative space-y-3 pt-4 before:absolute before:left-0 before:right-0 before:top-0 before:h-px before:bg-[linear-gradient(90deg,rgba(255,255,255,0)_0%,rgba(255,255,255,0.12)_20%,rgba(255,255,255,0.12)_80%,rgba(255,255,255,0)_100%)] before:content-['']"
      : "space-y-3";

    const sectionSlugSet = useMemo(() => new Set(section.drugs.map((slug) => slugify(slug))), [section.drugs]);
    const sectionKeyId = useId();
    const sectionLinkTypeId = useId();
    const sectionLinkValueId = useId();
    const sectionNotesId = useId();

    return (
      <div ref={setNodeRef} style={dragStyle} className={sectionWrapperClass}>
        <header className="flex flex-wrap items-start gap-2 text-white/85">
          <Button
            variant="glass"
            size="icon"
            className="h-6 w-6 cursor-grab active:cursor-grabbing"
            aria-label="Drag section"
            {...attributes}
            {...listeners}
          >
            <GripVertical className="h-3.5 w-3.5" />
          </Button>
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <Input
              className="w-full text-sm font-semibold uppercase tracking-wide"
              placeholder="Section label"
              value={section.label}
              onChange={(event) => handleLabelChange(event.target.value)}
            />
            <p className="text-[10px] uppercase tracking-[0.3em] text-white/40">
              {section.drugs.length} substance{section.drugs.length === 1 ? "" : "s"}
            </p>
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="glass"
              size="icon"
              onClick={() => onMove("up")}
              disabled={isFirst}
              aria-label="Move section up"
              className="h-6 w-6"
            >
              <ArrowUp className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="glass"
              size="icon"
              onClick={() => onMove("down")}
              disabled={isLast}
              aria-label="Move section down"
              className="h-6 w-6"
            >
              <ArrowDown className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="glass"
              size="icon"
              onClick={() => setDetailsOpen((previous) => !previous)}
              aria-expanded={detailsOpen}
              aria-label="Toggle section details"
              className="h-6 w-6"
            >
              <SlidersHorizontal className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="glass"
              size="icon"
              onClick={handleRemove}
              className="hover:bg-rose-500/20 hover:text-rose-200 hover:ring-rose-400/40"
              aria-label="Remove section"
              className="h-6 w-6"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        </header>

        {detailsOpen && (
          <div className="rounded-2xl border border-white/10 bg-slate-950/50 p-4 text-sm text-white/75 shadow-inner shadow-black/20">
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1">
                <label htmlFor={sectionKeyId} className="text-xs uppercase tracking-wide text-white/60">Section key</label>
                <Input
                  id={sectionKeyId}
                  className="w-full"
                  placeholder="Section key"
                  value={section.key}
                  onChange={(event) => handleKeyChange(event.target.value)}
                />
              </div>
              <div className="space-y-1">
                <label htmlFor={sectionLinkTypeId} className="text-xs uppercase tracking-wide text-white/60">Link type</label>
                <Select
                  value={section.link?.type ?? ""}
                  onValueChange={(value) => handleLinkTypeChange(value as ManualSectionLinkType | "")}
                >
                  <SelectTrigger id={sectionLinkTypeId} className="w-full">
                    <SelectValue placeholder="No link" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">No link</SelectItem>
                    <SelectItem value="chemicalClass">Chemical class</SelectItem>
                    <SelectItem value="psychoactiveClass">Psychoactive class</SelectItem>
                    <SelectItem value="mechanism">Mechanism</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            {section.link?.type && (
              <div className="space-y-1">
                <label htmlFor={sectionLinkValueId} className="text-xs uppercase tracking-wide text-white/60">Link value</label>
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
              <label htmlFor={sectionNotesId} className="text-xs uppercase tracking-wide text-white/60">Editor notes</label>
              <Textarea
                id={sectionNotesId}
                className="min-h-[80px] w-full"
                value={section.notes ?? ""}
                onChange={(event) => handleNotesChange(event.target.value)}
                placeholder="Optional editor notes"
              />
            </div>
          </div>
        )}

        <div className={`space-y-3 ${isDragging ? "opacity-60" : ""}`}>
          {section.drugs.length > 0 ? (
            <ul className="space-y-1 text-sm text-white/85">
              {sortedSectionDrugs.map((slug) => (
                <SubstanceListItem
                  key={slug}
                  status={slugStatuses.get(slug) ?? { slug, issues: [] }}
                  onRemove={() => handleSlugRemove(slug)}
                />
              ))}
            </ul>
          ) : (
            <p className="rounded-xl border border-white/10 bg-slate-950/50 px-3 py-4 text-sm text-white/60 shadow-inner shadow-black/20">
              No substances added yet.
            </p>
          )}
          <AddSubstanceControl
            label="Add new substance to section..."
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
