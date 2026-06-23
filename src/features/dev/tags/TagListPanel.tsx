import { Icon } from "@/components/common/Icon";

import { EmptyStateSurface } from "@/components/ui/surface";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  EditorField,
  EditorListItem,
  EditorPanel,
  EditorPanelBody,
  EditorPanelHeader,
  EditorStatusPill,
} from "@/features/dev/components";

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
    <EditorPanel variant="subtle">
      <EditorPanelHeader
        icon="lucide:tags"
        title="Tag registry"
        description="Filter one tag field at a time, then select a tag to inspect its article usage."
        meta={<EditorStatusPill tone="neutral">{filteredTags.length} matches</EditorStatusPill>}
      />
      <EditorPanelBody className="space-y-4">
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

      <div className="mt-4 max-h-[28rem] space-y-2 overflow-y-auto pr-1">
        {filteredTags.length === 0 ? (
          <EmptyStateSurface className="text-sm theme-text-faint">
            No tags match the current filters.
          </EmptyStateSurface>
        ) : (
          filteredTags.map((usage) => {
            const isActive = selected?.field === usage.field && selected.key === usage.key;
            return (
              <EditorListItem
                key={`${usage.field}-${usage.key}`}
                active={isActive}
                onSelect={() => onSelectUsage(usage)}
                className="px-4 py-3"
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
                    <span className="shrink-0 text-xs uppercase tracking-wide theme-text-faint">{usage.count} uses</span>
                  </span>
                  <span className="mt-1 block text-[11px] uppercase tracking-[0.25em] theme-text-faint">
                    {TAG_FIELD_LABELS[usage.field]}
                  </span>
                </span>
              </EditorListItem>
            );
          })
        )}
      </div>
      </EditorPanelBody>
    </EditorPanel>
  );
}
