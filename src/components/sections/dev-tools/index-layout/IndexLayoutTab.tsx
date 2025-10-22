import { memo, useCallback, useEffect, useId, useMemo, useState, type ReactNode } from "react";
import {
  AlertCircle,
  ArrowDown,
  ArrowDownAZ,
  ArrowLeftRight,
  ArrowUp,
  Braces,
  BrainCircuit,
  Check,
  Cog,
  Hexagon,
  Info,
  ListFilter,
  PlusCircle,
  RotateCcw,
  Save,
  SlidersHorizontal,
  Trash2,
  X,
  type LucideIcon,
} from "lucide-react";

import { IconBadge } from "../../../common/IconBadge";
import { JsonEditor } from "../../../common/JsonEditor";
import { useDevMode } from "../../../dev/DevModeContext";
import type {
  ManualCategoryDefinition,
  ManualCategorySection,
  ManualIndexConfig,
  ManualSectionLink,
  ManualSectionLinkType,
} from "../../../../data/manualIndexLoader";
import {
  allSubstanceRecords,
  allSubstancesBySlug,
} from "../../../../data/library";
import { getCategoryIcon } from "../../../../data/categoryIcons";
import { slugify } from "../../../../utils/slug";

interface IndexLayoutTabProps {
  baseInputClass: string;
  baseSelectClass: string;
  pillButtonBaseClass: string;
  commitPanel?: ReactNode;
}

type SubstanceOption = {
  slug: string;
  name: string;
  alias?: string;
  isHidden: boolean;
};

type SlugIssue = "missing" | "hidden" | "duplicate";

type SlugStatus = {
  slug: string;
  name?: string;
  alias?: string;
  issues: SlugIssue[];
};

const deepClone = <T,>(value: T): T => JSON.parse(JSON.stringify(value));

const areStringArraysEqual = (first: readonly string[], second: readonly string[]): boolean => {
  if (first === second) {
    return true;
  }
  if (first.length !== second.length) {
    return false;
  }
  for (let index = 0; index < first.length; index += 1) {
    if (first[index] !== second[index]) {
      return false;
    }
  }
  return true;
};

const areLinksEqual = (first?: ManualSectionLink, second?: ManualSectionLink): boolean => {
  if (first === second) {
    return true;
  }
  if (!first || !second) {
    return false;
  }
  return first.type === second.type && first.value === second.value;
};

const areSectionsEqual = (
  first: readonly ManualCategorySection[],
  second: readonly ManualCategorySection[],
): boolean => {
  if (first === second) {
    return true;
  }
  if (first.length !== second.length) {
    return false;
  }
  for (let index = 0; index < first.length; index += 1) {
    const sectionA = first[index];
    const sectionB = second[index];
    if (sectionA === sectionB) {
      continue;
    }
    if (
      sectionA.key !== sectionB.key
      || sectionA.label !== sectionB.label
      || sectionA.notes !== sectionB.notes
      || !areLinksEqual(sectionA.link, sectionB.link)
      || !areStringArraysEqual(sectionA.drugs, sectionB.drugs)
    ) {
      return false;
    }
  }
  return true;
};

const areCategoriesEqual = (
  first: readonly ManualCategoryDefinition[],
  second: readonly ManualCategoryDefinition[],
): boolean => {
  if (first === second) {
    return true;
  }
  if (first.length !== second.length) {
    return false;
  }
  for (let index = 0; index < first.length; index += 1) {
    const categoryA = first[index];
    const categoryB = second[index];
    if (categoryA === categoryB) {
      continue;
    }
    if (
      categoryA.key !== categoryB.key
      || categoryA.label !== categoryB.label
      || categoryA.iconKey !== categoryB.iconKey
      || categoryA.notes !== categoryB.notes
      || !areStringArraysEqual(categoryA.drugs, categoryB.drugs)
      || !areSectionsEqual(categoryA.sections, categoryB.sections)
    ) {
      return false;
    }
  }
  return true;
};

const areManualsEqual = (
  first: ManualIndexConfig,
  second: ManualIndexConfig,
): boolean => {
  if (first === second) {
    return true;
  }
  if (first.version !== second.version) {
    return false;
  }
  return areCategoriesEqual(first.categories, second.categories);
};

const formatSubstanceLabel = (option: SubstanceOption): string => {
  const parts = [option.name];
  if (option.alias) {
    parts.push(`(${option.alias})`);
  }
  if (option.isHidden) {
    parts.push("[Hidden]");
  }
  return parts.join(" ");
};

const slugIssueLabels: Record<SlugIssue, string> = {
  missing: "Missing",
  hidden: "Hidden",
  duplicate: "Duplicate",
};

const slugIssueColors: Record<SlugIssue, string> = {
  missing: "bg-rose-500/20 text-rose-200",
  hidden: "bg-amber-500/20 text-amber-200",
  duplicate: "bg-blue-500/20 text-blue-200",
};

const COMMON_TAG = "common";

const normalizeTag = (value: string): string => value.trim().toLowerCase();

const commonSlugSet = new Set<string>(
  allSubstanceRecords
    .filter((record) => {
      const candidates = [
        ...(record.categories ?? []),
        ...(record.indexCategories ?? []),
      ];
      return candidates.some((category) => normalizeTag(category) === COMMON_TAG);
    })
    .map((record) => record.slug),
);

const isCommonSlug = (slug: string): boolean => {
  if (commonSlugSet.has(slug)) {
    return true;
  }
  const record = allSubstancesBySlug.get(slug);
  if (!record) {
    return false;
  }
  const candidates = [
    ...(record.categories ?? []),
    ...(record.indexCategories ?? []),
  ];
  const matches = candidates.some((category) => normalizeTag(category) === COMMON_TAG);
  if (matches) {
    commonSlugSet.add(slug);
  }
  return matches;
};

const getSlugSortName = (slug: string): string => allSubstancesBySlug.get(slug)?.name ?? slug;

const sortSlugsWithCommonPriority = (slugs: readonly string[]): string[] =>
  slugs
    .map((slug) => ({
      slug,
      isCommon: isCommonSlug(slug),
      name: getSlugSortName(slug),
    }))
    .sort((first, second) => {
      if (first.isCommon !== second.isCommon) {
        return first.isCommon ? -1 : 1;
      }
      return first.name.localeCompare(second.name, undefined, {
        sensitivity: "base",
        numeric: true,
      });
    })
    .map((entry) => entry.slug);

const sortSectionsWithCommonPriority = (
  sections: readonly ManualCategorySection[],
): ManualCategorySection[] =>
  sections.map((section) => ({
    ...section,
    drugs: sortSlugsWithCommonPriority(section.drugs),
  }));

const sortSlugsAlphabetically = (slugs: readonly string[]): string[] =>
  [...slugs]
    .map((slug) => ({ slug, name: getSlugSortName(slug) }))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base", numeric: true }))
    .map((entry) => entry.slug);

type ManualDatasetKey = "psychoactive" | "chemical" | "mechanism";

const DATASET_ORDER: ManualDatasetKey[] = ["psychoactive", "chemical", "mechanism"];

const DATASET_TOGGLE_ACTIVE_CLASS =
  "group inline-flex items-center gap-2 rounded-full bg-gradient-to-tr from-fuchsia-500/25 via-fuchsia-500/10 to-white/10 px-5 py-2.5 text-sm font-medium text-white shadow-[0_18px_40px_-24px_rgba(155,65,255,0.6)] ring-1 ring-fuchsia-300/60 transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fuchsia-400";
