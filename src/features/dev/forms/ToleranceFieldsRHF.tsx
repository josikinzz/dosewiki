import { useFormContext } from "react-hook-form";
import { Icon } from "@/components/common/Icon";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { EditorField, EditorFieldRow } from "@/features/dev/components";
import { ControlledTagMultiSelect, TextListInput } from "./rhf";
import type { SubstanceArticle } from "@/schema";
import { toleranceLabels } from "./contentFieldsShared";

type ToleranceFieldsRHFProps = {
  idPrefix: string;
  embedded?: boolean;
};

export function ToleranceFieldsRHF({ idPrefix, embedded = false }: ToleranceFieldsRHFProps) {
  const { register } = useFormContext<SubstanceArticle>();

  return (
    <section className="space-y-6">
      {embedded && (
        <p className="theme-text-muted text-sm">
          Keep explanatory notes, qualifications, and citation markers with each timing entry.
        </p>
      )}
      <EditorFieldRow layout="threeColumn">
        {toleranceLabels.map(({ icon, key, label }) => (
          <EditorField
            key={`${idPrefix}-${key}`}
            htmlFor={`${idPrefix}-${key}`}
            label={
              <span className="inline-flex items-center gap-1.5">
                <Icon icon={icon} size={14} className="theme-icon-accent" />
                {label}
              </span>
            }
          >
            {embedded ? (
              <Textarea
                id={`${idPrefix}-${key}`}
                {...register(`tolerance.${key}`)}
                placeholder="Enter a supported timing or explanatory note"
                textareaSize="sm"
                rows={3}
                className="resize-y"
              />
            ) : (
              <Input
                id={`${idPrefix}-${key}`}
                {...register(`tolerance.${key}`)}
                placeholder="e.g., ~3 days"
              />
            )}
          </EditorField>
        ))}
      </EditorFieldRow>
      {embedded ? (
        <TextListInput
          name="tolerance.cross_tolerance"
          label="Cross Tolerances"
          placeholder="Enter a cross-tolerance statement"
          addButtonLabel="Add cross-tolerance statement"
          helperText="Add one statement at a time. Enter adds it; Shift+Enter starts a new line."
          embedded
          icon={<Icon icon="lucide:merge" size={14} className="theme-icon-accent" />}
        />
      ) : (
        <ControlledTagMultiSelect
          name="tolerance.cross_tolerance"
          label="Cross Tolerances"
          placeholder="Add cross-tolerance"
          options={[]}
          addButtonLabel="Add"
          openStrategy="focus"
          icon={<Icon icon="lucide:merge" size={14} className="theme-icon-accent" />}
        />
      )}
    </section>
  );
}
