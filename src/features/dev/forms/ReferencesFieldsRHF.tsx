import { Controller, useFormContext, type UseFieldArrayReturn } from "react-hook-form";

import { Icon } from "@/components/common/Icon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Surface } from "@/components/ui/surface";
import { EditorSelect } from "@/features/dev/components";
import type { SubstanceArticle } from "@/schema";

import { EntryCard } from "./EntryCard";
import { EditorCitationDiagnosticsPanel } from "./EditorCitationDiagnosticsPanel";
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

export type ReferencesFieldsRHFProps = {
  references: UseFieldArrayReturn<SubstanceArticle, "references">;
  addReference: () => void;
  removeReference: (index: number) => void;
};

export function ReferencesFieldsRHF({
  references,
  addReference,
  removeReference,
}: ReferencesFieldsRHFProps) {
  const { register, control, watch } = useFormContext<SubstanceArticle>();
  const article = watch();

  return (
    <section className="space-y-4" aria-label="Structured references">
      <Surface variant="subtle" padding="sm" radius="lg" className="theme-text-secondary text-sm">
        <p className="theme-accent-heading font-medium">Structured references are the primary citation model.</p>
        <p className="mt-1">
          Stable reference IDs here are what inline <code>[cite:reference-id]</code> tokens and route
          <code> reference_ids</code> resolve against.
        </p>
      </Surface>

      <EditorCitationDiagnosticsPanel article={article} compact />

      <div className="space-y-3">
        {references.fields.map((field, index) => (
          <EntryCard
            key={field.id}
            bodyClassName="space-y-4"
            icon={<Icon icon="lucide:file-stack" size={16} />}
            title={
              <span className="flex min-w-0 flex-col">
                <span className="theme-text-secondary text-sm font-semibold">Reference {index + 1}</span>
                <span className="theme-text-faint truncate text-xs font-normal">
                  {watch(`references.${index}.id` as const) || "New structured reference"}
                </span>
              </span>
            }
            onRemove={() => removeReference(index)}
            removeLabel={`Remove reference ${index + 1}`}
          >
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor={`reference-id-${index}`}>Stable ID</Label>
                <Input
                  id={`reference-id-${index}`}
                  {...register(`references.${index}.id` as const)}
                  placeholder="pmid-12345"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor={`reference-title-${index}`}>Title</Label>
                <Input
                  id={`reference-title-${index}`}
                  {...register(`references.${index}.title` as const)}
                  placeholder="Article or source title"
                />
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <div className="space-y-1">
                <Label>Reference Type</Label>
                <Controller
                  control={control}
                  name={`references.${index}.type` as const}
                  render={({ field: controllerField }) => (
                    <EditorSelect
                      value={controllerField.value}
                      onChange={(event) => controllerField.onChange(event.target.value)}
                      options={REFERENCE_TYPE_OPTIONS.map((option) => ({ value: option, label: option }))}
                    />
                  )}
                />
              </div>
              <div className="space-y-1">
                <Label>Source Type</Label>
                <Controller
                  control={control}
                  name={`references.${index}.sourceType` as const}
                  render={({ field: controllerField }) => (
                    <EditorSelect
                      value={controllerField.value}
                      onChange={(event) => controllerField.onChange(event.target.value)}
                      options={REFERENCE_SOURCE_TYPE_OPTIONS.map((option) => ({ value: option, label: option }))}
                    />
                  )}
                />
              </div>
              <div className="space-y-1">
                <Label>Quality</Label>
                <Controller
                  control={control}
                  name={`references.${index}.quality` as const}
                  render={({ field: controllerField }) => (
                    <EditorSelect
                      value={controllerField.value}
                      onChange={(event) => controllerField.onChange(event.target.value)}
                      options={REFERENCE_QUALITY_OPTIONS.map((option) => ({ value: option, label: option }))}
                    />
                  )}
                />
              </div>
            </div>

            <div className="space-y-1">
              <Label>Authors</Label>
              <Controller
                control={control}
                name={`references.${index}.authors` as const}
                render={({ field: controllerField }) => (
                  <Input
                    value={formatReferenceAuthors(controllerField.value)}
                    onChange={(event) => controllerField.onChange(parseReferenceAuthors(event.target.value))}
                    placeholder="Author One, Author Two"
                  />
                )}
              />
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <div className="space-y-1">
                <Label>Year</Label>
                <Controller
                  control={control}
                  name={`references.${index}.year` as const}
                  render={({ field: controllerField }) => (
                    <Input
                      value={formatReferenceYear(controllerField.value)}
                      onChange={(event) => controllerField.onChange(parseReferenceYear(event.target.value))}
                      placeholder="2024"
                    />
                  )}
                />
              </div>
              <div className="space-y-1">
                <Label>Date</Label>
                <Controller
                  control={control}
                  name={`references.${index}.date` as const}
                  render={({ field: controllerField }) => (
                    <Input
                      value={controllerField.value ?? ""}
                      onChange={(event) => controllerField.onChange(normalizeOptionalReferenceText(event.target.value))}
                      placeholder="2024-07-18"
                    />
                  )}
                />
              </div>
              <div className="space-y-1">
                <Label>Accessed</Label>
                <Controller
                  control={control}
                  name={`references.${index}.accessedAt` as const}
                  render={({ field: controllerField }) => (
                    <Input
                      value={controllerField.value ?? ""}
                      onChange={(event) => controllerField.onChange(normalizeOptionalReferenceText(event.target.value))}
                      placeholder="2026-05-01"
                    />
                  )}
                />
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-1">
                <Label>Container / Journal</Label>
                <Controller
                  control={control}
                  name={`references.${index}.containerTitle` as const}
                  render={({ field: controllerField }) => (
                    <Input
                      value={controllerField.value ?? ""}
                      onChange={(event) => controllerField.onChange(normalizeOptionalReferenceText(event.target.value))}
                      placeholder="Journal of ..."
                    />
                  )}
                />
              </div>
              <div className="space-y-1">
                <Label>Site Name</Label>
                <Controller
                  control={control}
                  name={`references.${index}.siteName` as const}
                  render={({ field: controllerField }) => (
                    <Input
                      value={controllerField.value ?? ""}
                      onChange={(event) => controllerField.onChange(normalizeOptionalReferenceText(event.target.value))}
                      placeholder="PubMed, PsychonautWiki, NIH..."
                    />
                  )}
                />
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-1">
                <Label>Publisher</Label>
                <Controller
                  control={control}
                  name={`references.${index}.publisher` as const}
                  render={({ field: controllerField }) => (
                    <Input
                      value={controllerField.value ?? ""}
                      onChange={(event) => controllerField.onChange(normalizeOptionalReferenceText(event.target.value))}
                      placeholder="Publisher"
                    />
                  )}
                />
              </div>
              <div className="space-y-1">
                <Label>URL</Label>
                <Controller
                  control={control}
                  name={`references.${index}.url` as const}
                  render={({ field: controllerField }) => (
                    <Input
                      value={controllerField.value ?? ""}
                      onChange={(event) => controllerField.onChange(normalizeOptionalReferenceText(event.target.value))}
                      placeholder="https://..."
                    />
                  )}
                />
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              {(["volume", "issue", "pages"] as const).map((fieldName) => (
                <div key={fieldName} className="space-y-1">
                  <Label>{fieldName[0].toUpperCase()}{fieldName.slice(1)}</Label>
                  <Controller
                    control={control}
                    name={`references.${index}.${fieldName}` as const}
                    render={({ field: controllerField }) => (
                      <Input
                        value={controllerField.value ?? ""}
                        onChange={(event) => controllerField.onChange(normalizeOptionalReferenceText(event.target.value))}
                      />
                    )}
                  />
                </div>
              ))}
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              {(["articleNumber", "doi", "pmid", "isbn"] as const).map((fieldName) => (
                <div key={fieldName} className="space-y-1">
                  <Label>{fieldName === "pmid" ? "PMID" : fieldName === "doi" ? "DOI" : fieldName === "isbn" ? "ISBN" : "Article Number"}</Label>
                  <Controller
                    control={control}
                    name={`references.${index}.${fieldName}` as const}
                    render={({ field: controllerField }) => (
                      <Input
                        value={controllerField.value ?? ""}
                        onChange={(event) => controllerField.onChange(normalizeOptionalReferenceText(event.target.value))}
                      />
                    )}
                  />
                </div>
              ))}
            </div>

            <div className="space-y-1">
              <Label>APA text override</Label>
              <Controller
                control={control}
                name={`references.${index}.apaText` as const}
                render={({ field: controllerField }) => (
                  <Textarea
                    value={controllerField.value ?? ""}
                    onChange={(event) => controllerField.onChange(normalizeOptionalReferenceText(event.target.value))}
                    className="min-h-[88px]"
                    placeholder="Optional: provide the exact reference text to render publicly."
                  />
                )}
              />
            </div>
          </EntryCard>
        ))}
      </div>

      <Button type="button" variant="outline" className="w-full border-dashed" onClick={addReference}>
        Add structured reference
      </Button>
    </section>
  );
}