const DATASET_TOGGLE_INACTIVE_CLASS =
  "group inline-flex items-center gap-2 rounded-full bg-gradient-to-tr from-white/12 via-white/5 to-white/0 px-5 py-2.5 text-sm font-medium text-white/75 ring-1 ring-white/15 transition hover:text-white hover:ring-white/30 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fuchsia-400";
const DATASET_TOGGLE_ICON_ACTIVE_CLASS = "h-5 w-5 text-fuchsia-100 drop-shadow";
const DATASET_TOGGLE_ICON_INACTIVE_CLASS = "h-5 w-5 text-fuchsia-200/70";
const DATASET_TOGGLE_LABEL_ACTIVE_CLASS = "tracking-wide text-white";
const DATASET_TOGGLE_LABEL_INACTIVE_CLASS = "tracking-wide text-white/80";

const sortSlugsForDataset = (
  dataset: ManualDatasetKey,
  slugs: readonly string[],
): string[] => {
  if (dataset === "psychoactive") {
    return sortSlugsWithCommonPriority(slugs);
  }
  return sortSlugsAlphabetically(slugs);
};

const sortSectionsForDataset = (
  dataset: ManualDatasetKey,
  sections: readonly ManualCategorySection[],
): ManualCategorySection[] => {
  if (dataset === "psychoactive") {
    return sortSectionsWithCommonPriority(sections);
  }

  return sections.map((section) => ({
    ...section,
    drugs: sortSlugsForDataset(dataset, section.drugs),
  }));
};

const organizeManualEntries = (
  dataset: ManualDatasetKey,
  manual: ManualIndexConfig,
): ManualIndexConfig => ({
  ...manual,
  categories: manual.categories.map((category) => ({
    ...category,
    drugs: sortSlugsForDataset(dataset, category.drugs),
    sections: sortSectionsForDataset(dataset, category.sections),
  })),
});

const normalizeManualOrdering = (
  dataset: ManualDatasetKey,
  manual: ManualIndexConfig,
): ManualIndexConfig => ({
  ...manual,
  categories: manual.categories.map((category) => ({
    ...category,
    drugs: sortSlugsForDataset(dataset, category.drugs),
    sections: category.sections.map((section) => ({
      ...section,
      drugs: sortSlugsForDataset(dataset, section.drugs),
    })),
  })),
});

const computeSlugCounts = (category: ManualCategoryDefinition): Map<string, number> => {
  const counts = new Map<string, number>();
  const register = (value: string) => {
    const normalized = slugify(value);
    if (!normalized) {
      return;
    }
    counts.set(normalized, (counts.get(normalized) ?? 0) + 1);
  };

  category.drugs.forEach(register);
  category.sections.forEach((section) => section.drugs.forEach(register));

  return counts;
};

const resolveSlugStatus = (slug: string, counts: Map<string, number>): SlugStatus => {
  const normalized = slugify(slug);
  const issues: SlugIssue[] = [];
  if (!normalized) {
    issues.push("missing");
    return { slug, issues };
  }

  const record = allSubstancesBySlug.get(normalized);
  if (!record) {
    issues.push("missing");
    return { slug, issues };
  }

  if (record.isHidden) {
    issues.push("hidden");
  }

  if ((counts.get(normalized) ?? 0) > 1) {
    issues.push("duplicate");
  }

  return {
    slug,
    name: record.name,
    alias: record.aliases?.[0],
    issues,
  };
};

const generateUniqueKey = (base: string, existing: Set<string>): string => {
  const normalizedBase = slugify(base) || "category";
  if (!existing.has(normalizedBase)) {
    return normalizedBase;
  }

  let suffix = 2;
  while (existing.has(`${normalizedBase}-${suffix}`)) {
    suffix += 1;
  }
  return `${normalizedBase}-${suffix}`;
};

const ensureString = (value: string): string => value.trim();

type AddSlugFilterMode = "all" | "missing-section" | "missing-category" | "missing-index";

interface SubstanceListItemProps {
  status: SlugStatus;
  onRemove: () => void;
}

function SubstanceListItem({ status, onRemove }: SubstanceListItemProps) {
  const displayName = status.name ?? status.slug;

  return (
    <li className="group flex items-center gap-2 py-1 text-sm text-white/85">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <span className="truncate font-semibold text-white">{displayName}</span>
          {status.alias && <span className="truncate text-xs text-white/60">({status.alias})</span>}
          {status.issues.map((issue) => (
            <span
              key={issue}
              className={`rounded-full px-2 py-0.5 text-[10px] uppercase tracking-wide ${
                issue === "duplicate" ? "" : "border border-current"
              } ${slugIssueColors[issue]}`}
            >
              {slugIssueLabels[issue]}
            </span>
          ))}
        </div>
      </div>
      <button
        type="button"
        onClick={onRemove}
        className="rounded-full p-1.5 text-white/60 transition group-hover:text-white hover:bg-rose-500/20 hover:text-rose-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-400"
        aria-label={`Remove ${displayName}`}
      >
        <Trash2 className="h-4 w-4" />
      </button>
    </li>
  );
}

interface AddSlugControlProps {
  label: string;
  existingSlugs: string[];
  onAdd: (slug: string) => void;
  options: SubstanceOption[];
  baseInputClass: string;
  baseSelectClass: string;
  pillButtonBaseClass: string;
  filterContext: {
    sectionSlugs: ReadonlySet<string>;
    categorySlugs: ReadonlySet<string>;
    datasetSlugs: ReadonlySet<string>;
  };
}

