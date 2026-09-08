import { useDeferredValue, useState } from "react";
import {
  Controller,
  useFormContext,
  useWatch,
  type Control,
  type FieldPath,
} from "react-hook-form";

import { Icon } from "@/components/common/Icon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { EditorFieldRow, EditorSelect } from "@/features/dev/components";
import type { SubstanceArticle } from "@/schema";
import { collectCitationTextEntries } from "@/lib/citations/editorReferenceDiagnostics";

import { useArticleFormContext } from "./ArticleFormContext";
import { FormEditorField } from "./FormEditorField";
import { EntryCard } from "./EntryCard";
import { EditorCitationDiagnosticsPanel } from "./EditorCitationDiagnosticsPanel";
import { CollapsibleEditorCard } from "./CollapsibleEditorCard";
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
  embedded,
}: {
  index: number;
  control: Control<SubstanceArticle>;
  copiedReferenceId: string | null;
  onCopyTag: (id: string) => void;
  onRemove: (id: string) => void;
  embedded: boolean;
}) {
  const { register } = useFormContext<SubstanceArticle>();
  const referenceId = useWatch({ control, name: `references.${index}.id` as const });
  const referenceTitle = useWatch({ control, name: `references.${index}.title` as const });
  const [establishedId] = useState(referenceId);

  const content = (
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
          description={embedded ? establishedId ? "This identity is fixed to preserve existing citation markers. Edit the source details instead." : "Choose a unique ID before saving. Citation markers will use this identity." : undefined}
        >
          <Input
            id={`reference-id-${index}`}
            {...register(`references.${index}.id` as const)}
            placeholder="pmid-12345"
            readOnly={embedded && Boolean(establishedId)}
            aria-describedby={embedded ? `reference-id-${index}-description` : undefined}
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
          description={embedded ? "The publication format, such as a journal article or book." : undefined}
        >
          <Controller
            control={control}
            name={`references.${index}.type` as const}
            render={({ field: controllerField }) => (
              <EditorSelect
                value={controllerField.value}
                id={`reference-type-${index}`}
                aria-describedby={embedded ? `reference-type-${index}-description` : undefined}
                onChange={(event) => controllerField.onChange(event.target.value)}
                options={REFERENCE_TYPE_OPTIONS.map((option) => ({ value: option, label: embedded ? option[0].toUpperCase() + option.slice(1).replace(/_/g, " ") : option }))}
              />
            )}
          />
        </FormEditorField>
        <FormEditorField
          htmlFor={`reference-source-type-${index}`}
          label="Source Type"
          name={`references.${index}.sourceType` as const}
          description={embedded ? "Who produced the source, distinct from the claim it supports." : undefined}
        >
          <Controller
            control={control}
            name={`references.${index}.sourceType` as const}
            render={({ field: controllerField }) => (
              <EditorSelect
                value={controllerField.value}
                id={`reference-source-type-${index}`}
                aria-describedby={embedded ? `reference-source-type-${index}-description` : undefined}
                onChange={(event) => controllerField.onChange(event.target.value)}
                options={REFERENCE_SOURCE_TYPE_OPTIONS.map((option) => ({ value: option, label: embedded ? option[0].toUpperCase() + option.slice(1).replace(/_/g, " ") : option }))}
              />
            )}
          />
        </FormEditorField>
        <FormEditorField
          htmlFor={`reference-quality-${index}`}
          label={embedded ? "Source quality (editorial)" : "Quality"}
          name={`references.${index}.quality` as const}
          description={embedded ? "An editorial source rating, not verification of a claim." : undefined}
        >
          <Controller
            control={control}
            name={`references.${index}.quality` as const}
            render={({ field: controllerField }) => (
              <EditorSelect
                value={controllerField.value}
                id={`reference-quality-${index}`}
                aria-describedby={embedded ? `reference-quality-${index}-description` : undefined}
                onChange={(event) => controllerField.onChange(event.target.value)}
                options={REFERENCE_QUALITY_OPTIONS.map((option) => ({ value: option, label: embedded ? option[0].toUpperCase() + option.slice(1) : option }))}
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
        label={embedded ? "APA display override (optional)" : "APA text override"}
        name={`references.${index}.apaText` as const}
        description={embedded ? "Used by APA-formatted displays. Wikipedia-style references still use the structured metadata." : undefined}
      >
        <Controller
          control={control}
          name={`references.${index}.apaText` as const}
          render={({ field: controllerField }) => (
            <Textarea
              id={`reference-apa-text-${index}`}
              value={controllerField.value ?? ""}
              aria-describedby={embedded ? `reference-apa-text-${index}-description` : undefined}
              onChange={(event) => controllerField.onChange(normalizeOptionalReferenceText(event.target.value))}
              className="min-h-[88px]"
              placeholder={embedded ? "Optional APA-formatted reference text" : "Optional: provide the exact reference text to render publicly."}
            />
          )}
        />
      </FormEditorField>
    </EntryCard>
  );
  return embedded ? (
    <CollapsibleEditorCard
      title={referenceTitle || `New reference ${index + 1}`}
      description={referenceId || "Complete the source details and choose a stable ID."}
      density="compact"
      defaultExpanded={!establishedId}
      pairedIndicator
      keepMounted
    >
      {content}
    </CollapsibleEditorCard>
  ) : content;
}

export function ReferencesFieldsRHF({ embedded = false }: { embedded?: boolean } = {}) {
  const { control, getValues, setValue } = useFormContext<SubstanceArticle>();
  const { references, addReference, removeReference } = useArticleFormContext();
  const [copiedReferenceId, setCopiedReferenceId] = useState<string | null>(null);
  const [copyError, setCopyError] = useState("");

  /**
   * A reference is the resolution target for every `[cite:id]` token and route
   * `reference_ids` entry in the article, so removal is not a leaf edit and
   * there is no undo to fall back on. Accepting the confirm therefore also
   * strips the reference's inline markers and route reference IDs from form
   * state (dirtied, saved with the whole article), and the confirm message
   * states exactly how much is about to be deleted.
   */
  const confirmRemoveReference = (index: number, id: string) => {
    const trimmedId = id.trim();
    const label = trimmedId ? `"${trimmedId}"` : `reference ${index + 1}`;
    const escapedId = trimmedId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const markerPattern = trimmedId ? new RegExp(`\\[cite:${escapedId}\\]`, "g") : null;

    const pendingEdits: Array<{ path: FieldPath<SubstanceArticle>; value: string | string[] }> = [];
    let markerCount = 0;
    let routeIdCount = 0;

    if (markerPattern) {
      for (const { path, value } of collectCitationTextEntries(getValues())) {
        const matches = value.match(markerPattern);
        if (!matches) continue;
        markerCount += matches.length;
        pendingEdits.push({
          path: path.replace(/\[(\d+)\]/g, ".$1") as FieldPath<SubstanceArticle>,
          value: value.replace(markerPattern, "").replace(/ {2,}/g, " ").trim(),
        });
      }

      const collectRouteEdits = (
        routes: Array<{ reference_ids?: string[] }> | undefined,
        pathPrefix: "dosage.routes" | "duration.routes",
      ) => {
        routes?.forEach((route, routeIndex) => {
          const ids = route.reference_ids;
          if (!ids?.includes(trimmedId)) return;
          routeIdCount += ids.filter((entry) => entry === trimmedId).length;
          pendingEdits.push({
            path: `${pathPrefix}.${routeIndex}.reference_ids` as FieldPath<SubstanceArticle>,
            value: ids.filter((entry) => entry !== trimmedId),
          });
        });
      };
      collectRouteEdits(getValues("dosage.routes"), "dosage.routes");
      collectRouteEdits(getValues("duration.routes"), "duration.routes");
    }

    const consequence = markerCount === 0 && routeIdCount === 0
      ? "Nothing in the article cites it."
      : `This also deletes ${markerCount} inline [cite:...] marker(s) and ${routeIdCount} route reference(s).`;
    if (typeof window !== "undefined" && !window.confirm(`Remove ${label}? ${consequence}`)) {
      return;
    }

    removeReference(index);
    for (const edit of pendingEdits) {
      setValue(edit.path, edit.value as never, { shouldDirty: true });
    }
  };

  const copyReferenceTag = (id: string) => {
    void (async () => {
      setCopyError("");
      if (await copyCitationTag(id)) {
        setCopiedReferenceId(id);
        window.setTimeout(() => setCopiedReferenceId((current) => current === id ? null : current), 1600);
      }
      else setCopyError(`Copy was unavailable. Select and copy this marker: [cite:${id}]`);
    })();
  };

  return (
    <section className="space-y-4" aria-label="Structured references">
      <div className="theme-text-secondary max-w-prose space-y-1 text-sm">
        <p className="theme-accent-heading flex items-center gap-2 font-medium">
          <Icon icon="lucide:info" size={16} className="theme-icon-accent shrink-0" />
          Structured references are the primary citation model.
        </p>
        {embedded ? <p>Keep each source’s ID unchanged so its citation markers continue to resolve. Adding a reference does not verify the claims that cite it.</p> : <p>
          Stable reference IDs here are what inline <code>[cite:reference-id]</code> tokens and route
          <code> reference_ids</code> resolve against.
        </p>}
      </div>

      <QuickAddReferenceCard references={references} embedded={embedded} />

      {!embedded ? <ReferencesCitationDiagnostics control={control} /> : null}
      {copyError ? <p role="status" className="theme-text-muted text-sm [overflow-wrap:anywhere]">{copyError}</p> : null}

      <div className="space-y-3">
        {references.fields.map((field, index) => (
          <ReferenceEntryCard
            key={field.id}
            index={index}
            control={control}
            copiedReferenceId={copiedReferenceId}
            onCopyTag={copyReferenceTag}
            onRemove={(id) => confirmRemoveReference(index, id)}
            embedded={embedded}
          />
        ))}
      </div>

      <Button type="button" variant="outline" className="w-full border-dashed" onClick={addReference}>
        Add structured reference
      </Button>
      {embedded ? <ReferencesCitationDiagnostics control={control} /> : null}
    </section>
  );
}
