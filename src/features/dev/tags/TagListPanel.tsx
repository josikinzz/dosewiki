import { Icon } from "@/components/common/Icon";

import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  EditorField,
  EditorList,
  EditorListItem,
  EditorSection,
  EditorStatusPill,
} from "@/features/dev/components";

import { TAG_FIELD_LABELS, TAG_FIELDS, type TagField, type TagUsage } from "@/utils/data/tagRegistry";
import { articleCount } from "./tagEditorStateMachine";
import type { TagListPanelProps } from "./types";

const usageKey = (usage: TagUsage) => `${usage.field}:${usage.key}`;

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
      title="All tags"
      description="Pick a field, then a tag, to see which articles carry it."
      actions={<EditorStatusPill tone="neutral">{filteredTags.length} tag{filteredTags.length === 1 ? "" : "s"}</EditorStatusPill>}
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

      <EditorList
        items={filteredTags}
        getKey={usageKey}
        selectedKey={selected ? `${selected.field}:${selected.key}` : null}
        onSelect={(key) => {
          const usage = filteredTags.find((candidate) => usageKey(candidate) === key);
          if (usage) {
            onSelectUsage(usage);
          }
        }}
        renderItem={(usage, { selected: isActive }) => (
          <EditorListItem
            active={isActive}
            tabIndex={-1}
            title={usage.tag}
            badge={
              <span className="text-xs tabular-nums theme-text-faint">{articleCount(usage.count)}</span>
            }
          />
        )}
        estimateRowHeight={48}
        maxHeight="min(50vh, 28rem)"
        emptyText="No tags match the current filters."
        label={`${TAG_FIELD_LABELS[activeField]} tags`}
      />
    </EditorSection>
  );
}