function AddSlugControl({
  label,
  existingSlugs,
  onAdd,
  options,
  baseInputClass,
  baseSelectClass,
  pillButtonBaseClass,
  filterContext,
}: AddSlugControlProps) {
  const filterSelectId = useId();
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [showPicker, setShowPicker] = useState(false);
  const [filterMode, setFilterMode] = useState<AddSlugFilterMode>("all");

  const existingSet = useMemo(() => new Set(existingSlugs.map((slug) => slugify(slug))), [existingSlugs]);

  const filteredOptions = useMemo(() => {
    if (filterMode === "all") {
      return options;
    }

    const scope =
      filterMode === "missing-section"
        ? filterContext.sectionSlugs
        : filterMode === "missing-category"
          ? filterContext.categorySlugs
          : filterContext.datasetSlugs;

    return options.filter((option) => {
      const normalized = slugify(option.slug);
      if (!normalized) {
        return false;
      }
      return !scope.has(normalized);
    });
  }, [filterContext.categorySlugs, filterContext.datasetSlugs, filterContext.sectionSlugs, filterMode, options]);

  useEffect(() => {
    if (!showPicker) {
      setFilterMode("all");
    }
  }, [showPicker]);

  const handleSubmit = useCallback(() => {
    const normalized = slugify(value);
    if (!normalized) {
      setError("Enter a substance slug");
      return;
    }
    if (existingSet.has(normalized)) {
      setError("Substance already listed");
      return;
    }
    onAdd(normalized);
    setValue("");
    setError(null);
  }, [existingSet, onAdd, value]);

  const handleSelect = useCallback(
    (slug: string) => {
      if (!slug) {
        return;
      }
      if (existingSet.has(slug)) {
        setError("Substance already listed");
        return;
      }
      onAdd(slug);
      setShowPicker(false);
      setError(null);
    },
    [existingSet, onAdd],
  );

  return (
    <div className="space-y-3 rounded-2xl border border-white/10 bg-slate-950/50 p-4 shadow-inner shadow-black/20">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <input
          value={value}
          onChange={(event) => {
            setValue(event.target.value);
            setError(null);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              handleSubmit();
            }
          }}
          className={`${baseInputClass} flex-1 bg-transparent`}
          placeholder={label}
        />
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleSubmit}
            className={`${pillButtonBaseClass} bg-fuchsia-500/20 text-fuchsia-200 hover:bg-fuchsia-500/30`}
            aria-label={label}
          >
            <PlusCircle className="h-4 w-4" />
            <span className="sr-only">{label}</span>
          </button>
          <button
            type="button"
            onClick={() => setShowPicker((previous) => !previous)}
            className={`${pillButtonBaseClass} bg-white/10 text-white/80 hover:bg-white/20`}
            aria-expanded={showPicker}
            aria-label="Browse substances"
          >
            <ListFilter className="h-4 w-4" />
            <span className="sr-only">Browse substances</span>
          </button>
        </div>
      </div>
      {error ? <p className="text-sm text-rose-300">{error}</p> : null}
      {showPicker && (
        <div className="rounded-xl border border-white/10 bg-slate-950/70 p-3 shadow-lg">
          <div className="flex flex-wrap items-center justify-between gap-2 pb-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-white/60">Select a substance</span>
            <div className="flex items-center gap-2">
              <label className="text-[10px] uppercase tracking-[0.3em] text-white/40" htmlFor={filterSelectId}>
                Filter
              </label>
              <select
                className={`${baseSelectClass} w-auto min-w-[11rem] bg-slate-950/80 text-xs`}
                id={filterSelectId}
                value={filterMode}
                onChange={(event) => setFilterMode(event.target.value as AddSlugFilterMode)}
              >
                <option value="all">All drugs</option>
                <option value="missing-section">Missing from section</option>
                <option value="missing-category">Missing from category</option>
                <option value="missing-index">Missing from index</option>
              </select>
              <button
                type="button"
                onClick={() => setShowPicker(false)}
                className="rounded-full bg-white/10 p-1 text-white/60 transition hover:bg-white/20 hover:text-white"
                aria-label="Close substance picker"
              >
                <X className="h-3.5 w-3.5" />
                <span className="sr-only">Close substance picker</span>
              </button>
            </div>
          </div>
          <div className="max-h-64 overflow-y-auto">
            {filteredOptions.length > 0 ? (
              <ul className="space-y-1 text-sm text-white/80">
                {filteredOptions.map((option) => (
                  <li key={option.slug}>
                    <button
                      type="button"
                      onClick={() => handleSelect(option.slug)}
                      className="w-full rounded-md px-2 py-1 text-left transition hover:bg-white/10 hover:text-fuchsia-200"
                    >
                      {formatSubstanceLabel(option)}
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="px-2 py-4 text-sm text-white/60">No substances match this filter.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

interface SectionEditorProps {
  section: ManualCategorySection;
  onUpdate: (next: ManualCategorySection) => void;
  onRemove: () => void;
  onMove: (direction: "up" | "down") => void;
  isFirst: boolean;
  isLast: boolean;
  showTopDivider: boolean;
  baseInputClass: string;
  baseSelectClass: string;
  pillButtonBaseClass: string;
  substanceOptions: SubstanceOption[];
  slugStatuses: Map<string, SlugStatus>;
  categorySlugSet: ReadonlySet<string>;
  datasetSlugSet: ReadonlySet<string>;
}

const SectionEditor = memo(
  ({
    section,
    onUpdate,
    onRemove,
    onMove,
    isFirst,
    isLast,
    showTopDivider,
    baseInputClass,
    baseSelectClass,
    pillButtonBaseClass,
    substanceOptions,
    slugStatuses,
    categorySlugSet,
    datasetSlugSet,
  }: SectionEditorProps) => {
    const handleSlugAdd = useCallback(
      (slug: string) => {
        const nextDrugs = sortSlugsWithCommonPriority([...section.drugs, slug]);
        onUpdate({ ...section, drugs: nextDrugs });
      },
      [onUpdate, section],
    );

    const handleSlugRemove = useCallback(
      (slug: string) => {
        const nextDrugs = sortSlugsWithCommonPriority(
          section.drugs.filter((entry) => entry !== slug),
        );
        onUpdate({ ...section, drugs: nextDrugs });
      },
      [onUpdate, section],
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
          const { link, ...rest } = section;
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
      [section.drugs],
    );

    const sectionWrapperClass = showTopDivider
      ? "relative space-y-4 pt-6 before:absolute before:left-0 before:right-0 before:top-0 before:h-px before:bg-[linear-gradient(90deg,rgba(255,255,255,0)_0%,rgba(255,255,255,0.12)_20%,rgba(255,255,255,0.12)_80%,rgba(255,255,255,0)_100%)] before:content-['']"
      : "space-y-4";

    const sectionSlugSet = useMemo(() => new Set(section.drugs.map((slug) => slugify(slug))), [section.drugs]);

    return (
      <div className={sectionWrapperClass}>
        <header className="flex flex-wrap items-start gap-2 text-white/85">
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <input
              className={`${baseInputClass} w-full text-sm font-semibold uppercase tracking-wide`}
              placeholder="Section label"
              value={section.label}
              onChange={(event) => handleLabelChange(event.target.value)}
            />
            <p className="text-[10px] uppercase tracking-[0.3em] text-white/40">
              {section.drugs.length} substance{section.drugs.length === 1 ? "" : "s"}
            </p>
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => onMove("up")}
              disabled={isFirst}
              className={`${pillButtonBaseClass} ${isFirst ? "cursor-not-allowed opacity-40" : "hover:bg-white/15"}`}
              aria-label="Move section up"
            >
              <ArrowUp className="h-4 w-4" />
              <span className="sr-only">Move section up</span>
            </button>
            <button
              type="button"
              onClick={() => onMove("down")}
              disabled={isLast}
              className={`${pillButtonBaseClass} ${isLast ? "cursor-not-allowed opacity-40" : "hover:bg-white/15"}`}
              aria-label="Move section down"
            >
              <ArrowDown className="h-4 w-4" />
              <span className="sr-only">Move section down</span>
            </button>
            <button
              type="button"
              onClick={() => setDetailsOpen((previous) => !previous)}
              className={`${pillButtonBaseClass} hover:bg-white/15`}
              aria-expanded={detailsOpen}
              aria-label="Toggle section details"
            >
              <SlidersHorizontal className="h-4 w-4" />
              <span className="sr-only">Toggle section details</span>
            </button>
            <button
              type="button"
              onClick={onRemove}
              className={`${pillButtonBaseClass} hover:bg-rose-500/20 hover:text-rose-200`}
              aria-label="Remove section"
            >
              <Trash2 className="h-4 w-4" />
              <span className="sr-only">Remove section</span>
            </button>
          </div>
        </header>

        {detailsOpen && (
          <div className="rounded-2xl border border-white/10 bg-slate-950/50 p-4 text-sm text-white/75 shadow-inner shadow-black/20">
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1">
                <label className="text-xs uppercase tracking-wide text-white/60">Section key</label>
                <input
                  className={`${baseInputClass} w-full`}
                  placeholder="Section key"
                  value={section.key}
                  onChange={(event) => handleKeyChange(event.target.value)}
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs uppercase tracking-wide text-white/60">Link type</label>
                <select
                  className={`${baseSelectClass} w-full`}
                  value={section.link?.type ?? ""}
                  onChange={(event) => handleLinkTypeChange(event.target.value as ManualSectionLinkType | "")}
                >
                  <option value="">No link</option>
                  <option value="chemicalClass">Chemical class</option>
                  <option value="psychoactiveClass">Psychoactive class</option>
                  <option value="mechanism">Mechanism</option>
                </select>
              </div>
            </div>
            {section.link?.type && (
              <div className="space-y-1">
                <label className="text-xs uppercase tracking-wide text-white/60">Link value</label>
                <input
                  className={`${baseInputClass} w-full`}
                  placeholder="e.g. Tryptamine"
                  value={section.link?.value ?? ""}
                  onChange={(event) => handleLinkValueChange(event.target.value)}
                />
              </div>
            )}
            <div className="space-y-1">
              <label className="text-xs uppercase tracking-wide text-white/60">Editor notes</label>
              <textarea
                className={`${baseInputClass} min-h-[80px] w-full`}
                value={section.notes ?? ""}
                onChange={(event) => handleNotesChange(event.target.value)}
                placeholder="Optional editor notes"
              />
            </div>
          </div>
        )}

        <div className="space-y-3">
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
          <AddSlugControl
            label="Add new substance to section..."
            existingSlugs={[...section.drugs]}
            onAdd={handleSlugAdd}
            options={substanceOptions}
            baseInputClass={baseInputClass}
            baseSelectClass={baseSelectClass}
            pillButtonBaseClass={pillButtonBaseClass}
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
    && previous.isFirst === next.isFirst
    && previous.isLast === next.isLast
    && previous.showTopDivider === next.showTopDivider
    && previous.baseInputClass === next.baseInputClass
    && previous.baseSelectClass === next.baseSelectClass
    && previous.pillButtonBaseClass === next.pillButtonBaseClass
    && previous.substanceOptions === next.substanceOptions
    && previous.slugStatuses === next.slugStatuses
    && previous.categorySlugSet === next.categorySlugSet
    && previous.datasetSlugSet === next.datasetSlugSet
    && previous.onMove === next.onMove
    && previous.onRemove === next.onRemove
    && previous.onUpdate === next.onUpdate,
);

interface CategoryEditorProps {
  category: ManualCategoryDefinition;
  index: number;
  total: number;
  onUpdateCategory: (
    index: number,
    updater: (current: ManualCategoryDefinition) => ManualCategoryDefinition,
  ) => void;
  onRemoveCategory: (index: number) => void;
  onMoveCategory: (index: number, direction: "up" | "down") => void;
  onAddSection: (index: number) => void;
  baseInputClass: string;
  baseSelectClass: string;
  pillButtonBaseClass: string;
  substanceOptions: SubstanceOption[];
  datasetSlugSet: ReadonlySet<string>;
}

const CategoryEditor = memo(
  ({
    category,
    index,
    total,
    onUpdateCategory,
    onRemoveCategory,
    onMoveCategory,
    onAddSection,
    baseInputClass,
    baseSelectClass,
    pillButtonBaseClass,
    substanceOptions,
    datasetSlugSet,
  }: CategoryEditorProps) => {
    const slugCounts = useMemo(() => computeSlugCounts(category), [category]);
    const slugStatuses = useMemo(() => {
      const map = new Map<string, SlugStatus>();
      category.drugs.forEach((slug) => {
        map.set(slug, resolveSlugStatus(slug, slugCounts));
      });
      category.sections.forEach((section) => {
        section.drugs.forEach((slug) => {
          map.set(slug, resolveSlugStatus(slug, slugCounts));
        });
      });
      return map;
    }, [category.drugs, category.sections, slugCounts]);

    const categoryIcon = useMemo(() => getCategoryIcon(category.iconKey), [category.iconKey]);
    const sortedPrimaryDrugs = useMemo(
      () => sortSlugsWithCommonPriority(category.drugs),
      [category.drugs],
    );

    const handleLabelChange = useCallback(
      (value: string) => {
        onUpdateCategory(index, (current) => ({ ...current, label: value }));
      },
      [index, onUpdateCategory],
    );

    const handleKeyChange = useCallback(
      (value: string) => {
        onUpdateCategory(index, (current) => ({ ...current, key: value }));
      },
      [index, onUpdateCategory],
    );

    const handleIconChange = useCallback(
      (value: string) => {
        onUpdateCategory(index, (current) => ({ ...current, iconKey: value }));
      },
      [index, onUpdateCategory],
    );

    const handleNotesChange = useCallback(
      (value: string) => {
        onUpdateCategory(index, (current) => ({ ...current, notes: value }));
      },
      [index, onUpdateCategory],
    );

    const handleTopLevelAdd = useCallback(
      (slug: string) => {
        onUpdateCategory(index, (current) => ({
          ...current,
          drugs: sortSlugsWithCommonPriority([...current.drugs, slug]),
        }));
      },
      [index, onUpdateCategory],
    );

    const handleTopLevelRemove = useCallback(
      (slug: string) => {
        onUpdateCategory(index, (current) => ({
          ...current,
          drugs: sortSlugsWithCommonPriority(
            current.drugs.filter((entry) => entry !== slug),
          ),
        }));
      },
      [index, onUpdateCategory],
    );

    const handleSectionUpdate = useCallback(
      (sectionIndex: number, nextSection: ManualCategorySection) => {
        onUpdateCategory(index, (current) => {
          if (sectionIndex < 0 || sectionIndex >= current.sections.length) {
            return current;
          }
          const currentSection = current.sections[sectionIndex];
          if (currentSection === nextSection) {
            return current;
          }
          const nextSections = current.sections.slice();
          nextSections[sectionIndex] = nextSection;
          return { ...current, sections: nextSections };
        });
      },
      [index, onUpdateCategory],
    );

    const handleSectionMove = useCallback(
      (sectionIndex: number, direction: "up" | "down") => {
        onUpdateCategory(index, (current) => {
          const targetIndex = direction === "up" ? sectionIndex - 1 : sectionIndex + 1;
          if (targetIndex < 0 || targetIndex >= current.sections.length) {
            return current;
          }
          const nextSections = current.sections.slice();
          const [moved] = nextSections.splice(sectionIndex, 1);
          nextSections.splice(targetIndex, 0, moved);
          return { ...current, sections: nextSections };
        });
      },
      [index, onUpdateCategory],
    );

    const handleSectionRemove = useCallback(
      (sectionIndex: number) => {
        onUpdateCategory(index, (current) => {
          if (sectionIndex < 0 || sectionIndex >= current.sections.length) {
            return current;
          }
          const nextSections = current.sections.filter((_, currentIndex) => currentIndex !== sectionIndex);
          if (nextSections.length === current.sections.length) {
            return current;
          }
          return { ...current, sections: nextSections };
        });
      },
      [index, onUpdateCategory],
    );

    const handleRemoveCategory = useCallback(() => {
      onRemoveCategory(index);
    }, [index, onRemoveCategory]);

    const handleMoveCategory = useCallback(
      (direction: "up" | "down") => {
        onMoveCategory(index, direction);
      },
      [index, onMoveCategory],
    );

    const handleAddSection = useCallback(() => {
      onAddSection(index);
    }, [index, onAddSection]);

    const [detailsOpen, setDetailsOpen] = useState(false);
    const totalPrimary = category.drugs.length;
    const sectionCount = category.sections.length;

    const topLevelSlugSet = useMemo(() => new Set(category.drugs.map((slug) => slugify(slug))), [category.drugs]);
    const categorySlugSet = useMemo(() => {
      const set = new Set<string>();
      category.drugs.forEach((slug) => set.add(slugify(slug)));
      category.sections.forEach((section) => {
        section.drugs.forEach((slug) => set.add(slugify(slug)));
      });
      return set;
    }, [category]);

    const detailsPanel = detailsOpen ? (
      <div className="mt-2 w-full max-w-[420px] rounded-2xl border border-white/10 bg-slate-950/50 p-4 text-sm text-white/75 shadow-inner shadow-black/20">
        <div className="grid gap-3 md:grid-cols-2">
          <div className="space-y-1">
            <label className="text-xs uppercase tracking-wide text-white/60">Category key</label>
            <input
              className={`${baseInputClass} w-full`}
              value={category.key}
              onChange={(event) => handleKeyChange(event.target.value)}
              placeholder="Unique key"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs uppercase tracking-wide text-white/60">Icon key</label>
            <input
              className={`${baseInputClass} w-full`}
              value={category.iconKey}
              onChange={(event) => handleIconChange(event.target.value)}
              placeholder="Icon identifier"
            />
          </div>
        </div>
        <div className="mt-3 space-y-1">
          <label className="text-xs uppercase tracking-wide text-white/60">Editor notes</label>
          <textarea
            className={`${baseInputClass} min-h-[90px] w-full`}
            value={category.notes ?? ""}
            onChange={(event) => handleNotesChange(event.target.value)}
            placeholder="Optional editor notes for this category"
          />
        </div>
      </div>
    ) : null;

    return (
      <article className="mb-6 w-full break-inside-avoid break-inside-avoid-column">
        <div className="group relative overflow-hidden rounded-2xl bg-white/5 p-6 shadow-[0_10px_30px_-12px_rgba(0,0,0,0.35)] backdrop-blur backdrop-safe">
          <div className="flex flex-col gap-4">
            <header className="flex items-start gap-4 text-white/90">
              <div className="mt-1">
                <IconBadge icon={categoryIcon} label={`${category.label} icon`} />
              </div>
              <div className="flex min-w-0 flex-1 flex-col gap-2">
                <input
                  className={`${baseInputClass} w-full text-lg font-semibold`}
                  value={category.label}
                  onChange={(event) => handleLabelChange(event.target.value)}
                  placeholder="Category label"
                />
              </div>
              <div className="ml-auto mt-1 flex items-center gap-1 text-white/70">
                <button
                  type="button"
                  onClick={() => handleMoveCategory("up")}
                  disabled={index === 0}
                  className={`${pillButtonBaseClass} ${index === 0 ? "cursor-not-allowed opacity-40" : "hover:bg-white/15"}`}
                  aria-label="Move category up"
                >
                  <ArrowUp className="h-4 w-4" />
                  <span className="sr-only">Move category up</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleMoveCategory("down")}
                  disabled={index === total - 1}
                  className={`${pillButtonBaseClass} ${index === total - 1 ? "cursor-not-allowed opacity-40" : "hover:bg-white/15"}`}
                  aria-label="Move category down"
                >
                  <ArrowDown className="h-4 w-4" />
                  <span className="sr-only">Move category down</span>
                </button>
                <button
                  type="button"
                  onClick={handleAddSection}
                  className={`${pillButtonBaseClass} hover:bg-white/15`}
                  aria-label="Add section"
                >
                  <PlusCircle className="h-4 w-4" />
                  <span className="sr-only">Add section</span>
                </button>
                <button
                  type="button"
                  onClick={() => setDetailsOpen((previous) => !previous)}
                  className={`${pillButtonBaseClass} ${detailsOpen ? "bg-white/15 text-white" : "hover:bg-white/15"}`}
                  aria-expanded={detailsOpen}
                  aria-label="Toggle category details"
                >
                  <SlidersHorizontal className="h-4 w-4" />
                  <span className="sr-only">Toggle category details</span>
                </button>
                <button
                  type="button"
                  onClick={handleRemoveCategory}
                  className={`${pillButtonBaseClass} hover:bg-rose-500/20 hover:text-rose-200`}
                  aria-label="Remove category"
                >
                  <Trash2 className="h-4 w-4" />
                  <span className="sr-only">Remove category</span>
                </button>
              </div>
            </header>

            <div className="flex items-center gap-2 whitespace-nowrap text-[11px] uppercase tracking-[0.3em] text-white/45">
              <span>
                {totalPrimary} primary item{totalPrimary === 1 ? "" : "s"}
              </span>
              <span className="text-white/30">•</span>
              <span>
                {sectionCount} section{sectionCount === 1 ? "" : "s"}
              </span>
            </div>

            {detailsPanel}

            <div className="space-y-[30px] text-sm text-white/80">
              <AddSlugControl
                label="Add top level categoryless substance..."
                existingSlugs={[
                  ...category.drugs,
                  ...category.sections.flatMap((section) => section.drugs),
                ]}
                onAdd={handleTopLevelAdd}
                options={substanceOptions}
                baseInputClass={baseInputClass}
                baseSelectClass={baseSelectClass}
                pillButtonBaseClass={pillButtonBaseClass}
                filterContext={{
                  sectionSlugs: topLevelSlugSet,
                  categorySlugs: categorySlugSet,
                  datasetSlugs: datasetSlugSet,
                }}
              />

              {totalPrimary > 0 ? (
                <ul className="space-y-1">
                  {sortedPrimaryDrugs.map((slug) => (
                    <SubstanceListItem
                      key={slug}
                      status={slugStatuses.get(slug) ?? { slug, issues: [] }}
                      onRemove={() => handleTopLevelRemove(slug)}
                    />
                  ))}
                </ul>
              ) : null}

              {sectionCount > 0
                ? category.sections.map((section, sectionIndex) => (
                    <SectionEditor
                      key={`${section.key}-${sectionIndex}`}
                      section={section}
                      onUpdate={(next) => handleSectionUpdate(sectionIndex, next)}
                      onRemove={() => handleSectionRemove(sectionIndex)}
                      onMove={(direction) => handleSectionMove(sectionIndex, direction)}
                      isFirst={sectionIndex === 0}
                      isLast={sectionIndex === category.sections.length - 1}
                      showTopDivider={sectionIndex > 0 || totalPrimary > 0}
                      baseInputClass={baseInputClass}
                      baseSelectClass={baseSelectClass}
                      pillButtonBaseClass={pillButtonBaseClass}
                      substanceOptions={substanceOptions}
                      slugStatuses={slugStatuses}
                      categorySlugSet={categorySlugSet}
                      datasetSlugSet={datasetSlugSet}
                    />
                  ))
                : null}

              {totalPrimary === 0 && sectionCount === 0 ? (
                <p className="rounded-xl border border-dashed border-white/12 bg-slate-950/45 px-4 py-5 text-sm text-white/65 shadow-inner shadow-black/20">
                  No substances assigned yet. Use the plus icons to start building this category.
                </p>
              ) : null}
            </div>
          </div>
        </div>
      </article>
    );
  },
  (previous, next) =>
    previous.category === next.category
    && previous.index === next.index
    && previous.total === next.total
    && previous.baseInputClass === next.baseInputClass
    && previous.baseSelectClass === next.baseSelectClass
    && previous.pillButtonBaseClass === next.pillButtonBaseClass
    && previous.substanceOptions === next.substanceOptions
    && previous.datasetSlugSet === next.datasetSlugSet
    && previous.onAddSection === next.onAddSection
    && previous.onMoveCategory === next.onMoveCategory
    && previous.onRemoveCategory === next.onRemoveCategory
    && previous.onUpdateCategory === next.onUpdateCategory,
);

export function IndexLayoutTab({
  baseInputClass,
  baseSelectClass,
  pillButtonBaseClass,
  commitPanel,
}: IndexLayoutTabProps) {
  const {
    psychoactiveIndexManual,
    chemicalIndexManual,
    mechanismIndexManual,
    replacePsychoactiveIndexManual,
    replaceChemicalIndexManual,
    replaceMechanismIndexManual,
    resetPsychoactiveIndexManual,
    resetChemicalIndexManual,
    resetMechanismIndexManual,
    getOriginalPsychoactiveIndexManual,
    getOriginalChemicalIndexManual,
    getOriginalMechanismIndexManual,
  } = useDevMode();

  const datasetOrder = DATASET_ORDER;

  interface DatasetDefinition {
    key: ManualDatasetKey;
    label: string;
    icon: LucideIcon;
    description: string;
    helperLabel: string;
    helperDetail: string;
    manual: ManualIndexConfig;
    replaceManual: (next: ManualIndexConfig) => void;
    resetContextManual: () => void;
    getOriginalManual: () => ManualIndexConfig;
  }

  const datasetDefinitions = useMemo<Record<ManualDatasetKey, DatasetDefinition>>(
    () => ({
      psychoactive: {
        key: "psychoactive",
        label: "Psychoactive class",
        icon: BrainCircuit,
        description: "Curate the manual layout for psychoactive classifications used on the substance index.",
        helperLabel: "Psychoactive class manual",
        helperDetail: "Controls the category, section, and ordering for the public Psychoactive class tab.",
        manual: psychoactiveIndexManual,
        replaceManual: replacePsychoactiveIndexManual,
        resetContextManual: resetPsychoactiveIndexManual,
        getOriginalManual: getOriginalPsychoactiveIndexManual,
      },
      chemical: {
        key: "chemical",
        label: "Chemical class",
        icon: Hexagon,
        description: "Compose the curated chemical class ordering for the substance index.",
        helperLabel: "Chemical class manual",
        helperDetail: "Feeds the Chemical class tab and Dev Tools previews when editing articles.",
        manual: chemicalIndexManual,
        replaceManual: replaceChemicalIndexManual,
        resetContextManual: resetChemicalIndexManual,
        getOriginalManual: getOriginalChemicalIndexManual,
      },
      mechanism: {
        key: "mechanism",
        label: "Mechanism of action",
        icon: Cog,
        description: "Manage the mechanism of action taxonomy used across the index.",
        helperLabel: "Mechanism manual",
        helperDetail: "Controls the Mechanism of action tab layout plus related detail page ordering.",
        manual: mechanismIndexManual,
        replaceManual: replaceMechanismIndexManual,
        resetContextManual: resetMechanismIndexManual,
        getOriginalManual: getOriginalMechanismIndexManual,
      },
    }), [
      chemicalIndexManual,
      getOriginalChemicalIndexManual,
      getOriginalMechanismIndexManual,
      getOriginalPsychoactiveIndexManual,
      mechanismIndexManual,
      psychoactiveIndexManual,
      replaceChemicalIndexManual,
      replaceMechanismIndexManual,
      replacePsychoactiveIndexManual,
      resetChemicalIndexManual,
      resetMechanismIndexManual,
      resetPsychoactiveIndexManual,
    ],
  );

  const createNormalizedManual = (datasetKey: ManualDatasetKey, manual: ManualIndexConfig) =>
    normalizeManualOrdering(datasetKey, deepClone(manual));

  const createManualMap = (
    source: (definition: DatasetDefinition) => ManualIndexConfig,
  ): Record<ManualDatasetKey, ManualIndexConfig> => {
    const map: Partial<Record<ManualDatasetKey, ManualIndexConfig>> = {};
    datasetOrder.forEach((datasetKey) => {
      const definition = datasetDefinitions[datasetKey];
      map[datasetKey] = createNormalizedManual(datasetKey, source(definition));
    });
    return map as Record<ManualDatasetKey, ManualIndexConfig>;
  };

  const [activeDataset, setActiveDataset] = useState<ManualDatasetKey>("psychoactive");
  const [normalizedOriginalManuals, setNormalizedOriginalManuals] = useState<
    Record<ManualDatasetKey, ManualIndexConfig>
  >(() => createManualMap((definition) => definition.getOriginalManual()));
  const [normalizedCurrentManuals, setNormalizedCurrentManuals] = useState<
    Record<ManualDatasetKey, ManualIndexConfig>
  >(() => createManualMap((definition) => definition.manual));
  const [draftManuals, setDraftManuals] = useState<Record<ManualDatasetKey, ManualIndexConfig>>(() =>
    createManualMap((definition) => definition.manual),
  );
  const [rawJsonDrafts, setRawJsonDrafts] = useState<Record<ManualDatasetKey, string>>(() => {
    const jsonMap: Partial<Record<ManualDatasetKey, string>> = {};
    datasetOrder.forEach((datasetKey) => {
      const manual = createNormalizedManual(datasetKey, datasetDefinitions[datasetKey].manual);
      jsonMap[datasetKey] = JSON.stringify(manual, null, 2);
    });
    return jsonMap as Record<ManualDatasetKey, string>;
  });
  const [jsonErrors, setJsonErrors] = useState<Record<ManualDatasetKey, string | null>>({
    psychoactive: null,
    chemical: null,
    mechanism: null,
  });
  const [saveNotice, setSaveNotice] = useState<string | null>(null);
  const [showJsonEditor, setShowJsonEditor] = useState(false);

  useEffect(() => {
    setNormalizedOriginalManuals((previous) => {
      let changed = false;
      const next = { ...previous };
      datasetOrder.forEach((datasetKey) => {
        const definition = datasetDefinitions[datasetKey];
        const normalized = createNormalizedManual(datasetKey, definition.getOriginalManual());
        if (!areManualsEqual(previous[datasetKey], normalized)) {
          next[datasetKey] = normalized;
          changed = true;
        }
      });
      return changed ? next : previous;
    });
  }, [datasetDefinitions, datasetOrder]);

  useEffect(() => {
    setNormalizedCurrentManuals((previous) => {
      let changed = false;
      const next = { ...previous };
      datasetOrder.forEach((datasetKey) => {
        const definition = datasetDefinitions[datasetKey];
        const normalized = createNormalizedManual(datasetKey, definition.manual);
        if (!areManualsEqual(previous[datasetKey], normalized)) {
          next[datasetKey] = normalized;
          changed = true;
        }
      });
      return changed ? next : previous;
    });
  }, [datasetDefinitions, datasetOrder]);

  useEffect(() => {
    setDraftManuals((previous) => {
      let changed = false;
      const next = { ...previous };
      datasetOrder.forEach((datasetKey) => {
        const normalized = normalizedCurrentManuals[datasetKey];
        if (!areManualsEqual(previous[datasetKey], normalized)) {
          next[datasetKey] = normalized;
          changed = true;
        }
      });
      return changed ? next : previous;
    });
    setRawJsonDrafts((previous) => {
      let changed = false;
      const next = { ...previous };
      datasetOrder.forEach((datasetKey) => {
        const normalized = normalizedCurrentManuals[datasetKey];
        const serialized = JSON.stringify(normalized, null, 2);
        if (previous[datasetKey] !== serialized) {
          next[datasetKey] = serialized;
          changed = true;
        }
      });
      return changed ? next : previous;
    });
    setJsonErrors((previous) => {
      let changed = false;
      const next = { ...previous };
      datasetOrder.forEach((datasetKey) => {
        if (previous[datasetKey]) {
          next[datasetKey] = null;
          changed = true;
        }
      });
      return changed ? next : previous;
    });
  }, [datasetOrder, normalizedCurrentManuals]);

  useEffect(() => {
    if (!saveNotice) {
      return;
    }
    const timeout = window.setTimeout(() => {
      setSaveNotice(null);
    }, 3000);
    return () => {
      window.clearTimeout(timeout);
    };
  }, [saveNotice]);

  useEffect(() => {
    setSaveNotice(null);
  }, [activeDataset]);

  const activeDefinition = datasetDefinitions[activeDataset];
  const normalizedOriginalManual = normalizedOriginalManuals[activeDataset];
  const normalizedCurrentManual = normalizedCurrentManuals[activeDataset];
  const draftManual = draftManuals[activeDataset];
  const rawJsonDraft = rawJsonDrafts[activeDataset];
  const jsonError = jsonErrors[activeDataset];

  const hasUnsavedChanges = useMemo(
    () => !areManualsEqual(normalizedCurrentManual, draftManual),
    [draftManual, normalizedCurrentManual],
  );

  const clearJsonErrorForDataset = useCallback((datasetKey: ManualDatasetKey) => {
    setJsonErrors((previous) => {
      if (!previous[datasetKey]) {
        return previous;
      }
      return {
        ...previous,
        [datasetKey]: null,
      };
    });
  }, []);

  const setRawJsonForDataset = useCallback((datasetKey: ManualDatasetKey, value: string) => {
    setRawJsonDrafts((previous) => {
      if (previous[datasetKey] === value) {
        return previous;
      }
      return {
        ...previous,
        [datasetKey]: value,
      };
    });
  }, []);

  const updateDraftManualForDataset = useCallback(
    (datasetKey: ManualDatasetKey, updater: (manual: ManualIndexConfig) => ManualIndexConfig) => {
      setDraftManuals((previous) => {
        const current = previous[datasetKey];
        const next = updater(current);
        if (next === current) {
          return previous;
        }
        return {
          ...previous,
          [datasetKey]: next,
        };
      });
      clearJsonErrorForDataset(datasetKey);
    },
    [clearJsonErrorForDataset],
  );

  const updateDraftManualForActive = useCallback(
    (updater: (manual: ManualIndexConfig) => ManualIndexConfig) => {
      updateDraftManualForDataset(activeDataset, updater);
    },
    [activeDataset, updateDraftManualForDataset],
  );

  const substanceOptions = useMemo<SubstanceOption[]>(
    () =>
      allSubstanceRecords
        .map((record) => ({
          slug: record.slug,
          name: record.name,
          alias: record.aliases?.[0],
          isHidden: record.isHidden,
        }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [],
  );

  const datasetSlugSet = useMemo<ReadonlySet<string>>(() => {
    const set = new Set<string>();
    draftManual.categories.forEach((category) => {
      category.drugs.forEach((slug) => set.add(slugify(slug)));
      category.sections.forEach((section) => {
        section.drugs.forEach((slug) => set.add(slugify(slug)));
      });
    });
    return set;
  }, [draftManual]);

  const updateCategory = useCallback(
    (index: number, updater: (category: ManualCategoryDefinition) => ManualCategoryDefinition) => {
      updateDraftManualForActive((previous) => {
        if (index < 0 || index >= previous.categories.length) {
          return previous;
        }
        const currentCategory = previous.categories[index];
        const nextCategory = updater(currentCategory);
        if (nextCategory === currentCategory) {
          return previous;
        }
        const nextCategories = previous.categories.slice();
        nextCategories[index] = nextCategory;
        return {
          ...previous,
          categories: nextCategories,
        };
      });
    },
    [updateDraftManualForActive],
  );

  const removeCategory = useCallback((index: number) => {
    updateDraftManualForActive((previous) => {
      if (index < 0 || index >= previous.categories.length || previous.categories.length <= 1) {
        return previous;
      }
      const nextCategories = previous.categories.filter((_, current) => current !== index);
      if (nextCategories.length === previous.categories.length) {
        return previous;
      }
      return {
        ...previous,
        categories: nextCategories,
      };
    });
  }, [updateDraftManualForActive]);

  const moveCategory = useCallback(
    (index: number, direction: "up" | "down") => {
      updateDraftManualForActive((previous) => {
        const targetIndex = direction === "up" ? index - 1 : index + 1;
        if (targetIndex < 0 || targetIndex >= previous.categories.length) {
          return previous;
        }
        const nextCategories = previous.categories.slice();
        const [moved] = nextCategories.splice(index, 1);
        nextCategories.splice(targetIndex, 0, moved);
        return {
          ...previous,
          categories: nextCategories,
        };
      });
    },
    [updateDraftManualForActive],
  );

  const addCategory = useCallback(() => {
    updateDraftManualForActive((previous) => {
      const existingKeys = new Set(previous.categories.map((category) => slugify(category.key)));
      const key = generateUniqueKey("New Category", existingKeys);
      const nextCategory: ManualCategoryDefinition = {
        key,
        label: "New Category",
        iconKey: "sparkle",
        notes: "",
        drugs: [],
        sections: [],
      };
      return {
        ...previous,
        categories: [...previous.categories, nextCategory],
      };
    });
  }, [updateDraftManualForActive]);

  const addSection = useCallback((index: number) => {
    updateCategory(index, (category) => {
      const existingKeys = new Set(category.sections.map((section) => slugify(section.key)));
      const key = generateUniqueKey("New Section", existingKeys);
      const nextSection: ManualCategorySection = {
        key,
        label: "New Section",
        drugs: [],
        notes: "",
      };
      return {
        ...category,
        sections: [...category.sections, nextSection],
      };
    });
  }, [updateCategory]);

  const handleApplyJson = useCallback(() => {
    try {
      const parsed = JSON.parse(rawJsonDraft) as ManualIndexConfig;
      if (!parsed || typeof parsed !== "object") {
        throw new Error("Invalid manual dataset");
      }
      const normalized = normalizeManualOrdering(activeDataset, parsed);
      updateDraftManualForDataset(activeDataset, () => normalized);
      setRawJsonForDataset(activeDataset, JSON.stringify(normalized, null, 2));
    } catch (error) {
      const reason = error instanceof Error ? error.message : "Unable to parse JSON";
      setJsonErrors((previous) => ({
        ...previous,
        [activeDataset]: reason,
      }));
    }
  }, [activeDataset, rawJsonDraft, setRawJsonForDataset, updateDraftManualForDataset]);

  const handleSave = useCallback(() => {
    const normalized = normalizeManualOrdering(activeDataset, draftManual);
    activeDefinition.replaceManual(deepClone(normalized));
    setNormalizedCurrentManuals((previous) => ({
      ...previous,
      [activeDataset]: normalized,
    }));
    updateDraftManualForDataset(activeDataset, () => normalized);
    setRawJsonForDataset(activeDataset, JSON.stringify(normalized, null, 2));
    setSaveNotice(`${activeDefinition.label} layout updated`);
  }, [
    activeDataset,
    activeDefinition,
    draftManual,
    setRawJsonForDataset,
    updateDraftManualForDataset,
  ]);

  const handleResetDraft = useCallback(() => {
    updateDraftManualForDataset(activeDataset, () => deepClone(normalizedCurrentManual));
    setRawJsonForDataset(activeDataset, JSON.stringify(normalizedCurrentManual, null, 2));
  }, [activeDataset, normalizedCurrentManual, setRawJsonForDataset, updateDraftManualForDataset]);

  const handleResetToOriginal = useCallback(() => {
    updateDraftManualForDataset(activeDataset, () => deepClone(normalizedOriginalManual));
    setRawJsonForDataset(activeDataset, JSON.stringify(normalizedOriginalManual, null, 2));
  }, [
    activeDataset,
    normalizedOriginalManual,
    setRawJsonForDataset,
    updateDraftManualForDataset,
  ]);

  const handleOrganizeEntries = useCallback(() => {
    let organizedManual: ManualIndexConfig | null = null;
    updateDraftManualForActive((previous) => {
      organizedManual = organizeManualEntries(activeDataset, previous);
      return organizedManual;
    });
    if (organizedManual) {
      setRawJsonForDataset(activeDataset, JSON.stringify(organizedManual, null, 2));
    }
  }, [
    activeDataset,
    setRawJsonForDataset,
    updateDraftManualForActive,
  ]);

  return (
    <div className="space-y-6">
      {commitPanel ? <div>{commitPanel}</div> : null}
      <div className="flex flex-wrap items-center justify-center gap-3">
        {datasetOrder.map((datasetKey) => {
          const definition = datasetDefinitions[datasetKey];
          const isActive = datasetKey === activeDataset;
          const Icon = definition.icon;
          return (
            <button
              key={datasetKey}
              type="button"
              onClick={() => setActiveDataset(datasetKey)}
              className={isActive ? DATASET_TOGGLE_ACTIVE_CLASS : DATASET_TOGGLE_INACTIVE_CLASS}
              aria-pressed={isActive}
            >
              <Icon
                className={isActive ? DATASET_TOGGLE_ICON_ACTIVE_CLASS : DATASET_TOGGLE_ICON_INACTIVE_CLASS}
                aria-hidden="true"
                focusable="false"
              />
              <span className={isActive ? DATASET_TOGGLE_LABEL_ACTIVE_CLASS : DATASET_TOGGLE_LABEL_INACTIVE_CLASS}>
                {definition.label}
              </span>
            </button>
          );
        })}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={handleSave}
          disabled={!hasUnsavedChanges}
          className={`${pillButtonBaseClass} bg-fuchsia-500/20 text-fuchsia-200 hover:bg-fuchsia-500/30 disabled:cursor-not-allowed disabled:opacity-40`}
          aria-label="Save layout"
        >
          <Save className="h-4 w-4" aria-hidden="true" focusable="false" />
          <span className="text-[11px] font-semibold uppercase tracking-[0.3em]">Save</span>
        </button>
        <button
          type="button"
          onClick={handleOrganizeEntries}
          className={`${pillButtonBaseClass} bg-white/10 text-white/80 hover:bg-white/20`}
          aria-label="Organize entries"
        >
          <ArrowDownAZ className="h-4 w-4" aria-hidden="true" focusable="false" />
          <span className="text-[11px] font-semibold uppercase tracking-[0.3em]">Organize</span>
        </button>
        <button
          type="button"
          onClick={handleResetDraft}
          className={`${pillButtonBaseClass} bg-white/10 text-white/80 hover:bg-white/20`}
          aria-label="Reset unsaved changes"
        >
          <RotateCcw className="h-4 w-4" aria-hidden="true" focusable="false" />
          <span className="text-[11px] font-semibold uppercase tracking-[0.3em]">Reset</span>
        </button>
        <button
          type="button"
          onClick={handleResetToOriginal}
          className={`${pillButtonBaseClass} bg-white/10 text-white/80 hover:bg-white/20`}
          aria-label="Restore original dataset"
        >
          <ArrowLeftRight className="h-4 w-4" aria-hidden="true" focusable="false" />
          <span className="text-[11px] font-semibold uppercase tracking-[0.3em]">Restore</span>
        </button>
        <button
          type="button"
          onClick={() => setShowJsonEditor((previous) => !previous)}
          className={`${pillButtonBaseClass} bg-white/10 text-white/80 hover:bg-white/20`}
          aria-pressed={showJsonEditor}
          aria-label={showJsonEditor ? "Hide JSON editor" : "Show JSON editor"}
        >
          <Braces className="h-4 w-4" aria-hidden="true" focusable="false" />
          <span className="text-[11px] font-semibold uppercase tracking-[0.3em]">
            {showJsonEditor ? "Hide JSON" : "Show JSON"}
          </span>
        </button>
        {saveNotice && <span className="text-sm text-emerald-300">{saveNotice}</span>}
        {hasUnsavedChanges && <span className="text-sm text-white/60">Unsaved changes</span>}
      </div>

      {jsonError && (
        <div className="flex items-center gap-2 rounded-xl border border-rose-500/40 bg-rose-500/10 p-3 text-sm text-rose-100">
          <AlertCircle className="h-4 w-4" />
          <span>{jsonError}</span>
        </div>
      )}

      {showJsonEditor ? (
        <div className="space-y-4">
          <div className="flex items-center justify-between text-sm font-medium text-white/70">
            <span>{`${activeDefinition.label} JSON layout`}</span>
            <button
              type="button"
              onClick={handleApplyJson}
              className={`${pillButtonBaseClass} bg-fuchsia-500/20 text-fuchsia-200 hover:bg-fuchsia-500/30`}
              aria-label="Apply JSON edits"
            >
              <Check className="h-4 w-4" />
              <span className="sr-only">Apply JSON edits</span>
            </button>
          </div>
          <JsonEditor
            value={rawJsonDraft}
            onChange={(nextValue) => {
              setRawJsonForDataset(activeDataset, nextValue);
              clearJsonErrorForDataset(activeDataset);
            }}
          />
        </div>
      ) : (
        <div className="space-y-6">
          <div className="[column-gap:1.5rem] columns-1 sm:columns-2 xl:columns-3">
            {draftManual.categories.map((category, index) => (
              <CategoryEditor
                key={`${category.key}-${index}`}
                category={category}
                index={index}
                total={draftManual.categories.length}
                onUpdateCategory={updateCategory}
                onRemoveCategory={removeCategory}
                onMoveCategory={moveCategory}
                onAddSection={addSection}
                baseInputClass={baseInputClass}
                baseSelectClass={baseSelectClass}
                pillButtonBaseClass={pillButtonBaseClass}
                substanceOptions={substanceOptions}
                datasetSlugSet={datasetSlugSet}
              />
            ))}
            <div className="mb-6 break-inside-avoid break-inside-avoid-column">
              <button
                type="button"
                onClick={addCategory}
                className="flex w-full flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-white/12 bg-white/5 px-6 py-10 text-white/70 transition hover:border-fuchsia-400/30 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fuchsia-400"
                aria-label="Add category"
              >
                <PlusCircle className="h-6 w-6" />
                <span className="text-xs uppercase tracking-[0.3em]">New category</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
