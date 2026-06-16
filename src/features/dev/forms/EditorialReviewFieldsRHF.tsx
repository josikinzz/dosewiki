import { useFormContext } from "react-hook-form";

import { Icon } from "@/components/common/Icon";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
              <Icon icon="lucide:list-checks" size={14} className="text-fuchsia-300" />
              Review Status
            </Label>
            <div className="relative">
              <select
                id={`${idPrefix}-editorial-review-status`}
                {...register("editorial_review.status")}
                className="h-11 w-full appearance-none rounded-xl border border-white/10 bg-[color-mix(in_srgb,#020617_60%,var(--theme-control-base))] px-4 py-2 pr-10 text-sm text-white shadow-inner shadow-black/20 transition focus:border-fuchsia-400 focus:outline-none focus:ring-2 focus:ring-fuchsia-300/30"
              >
                {REVIEW_STATUS_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <Icon
                icon="lucide:chevron-down"
                size={16}
                className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-white/50"
              />
            </div>
            <p className={helperTextClass}>
              Shown as a badge in the substance selector above.
            </p>
          </div>

          <div className="space-y-1">
            <Label htmlFor={`${idPrefix}-editorial-review-notes`} className="inline-flex items-center gap-1.5">
              <Icon icon="lucide:notebook-pen" size={14} className="text-fuchsia-300" />
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
