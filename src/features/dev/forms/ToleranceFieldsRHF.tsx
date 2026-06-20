import { useCallback } from "react";
import { useFormContext } from "react-hook-form";
import yaml from "yaml";
import { Icon } from "@/components/common/Icon";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { ArticleSectionGenerator } from "./ArticleSectionGenerator";
import { ControlledTagMultiSelect } from "./rhf";
import type { SubstanceArticle } from "@/schema";
import { useOptionalSubstanceEditorContext } from "../tools/substance-editor/SubstanceEditorContext";
import { useSectionPrompt } from "@/hooks/usePrompts";
import { toleranceLabels } from "./contentFieldsShared";
import { buildGeneratedSectionUpdate } from "@/lib/article/generatedSectionUpdate";

export type ToleranceFieldsRHFProps = {
  idPrefix: string;
};

export function ToleranceFieldsRHF({ idPrefix }: ToleranceFieldsRHFProps) {
  const { getValues, register, setValue } = useFormContext<SubstanceArticle>();
  const articlesContext = useOptionalSubstanceEditorContext();
  const { content: tolerancePrompt } = useSectionPrompt("tolerance");

  const getCurrentArticleYaml = useCallback((): string | null => {
    try {
      return yaml.stringify(getValues(), { lineWidth: 0, nullStr: "" });
    } catch {
      return null;
    }
  }, [getValues]);

  const handleApplyGenerated = useCallback((generatedYaml: string) => {
    try {
      const result = buildGeneratedSectionUpdate(
        getValues(),
        "tolerance",
        { kind: "generated_yaml", content: generatedYaml },
        "editor_apply",
      );
      const tolerance = result.nextArticle.tolerance;

      setValue("tolerance.full_tolerance", tolerance.full_tolerance);
      setValue("tolerance.half_tolerance", tolerance.half_tolerance);
      setValue("tolerance.baseline_tolerance", tolerance.baseline_tolerance);
      setValue("tolerance.cross_tolerance", tolerance.cross_tolerance);
    } catch (error) {
      console.error("Failed to parse generated tolerance YAML:", error);
    }
  }, [getValues, setValue]);

  return (
    <section className="space-y-6">
      {articlesContext && (
        <ArticleSectionGenerator
          sectionLabel="Tolerance"
          sectionKey="tolerance"
          prompt={tolerancePrompt}
          extractedContent={articlesContext.toleranceQuotes}
          extractedSources={articlesContext.toleranceSources}
          currentArticleYaml={getCurrentArticleYaml()}
          onApply={handleApplyGenerated}
          quoteSection="tolerance"
        />
      )}

      <div className="grid gap-4 md:grid-cols-3">
        {toleranceLabels.map(({ icon, key, label }) => (
          <div key={`${idPrefix}-${key}`} className="space-y-1">
            <Label className="inline-flex items-center gap-1.5">
              <Icon icon={icon} size={14} className="theme-icon-accent" />
              {label}
            </Label>
            <Input
              {...register(`tolerance.${key}`)}
              placeholder="e.g., ~3 days"
            />
          </div>
        ))}
      </div>
      <div className="space-y-1">
        <ControlledTagMultiSelect
          name="tolerance.cross_tolerance"
          label="Cross Tolerances"
          placeholder="Add cross-tolerance"
          options={[]}
          addButtonLabel="Add"
          openStrategy="focus"
          icon={<Icon icon="lucide:merge" size={14} className="theme-icon-accent" />}
        />
      </div>
    </section>
  );
}
