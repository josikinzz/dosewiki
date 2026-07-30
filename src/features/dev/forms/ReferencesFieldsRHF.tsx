import { useDeferredValue, useState } from "react";
import {
  Controller,
  useFormContext,
  useWatch,
  type Control,
} from "react-hook-form";

import { Icon } from "@/components/common/Icon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { EditorFieldRow, EditorSelect } from "@/features/dev/components";
import type { SubstanceArticle } from "@/schema";

import { useArticleFormContext } from "./ArticleFormContext";
import { FormEditorField } from "./FormEditorField";
import { EntryCard } from "./EntryCard";
import { EditorCitationDiagnosticsPanel } from "./EditorCitationDiagnosticsPanel";
import { copyCitationTag, QuickAddReferenceCard } from "./QuickAddReferenceCard";
import {
  REFERENCE_QUALITY_OPTIONS,
  REFERENCE_SOURCE_TYPE_OPTIONS,
  REFERENCE_TYPE_OPTIONS,
  formatReferenceAuthors,
  formatReferenceYear,
  normalizeOptionalReferenceText,
  parseReferenceAuthors,
  parseReferenceYear,
} from "./referenceFormShared";

/**
 * The diagnostics panel needs every prose field in the article — `[cite:]`
 * tokens live anywhere — so the subscription cannot be narrowed to a field
 * list. It is isolated here so a keystroke anywhere in the form no longer
 * re-renders every reference card, and deferred so the panel's whole-document
 * work runs once the typing settles instead of once per keystroke.
 */
function ReferencesCitationDiagnostics({ control }: { control: Control<SubstanceArticle> }) {
  const article = useWatch({ control }) as SubstanceArticle;
  const settledArticle = useDeferredValue(article);

  return <EditorCitationDiagnosticsPanel article={settledArticle} compact headingLevel="h3" />;
}

