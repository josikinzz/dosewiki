import { useFormContext, type FieldArrayPath, type UseFieldArrayReturn } from "react-hook-form";
import { Icon } from "@/components/common/Icon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EditorFieldRow } from "@/features/dev/components";
import { FormEditorField } from "./FormEditorField";
import type { SubstanceArticle } from "@/schema";

import { EntryCard } from "./EntryCard";

type CitationArrayName = Extract<FieldArrayPath<SubstanceArticle>, "source_citations" | "citations">;

export type CitationArrayFieldsRHFProps<TName extends CitationArrayName> = {
  items: UseFieldArrayReturn<SubstanceArticle, TName>;
  name: TName;
  roleLabel: string;
  itemLabel: string;
  addLabel: string;
  nameLabel: string;
  urlLabel: string;
  namePlaceholder: string;
  helperText?: string;
  onAdd: () => void;
  onRemove: (index: number) => void;
  allowRemoveLast?: boolean;
  icon: "lucide:book-open" | "lucide:library";
};

export function CitationArrayFieldsRHF<TName extends CitationArrayName>({
  items,
  name,
  roleLabel,
  itemLabel,
  addLabel,
  nameLabel,
  urlLabel,
  namePlaceholder,
  helperText,
  onAdd,
  onRemove,
  allowRemoveLast = true,
  icon,
}: CitationArrayFieldsRHFProps<TName>) {
  const { register } = useFormContext<SubstanceArticle>();
  const canRemove = allowRemoveLast || items.fields.length > 1;

  return (
    <section className="space-y-4" aria-label={roleLabel}>
      <div className="space-y-3">
        {items.fields.map((field, index) => {
          return (
            <EntryCard
              key={field.id}
              icon={<Icon icon={icon} size={16} />}
              title={`${itemLabel} ${index + 1}`}
              onRemove={canRemove ? () => onRemove(index) : undefined}
              removeLabel={`Remove ${itemLabel.toLowerCase()} ${index + 1}`}
            >
              <EditorFieldRow layout="twoColumn">
                <FormEditorField
                  htmlFor={`${name}-${index}-name`}
                  label={nameLabel}
                  name={`${name}.${index}.name`}
                >
                  <Input
                    id={`${name}-${index}-name`}
                    {...register(`${name}.${index}.name`)}
                    placeholder={namePlaceholder}
                  />
                </FormEditorField>
                <FormEditorField
                  htmlFor={`${name}-${index}-url`}
                  label={urlLabel}
                  name={`${name}.${index}.url`}
                >
                  <Input
                    id={`${name}-${index}-url`}
                    {...register(`${name}.${index}.url`)}
                    placeholder="https://..."
                  />
                </FormEditorField>
              </EditorFieldRow>
            </EntryCard>
          );
        })}
      </div>
      <Button
        type="button"
        variant="outline"
        className="w-full border-dashed"
        onClick={onAdd}
      >
        {addLabel}
      </Button>
      {helperText ? <p className="theme-text-faint text-xs">{helperText}</p> : null}
    </section>
  );
}
