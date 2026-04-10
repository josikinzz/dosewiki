import type { MouseEvent } from "react";
import { Button } from "@/components/ui/button";
import { Icon } from "./Icon";

type TagMultiSelectSelectedTagsProps = {
  value: string[];
  compact: boolean;
  disabled: boolean;
  onRemoveTag: (index: number) => void;
};

export function TagMultiSelectSelectedTags({
  value,
  compact,
  disabled,
  onRemoveTag,
}: TagMultiSelectSelectedTagsProps) {
  return (
    <>
      {value.map((tag, index) => {
        const tagClasses = compact
          ? "flex items-center gap-1 rounded-md border border-white/10 bg-white/5 px-1.5 py-0.5 text-xs text-white/90 shadow-sm"
          : "flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 text-sm text-white/90 shadow-sm";
        const iconSize = compact ? 10 : 12;

        return (
          <span key={`${tag}-${index}`} className={tagClasses}>
            {tag}
            {!disabled ? (
              <Button
                variant="tagRemove"
                size="auto"
                aria-label={`Remove ${tag}`}
                onClick={(event: MouseEvent<HTMLButtonElement>) => {
                  event.stopPropagation();
                  event.preventDefault();
                  onRemoveTag(index);
                }}
              >
                <Icon icon="lucide:x" size={iconSize} />
              </Button>
            ) : null}
          </span>
        );
      })}
    </>
  );
}
