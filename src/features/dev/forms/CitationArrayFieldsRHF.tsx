import { useFormContext, type FieldArrayPath, type UseFieldArrayReturn } from "react-hook-form";
import { Icon } from "@/components/common/Icon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { SubstanceArticle } from "@/schema";

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
            <div key={field.id} className="space-y-3 rounded-2xl border border-white/10 bg-[color-mix(in_srgb,#020617_45%,var(--theme-panel-base))] p-4">
              <div className="flex items-center justify-between gap-3">
                <p className="flex items-center gap-1.5 text-sm font-semibold text-white/75">
                  <Icon icon={icon} size={16} className="text-white/50" />
                  {itemLabel} {index + 1}
                </p>
                {canRemove && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => onRemove(index)}
                  >
                    Remove
                  </Button>
                )}
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-1">
                  <Label>{nameLabel}</Label>
                  <Input
                    {...register(`${name}.${index}.name`)}
                    placeholder={namePlaceholder}
                  />
                </div>
                <div className="space-y-1">
                  <Label>{urlLabel}</Label>
                  <Input
                    {...register(`${name}.${index}.url`)}
                    placeholder="https://..."
                  />
                </div>
              </div>
            </div>
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
      {helperText ? <p className="text-xs text-white/45">{helperText}</p> : null}
    </section>
  );
}