function ReferenceEntryCard({
  index,
  control,
  copiedReferenceId,
  onCopyTag,
  onRemove,
}: {
  index: number;
  control: Control<SubstanceArticle>;
  copiedReferenceId: string | null;
  onCopyTag: (id: string) => void;
  onRemove: (id: string) => void;
}) {
  const { register } = useFormContext<SubstanceArticle>();
  const referenceId = useWatch({ control, name: `references.${index}.id` as const });

  return (
    <EntryCard
      bodyClassName="space-y-4"
      icon={<Icon icon="lucide:file-stack" size={16} />}
      title={
        <span className="flex min-w-0 flex-col">
          <span className="theme-text-secondary text-sm font-semibold">Reference {index + 1}</span>
          <span className="theme-text-faint truncate text-xs font-normal">
            {referenceId || "New structured reference"}
          </span>
        </span>
      }
      badge={
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => onCopyTag(referenceId)}
          disabled={!referenceId}
        >
          {copiedReferenceId === referenceId ? "Copied" : "Copy tag"}
        </Button>
      }
      onRemove={() => onRemove(referenceId)}
      removeLabel={`Remove reference ${index + 1}`}
    >
      <EditorFieldRow layout="twoColumn">
        <FormEditorField
          htmlFor={`reference-id-${index}`}
          label="Stable ID"
          name={`references.${index}.id` as const}
        >
          <Input
            id={`reference-id-${index}`}
            {...register(`references.${index}.id` as const)}
            placeholder="pmid-12345"
          />
        </FormEditorField>
        <FormEditorField
          htmlFor={`reference-title-${index}`}
          label="Title"
          name={`references.${index}.title` as const}
        >
          <Input
            id={`reference-title-${index}`}
            {...register(`references.${index}.title` as const)}
            placeholder="Article or source title"
          />
        </FormEditorField>
      </EditorFieldRow>

      <EditorFieldRow layout="threeColumn">
        <FormEditorField
          htmlFor={`reference-type-${index}`}
          label="Reference Type"
          name={`references.${index}.type` as const}
        >
          <Controller
            control={control}
            name={`references.${index}.type` as const}
            render={({ field: controllerField }) => (
              <EditorSelect
                value={controllerField.value}
                id={`reference-type-${index}`}
                onChange={(event) => controllerField.onChange(event.target.value)}
                options={REFERENCE_TYPE_OPTIONS.map((option) => ({ value: option, label: option }))}
              />
            )}
          />
        </FormEditorField>
        <FormEditorField
          htmlFor={`reference-source-type-${index}`}
          label="Source Type"
          name={`references.${index}.sourceType` as const}
        >
          <Controller
            control={control}
            name={`references.${index}.sourceType` as const}
            render={({ field: controllerField }) => (
              <EditorSelect
                value={controllerField.value}
                id={`reference-source-type-${index}`}
                onChange={(event) => controllerField.onChange(event.target.value)}
                options={REFERENCE_SOURCE_TYPE_OPTIONS.map((option) => ({ value: option, label: option }))}
              />
            )}
          />
        </FormEditorField>
        <FormEditorField
          htmlFor={`reference-quality-${index}`}
          label="Quality"
          name={`references.${index}.quality` as const}
        >
          <Controller
            control={control}
            name={`references.${index}.quality` as const}
            render={({ field: controllerField }) => (
              <EditorSelect
                value={controllerField.value}
                id={`reference-quality-${index}`}
                onChange={(event) => controllerField.onChange(event.target.value)}
                options={REFERENCE_QUALITY_OPTIONS.map((option) => ({ value: option, label: option }))}
              />
            )}
          />
        </FormEditorField>
      </EditorFieldRow>

      <FormEditorField
        htmlFor={`reference-authors-${index}`}
        label="Authors"
        name={`references.${index}.authors` as const}
      >
        <Controller
          control={control}
          name={`references.${index}.authors` as const}
          render={({ field: controllerField }) => (
            <Input
              id={`reference-authors-${index}`}
              value={formatReferenceAuthors(controllerField.value)}
              onChange={(event) => controllerField.onChange(parseReferenceAuthors(event.target.value))}
              placeholder="Author One, Author Two"
            />
          )}
        />
      </FormEditorField>

      <EditorFieldRow layout="threeColumn">
        <FormEditorField
          htmlFor={`reference-year-${index}`}
          label="Year"
          name={`references.${index}.year` as const}
        >
          <Controller
            control={control}
            name={`references.${index}.year` as const}
            render={({ field: controllerField }) => (
              <Input
                id={`reference-year-${index}`}
                value={formatReferenceYear(controllerField.value)}
                onChange={(event) => controllerField.onChange(parseReferenceYear(event.target.value))}
                placeholder="2024"
              />
            )}
          />
        </FormEditorField>
        <FormEditorField
          htmlFor={`reference-date-${index}`}
          label="Date"
          name={`references.${index}.date` as const}
        >
          <Controller
            control={control}
            name={`references.${index}.date` as const}
            render={({ field: controllerField }) => (
              <Input
                id={`reference-date-${index}`}
                value={controllerField.value ?? ""}
                onChange={(event) => controllerField.onChange(normalizeOptionalReferenceText(event.target.value))}
                placeholder="2024-07-18"
              />
            )}
          />
        </FormEditorField>
        <FormEditorField
          htmlFor={`reference-accessed-${index}`}
          label="Accessed"
          name={`references.${index}.accessedAt` as const}
        >
          <Controller
            control={control}
            name={`references.${index}.accessedAt` as const}
            render={({ field: controllerField }) => (
              <Input
                id={`reference-accessed-${index}`}
                value={controllerField.value ?? ""}
                onChange={(event) => controllerField.onChange(normalizeOptionalReferenceText(event.target.value))}
                placeholder="2026-05-01"
              />
            )}
          />
        </FormEditorField>
      </EditorFieldRow>

      <EditorFieldRow layout="twoColumn">
        <FormEditorField
          htmlFor={`reference-container-${index}`}
          label="Container / Journal"
          name={`references.${index}.containerTitle` as const}
        >
          <Controller
            control={control}
            name={`references.${index}.containerTitle` as const}
            render={({ field: controllerField }) => (
              <Input
                id={`reference-container-${index}`}
                value={controllerField.value ?? ""}
                onChange={(event) => controllerField.onChange(normalizeOptionalReferenceText(event.target.value))}
                placeholder="Journal of ..."
              />
            )}
          />
        </FormEditorField>
        <FormEditorField
          htmlFor={`reference-site-name-${index}`}
          label="Site Name"
          name={`references.${index}.siteName` as const}
        >
          <Controller
            control={control}
            name={`references.${index}.siteName` as const}
            render={({ field: controllerField }) => (
              <Input
                id={`reference-site-name-${index}`}
                value={controllerField.value ?? ""}
                onChange={(event) => controllerField.onChange(normalizeOptionalReferenceText(event.target.value))}
                placeholder="PubMed, PsychonautWiki, NIH..."
              />
            )}
          />
        </FormEditorField>
      </EditorFieldRow>

      <EditorFieldRow layout="twoColumn">
        <FormEditorField
          htmlFor={`reference-publisher-${index}`}
          label="Publisher"
          name={`references.${index}.publisher` as const}
        >
          <Controller
            control={control}
            name={`references.${index}.publisher` as const}
            render={({ field: controllerField }) => (
              <Input
                id={`reference-publisher-${index}`}
                value={controllerField.value ?? ""}
                onChange={(event) => controllerField.onChange(normalizeOptionalReferenceText(event.target.value))}
                placeholder="Publisher"
              />
            )}
          />
        </FormEditorField>
        <FormEditorField
          htmlFor={`reference-url-${index}`}
          label="URL"
          name={`references.${index}.url` as const}
        >
          <Controller
            control={control}
            name={`references.${index}.url` as const}
            render={({ field: controllerField }) => (
              <Input
                id={`reference-url-${index}`}
                value={controllerField.value ?? ""}
                onChange={(event) => controllerField.onChange(normalizeOptionalReferenceText(event.target.value))}
                placeholder="https://..."
              />
            )}
          />
        </FormEditorField>
      </EditorFieldRow>

      <EditorFieldRow layout="threeColumn">
        {(["volume", "issue", "pages"] as const).map((fieldName) => (
          <FormEditorField
            key={fieldName}
            htmlFor={`reference-${fieldName}-${index}`}
            label={`${fieldName[0].toUpperCase()}${fieldName.slice(1)}`}
            name={`references.${index}.${fieldName}` as const}
          >
            <Controller
              control={control}
              name={`references.${index}.${fieldName}` as const}
              render={({ field: controllerField }) => (
                <Input
                  id={`reference-${fieldName}-${index}`}
                  value={controllerField.value ?? ""}
                  onChange={(event) => controllerField.onChange(normalizeOptionalReferenceText(event.target.value))}
                />
              )}
            />
          </FormEditorField>
        ))}
      </EditorFieldRow>

      <EditorFieldRow layout="threeColumn">
        {(["articleNumber", "doi", "pmid", "isbn"] as const).map((fieldName) => (
          <FormEditorField
            key={fieldName}
            htmlFor={`reference-${fieldName}-${index}`}
            label={fieldName === "pmid" ? "PMID" : fieldName === "doi" ? "DOI" : fieldName === "isbn" ? "ISBN" : "Article Number"}
            name={`references.${index}.${fieldName}` as const}
          >
            <Controller
              control={control}
              name={`references.${index}.${fieldName}` as const}
              render={({ field: controllerField }) => (
                <Input
                  id={`reference-${fieldName}-${index}`}
                  value={controllerField.value ?? ""}
                  onChange={(event) => controllerField.onChange(normalizeOptionalReferenceText(event.target.value))}
                />
              )}
            />
          </FormEditorField>
        ))}
      </EditorFieldRow>

      <FormEditorField
        htmlFor={`reference-apa-text-${index}`}
        label="APA text override"
        name={`references.${index}.apaText` as const}
      >
        <Controller
          control={control}
          name={`references.${index}.apaText` as const}
          render={({ field: controllerField }) => (
            <Textarea
              id={`reference-apa-text-${index}`}
              value={controllerField.value ?? ""}
              onChange={(event) => controllerField.onChange(normalizeOptionalReferenceText(event.target.value))}
              className="min-h-[88px]"
              placeholder="Optional: provide the exact reference text to render publicly."
            />
          )}
        />
      </FormEditorField>
    </EntryCard>
  );
}

