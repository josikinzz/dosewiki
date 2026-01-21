/**
 * RHF-based History & Culture fields component.
 * Supports freeform sections with custom headings chosen by the author/LLM,
 * and nested subsections for sections like "Notable Individuals".
 */

import { useCallback } from "react";
import { useFormContext, useFieldArray, useWatch } from "react-hook-form";
import { Icon } from "@/components/common/Icon";
import yaml from "yaml";

import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

import { CharacterCount } from "./FormHelpers";
import { SectionGenerator } from "../tools/substance-editor/SectionGenerator";
import { useOptionalSubstanceEditorContext } from "../tools/substance-editor/SubstanceEditorContext";
import { useSectionPrompt } from "@/hooks/usePrompts";
import type { SubstanceArticle, HistoryCulture } from "@/schema";

export type HistoryCultureFieldsRHFProps = {
  idPrefix: string;
};

/** Nested subsections field array component for a single section */
function SubsectionsFieldArray({
  sectionIndex,
  idPrefix,
}: {
  sectionIndex: number;
  idPrefix: string;
}) {
  const { register, control } = useFormContext<SubstanceArticle>();

  const { fields, append, remove } = useFieldArray({
    control,
    name: `history_culture.sections.${sectionIndex}.subsections` as const,
  });

  const handleAddSubsection = useCallback(() => {
    append({ heading: "", content: "", date_range: undefined });
  }, [append]);

  if (fields.length === 0) {
    return (
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={handleAddSubsection}
        className="mt-2 text-xs text-white/50 hover:text-white/80"
      >
        <Icon icon="lucide:plus" className="h-3 w-3 mr-1" size={12} />
        Add subsection (for notable individuals, etc.)
      </Button>
    );
  }

  return (
    <div className="mt-3 pl-4 border-l-2 border-white/10 space-y-3">
      <div className="text-xs text-white/50 font-medium">Subsections</div>
      {fields.map((field, subIndex) => (
        <div
          key={field.id}
          className="rounded-lg border border-white/5 bg-white/[0.02] p-3 space-y-2"
        >
          <div className="flex items-start gap-2">
            <div className="flex-1 space-y-2">
              <Input
                id={`${idPrefix}-section-${sectionIndex}-sub-${subIndex}-heading`}
                {...register(`history_culture.sections.${sectionIndex}.subsections.${subIndex}.heading`)}
                placeholder="Subsection heading (e.g., person name)"
                className="text-sm h-8"
              />
              {/* Date range inputs for subsections */}
              <div className="flex gap-2">
                <div className="flex-1 space-y-1">
                  <Label className="text-xs text-white/50">Start Date (optional)</Label>
                  <Input
                    {...register(`history_culture.sections.${sectionIndex}.subsections.${subIndex}.date_range.start`)}
                    placeholder="e.g., 1943"
                    className="h-7 text-xs"
                  />
                </div>
                <div className="flex-1 space-y-1">
                  <Label className="text-xs text-white/50">End Date (optional)</Label>
                  <Input
                    {...register(`history_culture.sections.${sectionIndex}.subsections.${subIndex}.date_range.end`)}
                    placeholder="e.g., 1970"
                    className="h-7 text-xs"
                  />
                </div>
              </div>
              <Textarea
                id={`${idPrefix}-section-${sectionIndex}-sub-${subIndex}-content`}
                className="min-h-[80px] text-sm"
                {...register(`history_culture.sections.${sectionIndex}.subsections.${subIndex}.content`)}
                placeholder="Subsection content..."
              />
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => remove(subIndex)}
              className="h-8 w-8 text-red-400/70 hover:text-red-300 hover:bg-red-500/10"
              title="Remove subsection"
            >
              <Icon icon="lucide:x" className="h-3 w-3" size={12} />
            </Button>
          </div>
        </div>
      ))}
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={handleAddSubsection}
        className="text-xs text-white/50 hover:text-white/80"
      >
        <Icon icon="lucide:plus" className="h-3 w-3 mr-1" size={12} />
        Add subsection
      </Button>
    </div>
  );
}

export function HistoryCultureFieldsRHF({ idPrefix }: HistoryCultureFieldsRHFProps) {
  const { register, control, getValues, setValue, watch } = useFormContext<SubstanceArticle>();

  const { fields, append, remove, move } = useFieldArray({
    control,
    name: "history_culture.sections",
  });

  const contentValue = watch("history_culture.content") ?? "";

  // Get articles context if available (only in Articles tab)
  const articlesContext = useOptionalSubstanceEditorContext();

  // Load prompt from Convex
  const { content: historyCulturePrompt } = useSectionPrompt("history_culture");

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
    append({ heading: "", content: "", date_range: undefined, subsections: [] });
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
                  <Icon icon="lucide:chevron-up" className="h-4 w-4" size={16} />
                </button>
                <button
                  type="button"
                  onClick={() => handleMoveDown(index)}
                  disabled={index === fields.length - 1}
                  className="p-1 text-white/40 hover:text-white/80 disabled:opacity-30 disabled:cursor-not-allowed"
                  title="Move down"
                >
                  <Icon icon="lucide:chevron-down" className="h-4 w-4" size={16} />
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

                {/* Date range inputs for sections */}
                <div className="flex gap-2">
                  <div className="flex-1 space-y-1">
                    <Label className="text-xs text-white/50">Start Date (optional)</Label>
                    <Input
                      {...register(`history_culture.sections.${index}.date_range.start`)}
                      placeholder="e.g., 1943"
                      className="h-8 text-sm"
                    />
                  </div>
                  <div className="flex-1 space-y-1">
                    <Label className="text-xs text-white/50">End Date (optional)</Label>
                    <Input
                      {...register(`history_culture.sections.${index}.date_range.end`)}
                      placeholder="e.g., 1970"
                      className="h-8 text-sm"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <Label htmlFor={`${idPrefix}-section-${index}-content`}>
                    Content
                  </Label>
                  <Textarea
                    id={`${idPrefix}-section-${index}-content`}
                    className="min-h-[120px]"
                    {...register(`history_culture.sections.${index}.content`)}
                    placeholder="Section content (leave empty if using subsections)..."
                  />
                </div>

                {/* Nested subsections */}
                <SubsectionsFieldArray sectionIndex={index} idPrefix={idPrefix} />
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
                <Icon icon="lucide:trash-2" className="h-4 w-4" size={16} />
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
          <Icon icon="lucide:plus" className="h-4 w-4 mr-2" size={16} />
          Add Section
        </Button>
      </div>
    </section>
  );
}
