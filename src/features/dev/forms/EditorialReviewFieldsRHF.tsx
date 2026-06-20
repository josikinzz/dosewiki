import { useFormContext } from "react-hook-form";

import { Icon } from "@/components/common/Icon";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { EditorSelect } from "@/features/dev/components";
import type { SubstanceArticle } from "@/schema";

import { FieldGroup, helperTextClass } from "./FormHelpers";

const REVIEW_STATUS_OPTIONS = [
  {
    value: "needed",
    label: "Review needed",
    description: "Not started yet.",
  },
  {
    value: "in_progress",
    label: "In progress",
    description: "Manual confirmation is underway.",
  },
  {
    value: "completed",
    label: "Completed",
    description: "Manual review is done.",
  },
] as const;

export type EditorialReviewFieldsRHFProps = {
  idPrefix: string;
};

export function EditorialReviewFieldsRHF({ idPrefix }: EditorialReviewFieldsRHFProps) {
  const { register } = useFormContext<SubstanceArticle>();

  return (
    <section className="space-y-6">
      <FieldGroup label="Internal Review Tracking">
        <div className="grid gap-4 md:grid-cols-[minmax(0,260px)_1fr]">
          <div className="space-y-1">
            <Label htmlFor={`${idPrefix}-editorial-review-status`} className="inline-flex items-center gap-1.5">
              <Icon icon="lucide:list-checks" size={14} className="theme-icon-accent" />
              Review Status
            </Label>
            <EditorSelect
              id={`${idPrefix}-editorial-review-status`}
              {...register("editorial_review.status")}
              options={REVIEW_STATUS_OPTIONS.map((option) => ({
                value: option.value,
                label: option.label,
              }))}
            />
            <p className={helperTextClass}>
              Shown as a badge in the substance selector above.
            </p>
          </div>

          <div className="space-y-1">
            <Label htmlFor={`${idPrefix}-editorial-review-notes`} className="inline-flex items-center gap-1.5">
              <Icon icon="lucide:notebook-pen" size={14} className="theme-icon-accent" />
              Review Notes
            </Label>
            <Textarea
              id={`${idPrefix}-editorial-review-notes`}
              {...register("editorial_review.notes")}
              placeholder="Checklist items, unresolved questions, or manual confirmation notes."
              textareaSize="lg"
            />
            <p className={helperTextClass}>
              Internal-only metadata. This does not render on public article pages.
            </p>
          </div>
        </div>
      </FieldGroup>
    </section>
  );
}
