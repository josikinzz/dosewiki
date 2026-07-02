import { Icon } from "@/components/common/Icon";

import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  EditorField,
  EditorSection,
  EditorStatusPill,
} from "@/features/dev/components";
import { cn } from "@/lib/utils";

import { TAG_FIELD_LABELS, TAG_FIELDS, type TagField } from "@/utils/data/tagRegistry";
import type { TagListPanelProps } from "./types";

export function TagListPanel({
  activeField,
  onFieldChange,
  searchQuery,
  onSearchChange,
  filteredTags,
  selected,
  onSelectUsage,
}: TagListPanelProps) {
  return (
    <EditorSection
      icon="lucide:list-filter"
      title="Tag registry"
      description="Filter one tag field at a time, then select a tag to inspect its article usage."
      actions={<EditorStatusPill tone="neutral">{filteredTags.length} matches</EditorStatusPill>}
      delay={0.05}
    >
      <EditorField label="Field" htmlFor="tag-field-filter">
        <Select value={activeField} onValueChange={(value) => onFieldChange(value as TagField)}>
          <SelectTrigger id="tag-field-filter" className="rounded-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {TAG_FIELDS.map((field) => (
              <SelectItem key={field} value={field}>
                {TAG_FIELD_LABELS[field]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </EditorField>

      <EditorField label="Search tags" htmlFor="tag-search">
        <div className="relative mt-1">
          <Icon icon="lucide:search" size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 theme-text-faint" />
          <Input
            id="tag-search"
            type="search"
            className="pl-9"
            placeholder="Filter by label"
            value={searchQuery}
            onChange={(event) => onSearchChange(event.target.value)}
          />
        </div>
      </EditorField>

      <div className="theme-deep-list-surface max-h-[28rem] overflow-y-auto rounded-xl border">
        {filteredTags.length === 0 ? (
          <p className="theme-text-faint px-4 py-8 text-center text-sm">
            No tags match the current filters.
          </p>
        ) : (
          <div className="theme-deep-list-divide divide-y">
            {filteredTags.map((usage) => {
              const isActive = selected?.field === usage.field && selected.key === usage.key;
              return (
                <button
                  key={`${usage.field}-${usage.key}`}
                  type="button"
                  aria-pressed={isActive}
                  data-active={isActive || undefined}
                  onClick={() => onSelectUsage(usage)}
                  className={cn(
                    "theme-deep-list-row theme-focus-ring-inset",
                    "flex w-full items-center gap-3 px-4 py-3 text-left transition",
                  )}
                >
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center justify-between gap-3">
                      <span
                        className={
                          isActive
                            ? "truncate text-sm font-semibold theme-accent-heading"
                            : "truncate text-sm font-semibold theme-text-secondary"
                        }
                      >
                        {usage.tag}
                      </span>
                      <span className="shrink-0 text-xs uppercase tracking-wide theme-text-faint">
                        {usage.count} use{usage.count === 1 ? "" : "s"}
                      </span>
                    </span>
                    <span className="mt-1 block text-[11px] uppercase tracking-[0.25em] theme-text-faint">
                      {TAG_FIELD_LABELS[usage.field]}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </EditorSection>
  );
}
