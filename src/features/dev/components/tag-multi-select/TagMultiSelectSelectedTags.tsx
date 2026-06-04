import { TagToken } from "@/features/dev/components";

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
        return (
          <TagToken
            key={`${tag}-${index}`}
            label={tag}
            variant={compact ? "compact" : "default"}
            disabled={disabled}
            onRemove={() => onRemoveTag(index)}
          />
        );
      })}
    </>
  );
}
