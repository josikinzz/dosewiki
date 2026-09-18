/**
 * RHF-based History & Culture fields component.
 * Supports freeform sections with custom headings chosen by the author/LLM,
 * and nested subsections for sections like "Notable Individuals".
 */

import { useCallback, useRef } from "react";
import { useFormContext, useFieldArray } from "react-hook-form";
import { Icon } from "@/components/common/Icon";

import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { TOUCH_ICON } from "@/components/ui/touchTargets";
import { Surface } from "@/components/ui/surface";
import { EditorFieldRow } from "@/features/dev/components";
import { FormEditorField } from "./FormEditorField";

import { CharacterCount } from "./FormHelpers";
import type { SubstanceArticle } from "@/schema";

export type HistoryCultureFieldsRHFProps = {
  idPrefix: string;
  embedded?: boolean;
};

/** Nested subsections field array component for a single section */
function SubsectionsFieldArray({
  sectionIndex,
  idPrefix,
  embedded,
}: {
  sectionIndex: number;
  idPrefix: string;
  embedded: boolean;
}) {
  const { register, control, getValues, setFocus } = useFormContext<SubstanceArticle>();
  const addSubsectionRef = useRef<HTMLButtonElement>(null);

  const { fields, append, remove } = useFieldArray({
    control,
    name: `history_culture.sections.${sectionIndex}.subsections` as const,
  });

  const handleAddSubsection = useCallback(() => {
    append({ heading: "", content: "", date_range: { start: "", end: "" } });
  }, [append]);

  const handleRemoveSubsection = useCallback((subIndex: number) => {
    const subsection = getValues(`history_culture.sections.${sectionIndex}.subsections.${subIndex}`);
    const populated = subsection?.heading?.trim() || subsection?.content?.trim()
      || subsection?.date_range?.start?.trim() || subsection?.date_range?.end?.trim();
    const heading = subsection?.heading?.trim() || `Subsection ${subIndex + 1}`;
    if (populated && typeof window !== "undefined" && !window.confirm(`Remove "${heading}"? This cannot be undone.`)) return;
    remove(subIndex);
    requestAnimationFrame(() => {
      if (fields.length > 1) {
        setFocus(`history_culture.sections.${sectionIndex}.subsections.${Math.min(subIndex, fields.length - 2)}.heading`);
      } else {
        addSubsectionRef.current?.focus();
      }
    });
  }, [fields.length, getValues, remove, sectionIndex, setFocus]);

  if (fields.length === 0) {
    return (
      <Button
        ref={addSubsectionRef}
        type="button"
        variant="ghost"
        size="sm"
        onClick={handleAddSubsection}
        className={embedded ? "theme-text-muted mt-2" : "theme-text-faint mt-2 text-xs"}
      >
        <Icon icon="lucide:plus" className="h-3 w-3 mr-1" size={12} />
        {embedded ? "Add subsection" : "Add subsection (for notable individuals, etc.)"}
      </Button>
    );
  }

  return (
    <div className={embedded ? "mt-3 space-y-3 border-l border-dose-border pl-3" : "mt-3 pl-4 border-l-2 border-dose-border space-y-3"}>
      <div className="theme-text-faint text-xs font-medium">Subsections</div>
      {fields.map((field, subIndex) => (
        <Surface
          key={field.id}
          variant="subtle"
          padding="xs"
          radius="lg"
          className="space-y-2"
        >
          <div className={embedded ? "grid grid-cols-[minmax(0,1fr)_auto] items-start gap-2" : "flex items-start gap-2"}>
            <div className={embedded ? "col-span-2 row-start-2 min-w-0 space-y-2" : "min-w-0 flex-1 space-y-2"}>
              <FormEditorField
                name={`history_culture.sections.${sectionIndex}.subsections.${subIndex}.heading`}
                htmlFor={`${idPrefix}-section-${sectionIndex}-sub-${subIndex}-heading`}
                label="Subsection Heading"
              >
                <Input
                  id={`${idPrefix}-section-${sectionIndex}-sub-${subIndex}-heading`}
                  {...register(`history_culture.sections.${sectionIndex}.subsections.${subIndex}.heading`)}
                  placeholder="Subsection heading (e.g., person name)"
                  inputSize="sm"
                />
              </FormEditorField>
              {/* Date range inputs for subsections */}
              <EditorFieldRow layout="twoColumn">
                <FormEditorField
                  name={`history_culture.sections.${sectionIndex}.subsections.${subIndex}.date_range.start`}
                  htmlFor={`${idPrefix}-section-${sectionIndex}-sub-${subIndex}-start`}
                  label="Start Date (optional)"
                >
                  <Input
                    id={`${idPrefix}-section-${sectionIndex}-sub-${subIndex}-start`}
                    {...register(`history_culture.sections.${sectionIndex}.subsections.${subIndex}.date_range.start`)}
                    placeholder="e.g., 1943"
                    inputSize="sm"
                  />
                </FormEditorField>
                <FormEditorField
                  name={`history_culture.sections.${sectionIndex}.subsections.${subIndex}.date_range.end`}
                  htmlFor={`${idPrefix}-section-${sectionIndex}-sub-${subIndex}-end`}
                  label="End Date (optional)"
                >
                  <Input
                    id={`${idPrefix}-section-${sectionIndex}-sub-${subIndex}-end`}
                    {...register(`history_culture.sections.${sectionIndex}.subsections.${subIndex}.date_range.end`)}
                    placeholder="e.g., 1970"
                    inputSize="sm"
                  />
                </FormEditorField>
              </EditorFieldRow>
              <FormEditorField
                name={`history_culture.sections.${sectionIndex}.subsections.${subIndex}.content`}
                htmlFor={`${idPrefix}-section-${sectionIndex}-sub-${subIndex}-content`}
                label="Subsection Content"
              >
                <Textarea
                  id={`${idPrefix}-section-${sectionIndex}-sub-${subIndex}-content`}
                  className="min-h-[80px]"
                  {...register(`history_culture.sections.${sectionIndex}.subsections.${subIndex}.content`)}
                  placeholder="Subsection content..."
                />
              </FormEditorField>
            </div>
            <Button
              type="button"
              variant="ghostDestructive"
              size="icon"
              onClick={() => handleRemoveSubsection(subIndex)}
              className={`h-8 w-8 ${TOUCH_ICON} ${embedded ? "col-start-2 row-start-1 justify-self-end" : ""}`}
              title="Remove subsection"
              aria-label={`Remove subsection ${subIndex + 1}`}
            >
              <Icon icon="lucide:trash-2" className="h-3 w-3" size={12} />
            </Button>
          </div>
        </Surface>
      ))}
      <Button
        ref={addSubsectionRef}
        type="button"
        variant="ghost"
        size="sm"
        onClick={handleAddSubsection}
        className="theme-text-faint text-xs"
      >
        <Icon icon="lucide:plus" className="h-3 w-3 mr-1" size={12} />
        Add subsection
      </Button>
    </div>
  );
}

