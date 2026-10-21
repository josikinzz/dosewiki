import { HighlightedText } from "@/components/common/HighlightedText";
import { Icon } from "@/components/common/Icon";
import { Button } from "@/components/ui/button";
import { TOUCH_HALO_Y } from "@/components/ui/touchTargets";
import { EditorListRow, EditorPanel, EditorStatusPill, SaveLine } from "@/features/dev/components";
import { cn } from "@/lib/utils";
import { COPY_PUBLISH_SAVE_COPY } from "./CopyBlockPane";
import { copyBlockFlavorLabel, type CopyStudioBlock } from "./copyStudioUtils";

export function SectionChoices({
  sections,
  value,
  onChange,
}: {
  sections: readonly { value: string; count: number }[];
  value: string;
  onChange: (section: string) => void;
}) {
  return (
    <div
      role="group"
      aria-label="Copy sections"
      className="grid grid-cols-3 gap-1 rounded-card border border-[color:var(--editor-panel-border)] bg-[var(--editor-panel-bg-subtle)] p-1"
    >
      {sections.map((section) => {
        const selected = section.value === value;
        return (
          <Button
            key={section.value}
            type="button"
            variant={selected ? "pillActive" : "ghostPill"}
            size="pill"
            aria-pressed={selected}
            onClick={() => onChange(section.value)}
            className={cn("h-auto min-h-9 w-full flex-col gap-0 rounded-control px-1.5 py-1 leading-tight [@media(pointer:coarse)]:min-h-11", TOUCH_HALO_Y)}
          >
            <span className="text-xs font-medium">{section.value}</span>
            <span className={cn("text-xs tabular-nums", selected ? "opacity-80" : "theme-text-faint")}>
              <span className="sr-only">, </span>
              {section.count}
            </span>
          </Button>
        );
      })}
    </div>
  );
}

export function CopyBlockRowView({
  block,
  active,
  dirty,
  pending,
  query,
  place,
  defaultMatch,
}: {
  block: CopyStudioBlock;
  active: boolean;
  dirty: boolean;
  pending: boolean;
  query: string;
  place: string | null;
  defaultMatch: boolean;
}) {
  const flavor = copyBlockFlavorLabel(block.flavor);
  return (
    <EditorListRow active={active} className="h-[3.75rem] overflow-hidden py-2" data-copy-key={block.key}>
      <span className="min-w-0 flex-1 space-y-0.5">
        <span className="flex items-baseline justify-between gap-2">
          <span className={cn("min-w-0 truncate text-sm font-medium", active ? "theme-accent-heading" : "theme-text-primary")}>
            {query ? <HighlightedText text={block.label} query={query} /> : block.label}
          </span>
          <span className="flex shrink-0 items-center gap-1">
            {dirty ? (
              <span className="theme-text-muted flex items-center gap-1.5 text-xs">
                <span className="sr-only">, </span>
                <span aria-hidden className="theme-dev-unsaved-dot inline-block size-1.5 rounded-full" />
                <span>Unsaved</span>
              </span>
            ) : null}
            {flavor ? (
              <EditorStatusPill tone="neutral" inline>
                <span className="sr-only">, </span>
                {flavor}
              </EditorStatusPill>
            ) : null}
            {block.source === "data" ? (
              <EditorStatusPill tone="info" inline>
                <span className="sr-only">, </span>
                Edited
              </EditorStatusPill>
            ) : null}
            {pending ? (
              <EditorStatusPill tone="neutral" inline>
                <span className="sr-only">, </span>
                Pending
              </EditorStatusPill>
            ) : null}
          </span>
        </span>
        <span className="theme-text-faint block truncate text-xs">
          <span className="sr-only">, </span>
          {place ? `${place} · ` : null}
          <span className="font-mono">{query ? <HighlightedText text={block.key} query={query} /> : block.key}</span>
          {defaultMatch ? " · matched its default wording" : null}
        </span>
      </span>
    </EditorListRow>
  );
}

export function IdlePane({ canApprove }: { canApprove: boolean }) {
  return (
    <EditorPanel variant="subtle" className="space-y-3 px-5 py-6">
      <p className="theme-text-primary flex items-center gap-2 text-base font-semibold">
        <Icon icon="lucide:type" size={18} className="theme-icon-accent shrink-0" />
        Pick a block to edit
      </p>
      <p className="theme-text-muted max-w-[60ch] text-sm">
        Its words open here with a preview drawn the way the public page draws it, the change against what is live, and the
        way back to its checked-in default. Search finds a block by the words you saw on the page.
      </p>
      <SaveLine model="record" destination={canApprove ? "live" : "proposal"} copy={canApprove ? COPY_PUBLISH_SAVE_COPY : undefined} />
    </EditorPanel>
  );
}

export function groupLabel(group: string, section: string): string {
  const prefix = `${section} · `;
  return group.startsWith(prefix) ? group.slice(prefix.length) : group;
}
