import { useCallback } from "react";
import { useFormContext } from "react-hook-form";
import yaml from "yaml";
import { Icon } from "@/components/common/Icon";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { ControlledTagMultiSelect } from "./rhf";
import type { SubstanceArticle, Tolerance } from "@/schema";
import { SectionGenerator } from "../tools/substance-editor/SectionGenerator";
import { useOptionalSubstanceEditorContext } from "../tools/substance-editor/SubstanceEditorContext";
import { useSectionPrompt } from "@/hooks/usePrompts";
import { parseSectionYamlObject } from "../tools/substance-editor/yamlParser";
import { toleranceLabels } from "./contentFieldsShared";

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
      const parsed = parseSectionYamlObject<Record<string, unknown>>(generatedYaml);
      const tolerance = (parsed.tolerance ?? parsed) as Partial<Tolerance>;

      setValue("tolerance.full_tolerance", tolerance.full_tolerance ?? "");
      setValue("tolerance.half_tolerance", tolerance.half_tolerance ?? "");
      setValue("tolerance.baseline_tolerance", tolerance.baseline_tolerance ?? "");
      setValue("tolerance.cross_tolerance", tolerance.cross_tolerance ?? []);
    } catch (error) {
      console.error("Failed to parse generated tolerance YAML:", error);
    }
  }, [setValue]);

  return (
    <section className="space-y-6">
      {articlesContext && (
        <SectionGenerator
          sectionLabel="Tolerance"
          sectionKey="tolerance"
          prompt={tolerancePrompt}
          extractedContent={articlesContext.toleranceQuotes}
          extractedSources={articlesContext.toleranceSources}
          genericSources={articlesContext.getAllSources()}
          currentArticleYaml={getCurrentArticleYaml()}
          onApply={handleApplyGenerated}
          apiKey={articlesContext.apiKey}
          model={articlesContext.model}
          isKeyValid={articlesContext.isKeyValid}
          substanceSlug={articlesContext.selectedSubstanceSlug}
          quoteSection="tolerance"
        />
      )}

      <div className="grid gap-4 md:grid-cols-3">
        {toleranceLabels.map(({ icon, key, label }) => (
          <div key={`${idPrefix}-${key}`} className="space-y-1">
            <Label className="inline-flex items-center gap-1.5">
              <Icon icon={icon} size={14} className="text-fuchsia-300" />
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
          icon={<Icon icon="lucide:merge" size={14} className="text-fuchsia-300" />}
        />
      </div>
    </section>
  );
}