export function HistoryCultureFieldsRHF({ idPrefix, embedded = false }: HistoryCultureFieldsRHFProps) {
  const { register, control, watch, getValues, setFocus } = useFormContext<SubstanceArticle>();
  const addSectionRef = useRef<HTMLButtonElement>(null);

  const { fields, append, remove, move } = useFieldArray({
    control,
    name: "history_culture.sections",
  });

  const contentValue = watch("history_culture.content") ?? "";

  const handleAddSection = useCallback(() => {
    append({ heading: "", content: "", date_range: { start: "", end: "" }, subsections: [] });
  }, [append]);

  /**
   * Removing a section also drops every subsection nested under it, and there
   * is no undo — so the click asks first and says how much it takes.
   */
  const handleRemoveSection = useCallback((index: number) => {
    const section = getValues(`history_culture.sections.${index}`);
    const heading = section?.heading?.trim() || `Section ${index + 1}`;
    const subsectionCount = section?.subsections?.length ?? 0;
    const subsectionDetail = subsectionCount > 0
      ? ` and its ${subsectionCount} subsection${subsectionCount === 1 ? "" : "s"}`
      : "";
    if (
      typeof window !== "undefined"
      && !window.confirm(`Remove "${heading}"${subsectionDetail}? This cannot be undone.`)
    ) {
      return;
    }
    remove(index);
    requestAnimationFrame(() => {
      if (fields.length > 1) {
        setFocus(`history_culture.sections.${Math.min(index, fields.length - 2)}.heading`);
      } else {
        addSectionRef.current?.focus();
      }
    });
  }, [fields.length, getValues, remove, setFocus]);

  const handleMoveUp = useCallback((index: number) => {
    if (index > 0) {
      move(index, index - 1);
      requestAnimationFrame(() => setFocus(`history_culture.sections.${index - 1}.heading`));
    }
  }, [move, setFocus]);

  const handleMoveDown = useCallback((index: number) => {
    if (index < fields.length - 1) {
      move(index, index + 1);
      requestAnimationFrame(() => setFocus(`history_culture.sections.${index + 1}.heading`));
    }
  }, [move, fields.length, setFocus]);

  return (
    <section className="space-y-6">
      {/* Main freeform content */}
      <FormEditorField
        htmlFor={`${idPrefix}-history-content`}
        label={embedded ? "Overview (optional)" : "Content"}
        description={embedded ? "Write an overview, add named sections below, or use both. Each section can contain subsections." : undefined}
        name="history_culture.content"
      >
        <Textarea
          id={`${idPrefix}-history-content`}
          className={embedded ? "min-h-[100px]" : "min-h-[150px]"}
          {...register("history_culture.content")}
          placeholder="Write an overview of the history and culture."
        />
        <CharacterCount value={contentValue} />
      </FormEditorField>

      {/* Dynamic sections */}
      <div className="space-y-4">
        {fields.map((field, index) => (
          <Surface
            key={field.id}
            variant="subtle"
            padding="sm"
            radius="lg"
            className="space-y-3"
          >
            <div className={embedded ? "grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3" : "flex items-start gap-3"}>
              {/* Section order controls */}
              <div className={embedded ? "flex flex-wrap items-center gap-1" : "flex flex-col gap-1 pt-1"}>
                {embedded && <span className="theme-text-muted mr-2 text-sm">Section {index + 1}</span>}
                <Button
                  type="button"
                  variant="iconGhost"
                  onClick={() => handleMoveUp(index)}
                  disabled={index === 0}
                  className="theme-text-faint rounded-md p-1 hover:bg-transparent disabled:opacity-30 disabled:cursor-not-allowed"
                  title="Move up"
                  aria-label={`Move section ${index + 1} up`}
                >
                  <Icon icon="lucide:chevron-up" className="h-4 w-4" size={16} />
                </Button>
                <Button
                  type="button"
                  variant="iconGhost"
                  onClick={() => handleMoveDown(index)}
                  disabled={index === fields.length - 1}
                  className="theme-text-faint rounded-md p-1 hover:bg-transparent disabled:opacity-30 disabled:cursor-not-allowed"
                  title="Move down"
                  aria-label={`Move section ${index + 1} down`}
                >
                  <Icon icon="lucide:chevron-down" className="h-4 w-4" size={16} />
                </Button>
              </div>

              {/* Section content */}
              <div className={embedded ? "col-span-2 row-start-2 min-w-0 space-y-3" : "min-w-0 flex-1 space-y-3"}>
                <FormEditorField
                  name={`history_culture.sections.${index}.heading`}
                  htmlFor={`${idPrefix}-section-${index}-heading`}
                  label="Section Heading"
                >
                  <Input
                    id={`${idPrefix}-section-${index}-heading`}
                    {...register(`history_culture.sections.${index}.heading`)}
                    placeholder="e.g., Discovery & Synthesis, Cultural Significance, Notable Figures..."
                  />
                </FormEditorField>

                {/* Date range inputs for sections */}
                <EditorFieldRow layout="twoColumn">
                  <FormEditorField
                    name={`history_culture.sections.${index}.date_range.start`}
                    htmlFor={`${idPrefix}-section-${index}-start`}
                    label="Start Date (optional)"
                  >
                    <Input
                      id={`${idPrefix}-section-${index}-start`}
                      {...register(`history_culture.sections.${index}.date_range.start`)}
                      placeholder="e.g., 1943"
                      inputSize="sm"
                    />
                  </FormEditorField>
                  <FormEditorField
                    name={`history_culture.sections.${index}.date_range.end`}
                    htmlFor={`${idPrefix}-section-${index}-end`}
                    label="End Date (optional)"
                  >
                    <Input
                      id={`${idPrefix}-section-${index}-end`}
                      {...register(`history_culture.sections.${index}.date_range.end`)}
                      placeholder="e.g., 1970"
                      inputSize="sm"
                    />
                  </FormEditorField>
                </EditorFieldRow>

                <FormEditorField
                  name={`history_culture.sections.${index}.content`}
                  htmlFor={`${idPrefix}-section-${index}-content`}
                  label={embedded ? "Section content" : "Content"}
                >
                  <Textarea
                    id={`${idPrefix}-section-${index}-content`}
                    className="min-h-[120px]"
                    {...register(`history_culture.sections.${index}.content`)}
                    placeholder="Section content (leave empty if using subsections)..."
                  />
                </FormEditorField>

                {/* Nested subsections */}
                <SubsectionsFieldArray sectionIndex={index} idPrefix={idPrefix} embedded={embedded} />
              </div>

              {/* Delete button */}
              <Button
                type="button"
                variant="ghostDestructive"
                size="icon"
                onClick={() => handleRemoveSection(index)}
                title="Remove section"
                aria-label={`Remove section ${index + 1}`}
                className={embedded ? "col-start-2 row-start-1 justify-self-end" : undefined}
              >
                <Icon icon="lucide:trash-2" className="h-4 w-4" size={16} />
              </Button>
            </div>
          </Surface>
        ))}

        {/* Add section button */}
        <Button
          ref={addSectionRef}
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
