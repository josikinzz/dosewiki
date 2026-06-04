import { Icon } from "@/components/common/Icon";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EditorField, EditorPanel, EditorPanelBody } from "@/features/dev/components";

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
          <p className="text-sm theme-text-faint">No tags match the current filters.</p>
        ) : (
          filteredTags.map((usage) => {
            const isActive = selected?.field === usage.field && selected.key === usage.key;
            return (
              <Button
                key={`${usage.field}-${usage.key}`}
                variant="ghost"
                size="auto"
                className="w-full rounded-xl border border-[color:var(--editor-panel-border)] bg-[var(--editor-panel-bg-subtle)] px-4 py-3 text-left text-sm theme-text-secondary transition hover:border-fuchsia-400/50 hover:bg-fuchsia-500/10  data-[active=true]:border-fuchsia-400/70 data-[active=true]:bg-fuchsia-500/15 data-[active=true]:text-[color:var(--editor-chip-text)] data-[active=true]:shadow-inner data-[active=true]:shadow-fuchsia-500/25"
                onClick={() => onSelectUsage(usage)}
                data-active={isActive}
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="font-semibold">{usage.tag}</span>
                  <span className="text-xs uppercase tracking-wide theme-text-faint">{usage.count} uses</span>
                </div>
                <p className="mt-1 text-[11px] uppercase tracking-[0.25em] theme-text-faint">{TAG_FIELD_LABELS[usage.field]}</p>
              </Button>
            );
          })
        )}
      </div>
      </EditorPanelBody>
    </EditorPanel>
  );
}
