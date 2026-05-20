import { useCallback } from "react";
import { useFormContext } from "react-hook-form";
import yaml from "yaml";
import { Icon } from "@/components/common/Icon";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { ArticleSectionGenerator } from "./ArticleSectionGenerator";
import { CharacterCount } from "./FormHelpers";
import type { SubstanceArticle } from "@/schema";
import { useOptionalSubstanceEditorContext } from "../tools/substance-editor/SubstanceEditorContext";
import { useSectionPrompt } from "@/hooks/usePrompts";
import { parseSectionYamlObject } from "../tools/substance-editor/yamlParser";

export type NotesFieldsRHFProps = {
  idPrefix: string;
};

export function NotesFieldsRHF({ idPrefix }: NotesFieldsRHFProps) {
  const { getValues, register, setValue, watch } = useFormContext<SubstanceArticle>();
  const summaryValue = watch("summary") ?? "";
  const articlesContext = useOptionalSubstanceEditorContext();
  const { content: summaryPrompt } = useSectionPrompt("summary");

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
      const summary = parsed.summary ?? parsed;

      if (typeof summary === "string") {
        setValue("summary", summary);
      }
    } catch (error) {
      console.error("Failed to parse generated summary YAML:", error);
    }
  }, [setValue]);

  return (
    <section className="space-y-6">
      {articlesContext && (
        <ArticleSectionGenerator
          sectionLabel="Summary"
          sectionKey="summary"
          prompt={summaryPrompt}
          extractedContent={articlesContext.summaryQuotes}
          extractedSources={articlesContext.summarySources}
          currentArticleYaml={getCurrentArticleYaml()}
          onApply={handleApplyGenerated}
          quoteSection="summary"
        />
      )}

      <div className="space-y-1">
        <Label htmlFor={`${idPrefix}-summary`} className="flex items-center gap-1.5">
          <Icon icon="lucide:notebook-text" className="h-4 w-4 text-white/60" size={16} />
          Summary
        </Label>
        <Textarea
          id={`${idPrefix}-summary`}
          className="min-h-[140px]"
          {...register("summary")}
          placeholder="Brief summary of the substance."
        />
        <CharacterCount value={summaryValue} />
      </div>
    </section>
  );
}