export function ReferencesFieldsRHF() {
  const { control } = useFormContext<SubstanceArticle>();
  const { references, addReference, removeReference } = useArticleFormContext();
  const [copiedReferenceId, setCopiedReferenceId] = useState<string | null>(null);

  /**
   * A reference is the resolution target for every `[cite:id]` token and route
   * `reference_ids` entry in the article, so removal is not a leaf edit and
   * there is no undo to fall back on.
   */
  const confirmRemoveReference = (index: number, id: string) => {
    const label = id.trim() ? `"${id.trim()}"` : `reference ${index + 1}`;
    if (
      typeof window !== "undefined"
      && !window.confirm(
        `Remove ${label}? Inline [cite:...] tokens and route reference IDs pointing at it will stop resolving.`,
      )
    ) {
      return;
    }
    removeReference(index);
  };

  const copyReferenceTag = (id: string) => {
    void (async () => {
      if (await copyCitationTag(id)) {
        setCopiedReferenceId(id);
        window.setTimeout(() => setCopiedReferenceId((current) => current === id ? null : current), 1600);
      }
    })();
  };

  return (
    <section className="space-y-4" aria-label="Structured references">
      <div className="theme-text-secondary space-y-1 text-sm">
        <p className="theme-accent-heading flex items-center gap-2 font-medium">
          <Icon icon="lucide:info" size={16} className="theme-icon-accent shrink-0" />
          Structured references are the primary citation model.
        </p>
        <p>
          Stable reference IDs here are what inline <code>[cite:reference-id]</code> tokens and route
          <code> reference_ids</code> resolve against.
        </p>
      </div>

      <QuickAddReferenceCard references={references} />

      <ReferencesCitationDiagnostics control={control} />

      <div className="space-y-3">
        {references.fields.map((field, index) => (
          <ReferenceEntryCard
            key={field.id}
            index={index}
            control={control}
            copiedReferenceId={copiedReferenceId}
            onCopyTag={copyReferenceTag}
            onRemove={(id) => confirmRemoveReference(index, id)}
          />
        ))}
      </div>

      <Button type="button" variant="outline" className="w-full border-dashed" onClick={addReference}>
        Add structured reference
      </Button>
    </section>
  );
}
