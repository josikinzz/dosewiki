"use client";

import { useId, useState } from "react";

import { TagToken } from "@/features/dev/components";

/**
 * Tags as removable tokens with an entry box. Enter adds the trimmed tag;
 * Backspace in an empty box removes the last one. The entry box grows to
 * fill the rest of the row, so most of the field is a place to type.
 */
export function ReportTagsField({ tags, onChange }: { tags: readonly string[]; onChange: (tags: string[]) => void }) {
  const [tagDraft, setTagDraft] = useState("");
  const labelId = useId();
  const hintId = useId();
  const inputId = useId();

  return (
    <div role="group" aria-labelledby={labelId} className="space-y-2">
      <label id={labelId} htmlFor={inputId} className="theme-text-muted block text-sm font-medium leading-5">
        Tags
      </label>
      <div
        className="theme-replication-field theme-portal-rule flex min-h-10 flex-wrap items-center gap-1.5 rounded-control border p-1.5 [@media(pointer:coarse)]:min-h-11"
      >
        {tags.map((tag, index) => (
          <TagToken
            key={`${tag}-${index}`}
            label={tag}
            variant="compact"
            removeLabel={`Remove tag ${tag}`}
            onRemove={() => onChange(tags.filter((_, at) => at !== index))}
          />
        ))}
        <input
          id={inputId}
          aria-label="Add tag"
          aria-describedby={hintId}
          value={tagDraft}
          placeholder={tags.length === 0 ? "Add a tag" : "Add another"}
          enterKeyHint="done"
          className="theme-text-primary min-w-28 flex-1 bg-transparent px-1 py-0.5 text-[16px] outline-none md:text-sm [@media(pointer:coarse)]:min-h-8"
          onChange={(event) => setTagDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && tagDraft.trim()) {
              event.preventDefault();
              const next = tagDraft.trim();
              // A tag already on the report is not added twice; the box clears either way.
              if (!tags.some((tag) => tag.toLowerCase() === next.toLowerCase())) onChange([...tags, next]);
              setTagDraft("");
            } else if (event.key === "Backspace" && !tagDraft && tags.length > 0) {
              onChange(tags.slice(0, -1));
            }
          }}
        />
      </div>
      <p id={hintId} className="theme-text-faint text-xs">
        Enter adds a tag (a repeat is skipped). Backspace in an empty box removes the last one.
      </p>
    </div>
  );
}
