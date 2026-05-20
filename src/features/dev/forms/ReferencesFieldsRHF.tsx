import { Controller, useFormContext, type UseFieldArrayReturn } from "react-hook-form";

import { Icon } from "@/components/common/Icon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { SubstanceArticle } from "@/schema";

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
      <div className="rounded-xl border border-fuchsia-500/20 bg-fuchsia-500/5 p-4 text-sm text-white/70">
        <p className="font-medium text-fuchsia-100">Structured references are the primary citation model.</p>
        <p className="mt-1">
          Stable reference IDs here are what inline <code>[cite:reference-id]</code> tokens and route
          <code> reference_ids</code> resolve against.
        </p>
      </div>

      <EditorCitationDiagnosticsPanel article={article} compact />

      <div className="space-y-3">
        {references.fields.map((field, index) => (
          <div key={field.id} className="space-y-4 rounded-2xl border border-white/10 bg-slate-950/45 p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="flex items-center gap-1.5 text-sm font-semibold text-white/80">
                  <Icon icon="lucide:file-stack" size={16} className="text-fuchsia-300" />
                  Reference {index + 1}
                </p>
                <p className="truncate text-xs text-white/45">
                  {watch(`references.${index}.id` as const) || "New structured reference"}
                </p>
              </div>
              <Button type="button" variant="ghost" size="sm" onClick={() => removeReference(index)}>
                Remove
              </Button>
            </div>

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
                    <select
                      value={controllerField.value}
                      onChange={(event) => controllerField.onChange(event.target.value)}
                      className="flex h-11 w-full rounded-xl border border-white/10 bg-slate-950/60 px-3 text-sm text-white"
                    >
                      {REFERENCE_TYPE_OPTIONS.map((option) => (
                        <option key={option} value={option} className="bg-slate-950">
                          {option}
                        </option>
                      ))}
                    </select>
                  )}
                />
              </div>
              <div className="space-y-1">
                <Label>Source Type</Label>
                <Controller
                  control={control}
                  name={`references.${index}.sourceType` as const}
                  render={({ field: controllerField }) => (
                    <select
                      value={controllerField.value}
                      onChange={(event) => controllerField.onChange(event.target.value)}
                      className="flex h-11 w-full rounded-xl border border-white/10 bg-slate-950/60 px-3 text-sm text-white"
                    >
                      {REFERENCE_SOURCE_TYPE_OPTIONS.map((option) => (
                        <option key={option} value={option} className="bg-slate-950">
                          {option}
                        </option>
                      ))}
                    </select>
                  )}
                />
              </div>
              <div className="space-y-1">
                <Label>Quality</Label>
                <Controller
                  control={control}
                  name={`references.${index}.quality` as const}
                  render={({ field: controllerField }) => (
                    <select
                      value={controllerField.value}
                      onChange={(event) => controllerField.onChange(event.target.value)}
                      className="flex h-11 w-full rounded-xl border border-white/10 bg-slate-950/60 px-3 text-sm text-white"
                    >
                      {REFERENCE_QUALITY_OPTIONS.map((option) => (
                        <option key={option} value={option} className="bg-slate-950">
                          {option}
                        </option>
                      ))}
                    </select>
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
          </div>
        ))}
      </div>

      <Button type="button" variant="outline" className="w-full border-dashed" onClick={addReference}>
        Add structured reference
      </Button>
    </section>
  );
}
