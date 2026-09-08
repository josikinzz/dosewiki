import { useFormContext } from "react-hook-form";
import { Icon } from "@/components/common/Icon";
import { Textarea } from "@/components/ui/textarea";
import { EditorField } from "@/features/dev/components";
import { CharacterCount } from "./FormHelpers";
import type { SubstanceArticle } from "@/schema";

export type NotesFieldsRHFProps = {
  idPrefix: string;
  describedBy?: string;
};

export function NotesFieldsRHF({ idPrefix, describedBy }: NotesFieldsRHFProps) {
  const { register, watch } = useFormContext<SubstanceArticle>();
  const summaryValue = watch("summary") ?? "";

  return (
    <section className="space-y-6">
      <EditorField
        htmlFor={`${idPrefix}-summary`}
        label={
          <span className="inline-flex items-center gap-1.5">
            <Icon icon="lucide:notebook-text" className="theme-icon-accent h-4 w-4" size={16} />
            Summary
          </span>
        }
      >
        <Textarea
          id={`${idPrefix}-summary`}
          aria-describedby={describedBy}
          className="min-h-[140px]"
          {...register("summary")}
          placeholder="Brief summary of the substance."
        />
        <CharacterCount value={summaryValue} />
      </EditorField>
    </section>
  );
}
