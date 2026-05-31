import { Icon } from "@/components/common/Icon";

import { SectionCard } from "@/components/common/SectionCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

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
    <SectionCard className="space-y-4 bg-white/[0.03]">
      <div className="flex flex-col gap-3">
        <label className="text-[11px] font-semibold uppercase tracking-[0.35em] text-white/45" htmlFor="tag-field-filter">
          Field
        </label>
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
      </div>

      <div>
        <label className="text-[11px] font-semibold uppercase tracking-[0.35em] text-white/45" htmlFor="tag-search">
          Search tags
        </label>
        <div className="relative mt-1">
          <Icon icon="lucide:search" size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-white/45" />
          <Input
            id="tag-search"
            type="search"
            className="pl-9"
            placeholder="Filter by label"
            value={searchQuery}
            onChange={(event) => onSearchChange(event.target.value)}
          />
        </div>
      </div>

      <div className="mt-4 max-h-[28rem] space-y-2 overflow-y-auto pr-1">
        {filteredTags.length === 0 ? (
          <p className="text-sm text-white/50">No tags match the current filters.</p>
        ) : (
          filteredTags.map((usage) => {
            const isActive = selected?.field === usage.field && selected.key === usage.key;
            return (
              <Button
                key={`${usage.field}-${usage.key}`}
                variant="ghost"
                size="auto"
                className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-left text-sm text-white/75 transition hover:border-fuchsia-400/50 hover:bg-fuchsia-500/10 hover:text-white data-[active=true]:border-fuchsia-400/70 data-[active=true]:bg-fuchsia-500/15 data-[active=true]:text-white data-[active=true]:shadow-inner data-[active=true]:shadow-fuchsia-500/25"
                onClick={() => onSelectUsage(usage)}
                data-active={isActive}
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="font-semibold">{usage.tag}</span>
                  <span className="text-xs uppercase tracking-wide text-white/55">{usage.count} uses</span>
                </div>
                <p className="mt-1 text-[11px] uppercase tracking-[0.25em] text-white/45">{TAG_FIELD_LABELS[usage.field]}</p>
              </Button>
            );
          })
        )}
      </div>
    </SectionCard>
  );
}
