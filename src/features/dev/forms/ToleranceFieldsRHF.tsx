import { useFormContext } from "react-hook-form";
import { Icon } from "@/components/common/Icon";
import { Input } from "@/components/ui/input";
import { EditorField, EditorFieldRow } from "@/features/dev/components";
import { ControlledTagMultiSelect } from "./rhf";
import type { SubstanceArticle } from "@/schema";
import { toleranceLabels } from "./contentFieldsShared";

export type ToleranceFieldsRHFProps = {
  idPrefix: string;
};

export function ToleranceFieldsRHF({ idPrefix }: ToleranceFieldsRHFProps) {
  const { register } = useFormContext<SubstanceArticle>();

  return (
    <section className="space-y-6">
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
            <Input
              id={`${idPrefix}-${key}`}
              {...register(`tolerance.${key}`)}
              placeholder="e.g., ~3 days"
            />
          </EditorField>
        ))}
      </EditorFieldRow>
      <ControlledTagMultiSelect
        name="tolerance.cross_tolerance"
        label="Cross Tolerances"
        placeholder="Add cross-tolerance"
        options={[]}
        addButtonLabel="Add"
        openStrategy="focus"
        icon={<Icon icon="lucide:merge" size={14} className="theme-icon-accent" />}
      />
    </section>
  );
}
