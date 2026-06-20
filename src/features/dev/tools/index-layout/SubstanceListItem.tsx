import { Icon } from "@/components/common/Icon";

import { Button } from "@/components/ui/button";
import { EditorStatusPill } from "@/features/dev/components";
import { slugIssueLabels, slugIssueTones, type SlugStatus } from "./types";

interface SubstanceListItemProps {
  status: SlugStatus;
  onRemove: () => void;
}

export function SubstanceListItem({ status, onRemove }: SubstanceListItemProps) {
  const displayName = status.name ?? status.slug;

  return (
    <li className="group theme-text-secondary flex items-center gap-2 py-1 text-sm">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <span className="theme-text-primary truncate font-semibold">{displayName}</span>
          {status.issues.map((issue) => (
            <EditorStatusPill
              key={issue}
              tone={slugIssueTones[issue]}
              className="px-2 py-0.5 text-[10px] uppercase tracking-wide"
            >
              {slugIssueLabels[issue]}
            </EditorStatusPill>
          ))}
        </div>
      </div>
      <Button
        variant="ghostDestructive"
        size="icon"
        onClick={onRemove}
        className="h-6 w-6 opacity-60 group-hover:opacity-100"
        aria-label={`Remove ${displayName}`}
      >
        <Icon icon="lucide:trash-2" className="h-3.5 w-3.5" size={14} />
      </Button>
    </li>
  );
}
