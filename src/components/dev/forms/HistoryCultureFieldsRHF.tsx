/**
 * RHF-based History & Culture fields component.
 * Supports freeform sections with custom headings chosen by the author/LLM.
 */

import { useCallback } from "react";
import { useFormContext, useFieldArray } from "react-hook-form";
import { Plus, Trash2, GripVertical } from "lucide-react";
import yaml from "yaml";

import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

import { CharacterCount } from "./FormHelpers";
import { SectionGenerator } from "../tools/articles/SectionGenerator";
import { useOptionalArticlesContext } from "../tools/articles/ArticlesContext";
import { historyCulturePrompt } from "../../../data/config/sectionPrompts";
import type { SubstanceArticle, HistoryCulture } from "../../../schema";

export type HistoryCultureFieldsRHFProps = {
  idPrefix: string;
};

export function HistoryCultureFieldsRHF({ idPrefix }: HistoryCultureFieldsRHFProps) {
  const { register, control, getValues, setValue, watch } = useFormContext<SubstanceArticle>();
  
  const { fields, append, remove, move } = useFieldArray({
    control,
    name: "history_culture.sections",
  });

  const contentValue = watch("history_culture.content") ?? "";
  
  // Get articles context if available (only in Articles tab)
  const articlesContext = useOptionalArticlesContext();

  // Get current article as YAML for context in generation
  const getCurrentArticleYaml = useCallback((): string | null => {
    try {
      const values = getValues();
      return yaml.stringify(values, { lineWidth: 0, nullStr: "" });
    } catch {
      return null;
    }
  }, [getValues]);

  // Strip markdown code fences from LLM output
  const stripCodeFences = (text: string): string => {
    return text
      .replace(/^```(?:yaml|yml)?\s*\n?/i, "")  // Opening fence
      .replace(/\n?```\s*$/i, "")               // Closing fence
      .trim();
  };

  // Handle applying generated history & culture YAML to form
  const handleApplyGenerated = useCallback((generatedYaml: string) => {
    try {
      const cleanYaml = stripCodeFences(generatedYaml);
      const parsed = yaml.parse(cleanYaml);
      const historyCulture: HistoryCulture = parsed.history_culture ?? parsed;
      
      // Apply both content and sections
      setValue("history_culture.content", historyCulture.content ?? "");
      setValue("history_culture.sections", historyCulture.sections ?? []);
    } catch (error) {
      console.error("Failed to parse generated history & culture YAML:", error);
    }
  }, [setValue]);

  const handleAddSection = useCallback(() => {
    append({ heading: "", content: "" });
  }, [append]);

  const handleMoveUp = useCallback((index: number) => {
    if (index > 0) {
      move(index, index - 1);
    }
  }, [move]);

  const handleMoveDown = useCallback((index: number) => {
    if (index < fields.length - 1) {
      move(index, index + 1);
    }
  }, [move, fields.length]);

  return (
    <section className="space-y-6">
      {/* AI Section Generator - only shown when in Articles context */}
      {articlesContext && (
        <SectionGenerator
          sectionLabel="History & Culture"
          sectionKey="history_culture"
          prompt={historyCulturePrompt}
          extractedContent={articlesContext.historyCultureQuotes}
          extractedSources={articlesContext.historyCultureSources}
          genericSources={articlesContext.getAllSources()}
          currentArticleYaml={getCurrentArticleYaml()}
          onApply={handleApplyGenerated}
          apiKey={articlesContext.apiKey}
          model={articlesContext.model}
          isKeyValid={articlesContext.isKeyValid}
          substanceSlug={articlesContext.selectedSubstanceSlug}
          quoteSection="history_culture"
        />
      )}
      
      {/* Main freeform content */}
      <div className="space-y-2">
        <Label htmlFor={`${idPrefix}-history-content`}>
          Content
        </Label>
        <Textarea
          id={`${idPrefix}-history-content`}
          className="min-h-[150px]"
          {...register("history_culture.content")}
          placeholder="Freeform history and culture content. Use this alone for simpler substances, or leave empty and use subsections below for more detailed histories."
        />
        <CharacterCount value={contentValue} />
      </div>

      {/* Dynamic sections */}
      <div className="space-y-4">
        {fields.map((field, index) => (
          <div
            key={field.id}
            className="rounded-xl border border-white/10 bg-white/5 p-4 space-y-3"
          >
            <div className="flex items-start gap-3">
              {/* Drag handle / reorder buttons */}
              <div className="flex flex-col gap-1 pt-1">
                <button
                  type="button"
                  onClick={() => handleMoveUp(index)}
                  disabled={index === 0}
                  className="p-1 text-white/40 hover:text-white/80 disabled:opacity-30 disabled:cursor-not-allowed"
                  title="Move up"
                >
                  <GripVertical className="h-4 w-4 rotate-180" />
                </button>
                <button
                  type="button"
                  onClick={() => handleMoveDown(index)}
                  disabled={index === fields.length - 1}
                  className="p-1 text-white/40 hover:text-white/80 disabled:opacity-30 disabled:cursor-not-allowed"
                  title="Move down"
                >
                  <GripVertical className="h-4 w-4" />
                </button>
              </div>
              
              {/* Section content */}
              <div className="flex-1 space-y-3">
                <div className="space-y-1">
                  <Label htmlFor={`${idPrefix}-section-${index}-heading`}>
                    Section Heading
                  </Label>
                  <Input
                    id={`${idPrefix}-section-${index}-heading`}
                    {...register(`history_culture.sections.${index}.heading`)}
                    placeholder="e.g., Discovery & Synthesis, Cultural Significance, Notable Figures..."
                  />
                </div>
                
                <div className="space-y-1">
                  <Label htmlFor={`${idPrefix}-section-${index}-content`}>
                    Content
                  </Label>
                  <Textarea
                    id={`${idPrefix}-section-${index}-content`}
                    className="min-h-[120px]"
                    {...register(`history_culture.sections.${index}.content`)}
                    placeholder="Section content..."
                  />
                </div>
              </div>
              
              {/* Delete button */}
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => remove(index)}
                className="text-red-400 hover:text-red-300 hover:bg-red-500/10"
                title="Remove section"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </div>
        ))}
        
        {/* Add section button */}
        <Button
          type="button"
          variant="outline"
          onClick={handleAddSection}
          className="w-full border-dashed"
        >
          <Plus className="h-4 w-4 mr-2" />
          Add Section
        </Button>
      </div>
    </section>
  );
}
