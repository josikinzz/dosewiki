/**
 * RHF-based Overview fields component.
 */

import { useCallback } from "react";
import { Controller, useFormContext } from "react-hook-form";
import yaml from "yaml";
import { Icon } from "@/components/common/Icon";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { ArticleSectionGenerator } from "./ArticleSectionGenerator";
import { CollapsibleSubsection, FieldGroup, helperTextClass } from "./FormHelpers";
import { ControlledTagMultiSelect } from "./rhf";
import type { TagOption } from "@/data/config/tagOptions";
import type { SubstanceArticle, Identification, Classification } from "@/schema";
import { useOptionalSubstanceEditorContext } from "../tools/substance-editor/SubstanceEditorContext";
import { useSectionPrompt } from "@/hooks/usePrompts";
import { parseSectionYamlObject } from "../tools/substance-editor/yamlParser";
import { buildArticleChemistryPresentation } from "@/data/builders/articleChemistryPresentation";

const PRIORITY_OPTIONS = [
  { value: "high", label: "High", description: "Featured in listings" },
  { value: "normal", label: "Normal", description: "Standard visibility" },
  { value: "low", label: "Low", description: "Direct URL only" },
] as const;

export type OverviewFieldsRHFProps = {
  idPrefix: string;
  categoryOptions: TagOption[];
  indexCategoryOptions: TagOption[];
};

export function OverviewFieldsRHF({
  idPrefix,
  categoryOptions: _categoryOptions,
  indexCategoryOptions,
}: OverviewFieldsRHFProps) {
  const { register, watch, setValue, control, getValues } = useFormContext<SubstanceArticle>();
  const articlesContext = useOptionalSubstanceEditorContext();

  // Load prompt from Convex
  const { content: identificationPrompt } = useSectionPrompt("identification");

  // Sync title and common_name together
  const handleDisplayTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setValue("title", value);
    setValue("identification.common_name", value);
  };

  const displayTitle = watch("identification.common_name") || watch("title") || "";
  const chemistryGroupLabel = buildArticleChemistryPresentation(getValues()).editorGroups.chemistry;

  // Get current article as YAML for context in generation
  const getCurrentArticleYaml = useCallback((): string | null => {
    try {
      const values = getValues();
      return yaml.stringify(values, { lineWidth: 0, nullStr: "" });
    } catch {
      return null;
    }
  }, [getValues]);

  // Handle applying generated identification YAML to form
  const handleApplyGenerated = useCallback((generatedYaml: string) => {
    try {
      const parsed = parseSectionYamlObject<Record<string, unknown>>(generatedYaml);
      const identification = (parsed.identification ?? {}) as Partial<Identification>;
      const classification = (parsed.classification ?? {}) as Partial<Classification>;

      // Update identification fields
      if (identification.common_name) {
        setValue("identification.common_name", identification.common_name);
        setValue("title", identification.common_name);
      }
      if (identification.substitutive_name) setValue("identification.substitutive_name", identification.substitutive_name);
      if (identification.iupac_name) setValue("identification.iupac_name", identification.iupac_name);
      if (identification.cas_number) setValue("identification.cas_number", identification.cas_number);
      if (identification.smiles) setValue("identification.smiles", identification.smiles);
      if (identification.inchi_key) setValue("identification.inchi_key", identification.inchi_key);
      if (identification.molecular_formula) setValue("identification.molecular_formula", identification.molecular_formula);
      if (identification.molecular_weight) setValue("identification.molecular_weight", identification.molecular_weight);
      if (identification.alternative_names) setValue("identification.alternative_names", identification.alternative_names);
      if (identification.botanical_name) setValue("identification.botanical_name", identification.botanical_name);

      // Update classification fields
      if (classification.psychoactive_class) setValue("classification.psychoactive_class", classification.psychoactive_class);
      if (classification.chemical_class) setValue("classification.chemical_class", classification.chemical_class);
    } catch (error) {
      console.error("Failed to parse generated identification YAML:", error);
    }
  }, [setValue]);

  return (
    <section className="space-y-6">
      {/* AI Section Generator - only shown when in Articles context */}
      {articlesContext && (
        <ArticleSectionGenerator
          sectionLabel="Identification & Classification"
          sectionKey="identification"
          prompt={identificationPrompt}
          extractedContent={null}
          currentArticleYaml={getCurrentArticleYaml()}
          onApply={handleApplyGenerated}
        />
      )}

      {/* Article metadata - first for quick reference */}
      <FieldGroup label="Article Metadata">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1">
            <Label htmlFor={`${idPrefix}-id`}>
              Article ID
            </Label>
            <Controller
              name="id"
              control={control}
              render={({ field }) => (
                <Input
                  id={`${idPrefix}-id`}
                  type="number"
                  value={field.value ?? ""}
                  onChange={(e) => {
                    const val = e.target.value.trim();
                    if (val === "") {
                      field.onChange(null);
                    } else {
                      const num = parseInt(val, 10);
                      field.onChange(Number.isNaN(num) ? null : num);
                    }
                  }}
                  onBlur={field.onBlur}
                  placeholder="e.g., 101"
                />
              )}
            />
            <p className={helperTextClass}>
              Leave blank to auto-assign when staging.
            </p>
          </div>
          <div className="space-y-1">
            <Label htmlFor={`${idPrefix}-priority`}>
              Priority
            </Label>
            <Controller
              name="priority"
              control={control}
              render={({ field }) => (
                <Select value={field.value ?? "normal"} onValueChange={field.onChange}>
                  <SelectTrigger id={`${idPrefix}-priority`}>
                    <SelectValue placeholder="Select priority" />
                  </SelectTrigger>
                  <SelectContent>
                    {PRIORITY_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        <div className="flex flex-col items-start">
                          <span className="font-medium">{opt.label}</span>
                          <span className="text-xs text-white/50">{opt.description}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </div>
        </div>
      </FieldGroup>

      {/* Primary identification - matches HeroSection visual order */}
      <div className="space-y-1">
        <Label htmlFor={`${idPrefix}-display-title`}>
          Display Name / Title
        </Label>
        <Input
          id={`${idPrefix}-display-title`}
          value={displayTitle}
          onChange={handleDisplayTitleChange}
          placeholder="Primary article title"
        />
      </div>
      
      <div className="space-y-1">
        <Label htmlFor={`${idPrefix}-substitutive-name`} className="inline-flex items-center gap-1.5">
          <Icon icon="lucide:book-open-text" size={14} className="text-fuchsia-300" />
          Substitutive Name
        </Label>
        <Input
          id={`${idPrefix}-substitutive-name`}
          {...register("identification.substitutive_name")}
          placeholder="Systematic or ISO name"
        />
      </div>
      
      <ControlledTagMultiSelect
        name="identification.alternative_names"
        label="Aliases"
        helperText="Street names, slang, abbreviations"
        placeholder="Add alias"
        options={[]}
        compact
        openStrategy="focus"
        icon={<Icon icon="lucide:message-square-quote" size={14} className="text-fuchsia-300" />}
      />
      
      <div className="space-y-1">
        <Label htmlFor={`${idPrefix}-botanical-name`} className="inline-flex items-center gap-1.5">
          <Icon icon="lucide:leaf" size={14} className="text-fuchsia-300" />
          Botanical Name
        </Label>
        <Input
          id={`${idPrefix}-botanical-name`}
          {...register("identification.botanical_name")}
          placeholder="For natural substances (e.g., Psilocybe cubensis)"
        />
      </div>
      
      <ControlledTagMultiSelect
        name="index_categories"
        label="Index Categories"
        placeholder="Filter or create index tags"
        options={indexCategoryOptions}
        openStrategy="button"
        icon={<Icon icon="lucide:tag" className="h-3.5 w-3.5 text-fuchsia-300" size={14} />}
      />
      
      {/* Chemical identification - expandable details in hero */}
      <CollapsibleSubsection
        title={chemistryGroupLabel}
        icon={<Icon icon="lucide:fingerprint" size={20} />}
        description="These fields appear in the expandable 'See more' section of the hero."
      >
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          <div className="space-y-2">
            <Label htmlFor={`${idPrefix}-iupac-name`}>
              IUPAC name
            </Label>
            <Input
              id={`${idPrefix}-iupac-name`}
              {...register("identification.iupac_name")}
              placeholder="Add full IUPAC naming"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor={`${idPrefix}-cas-number`}>
              CAS Number
            </Label>
            <Input
              id={`${idPrefix}-cas-number`}
              {...register("identification.cas_number")}
              placeholder="e.g., 50-37-3"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor={`${idPrefix}-molecular-formula`}>
              Molecular Formula
            </Label>
            <Input
              id={`${idPrefix}-molecular-formula`}
              {...register("identification.molecular_formula")}
              placeholder="e.g., C20H25N3O"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor={`${idPrefix}-molecular-weight`}>
              Molecular Weight
            </Label>
            <Input
              id={`${idPrefix}-molecular-weight`}
              {...register("identification.molecular_weight")}
              placeholder="e.g., 323.43 g/mol"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor={`${idPrefix}-smiles`}>
              SMILES
            </Label>
            <Input
              id={`${idPrefix}-smiles`}
              {...register("identification.smiles")}
              placeholder="e.g., CCN(CC)C(=O)..."
              className="font-mono text-sm"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor={`${idPrefix}-inchi-key`}>
              InChI Key
            </Label>
            <Input
              id={`${idPrefix}-inchi-key`}
              {...register("identification.inchi_key")}
              placeholder="e.g., VYFYYTLLBUKUHU-..."
              className="font-mono text-sm"
            />
          </div>
        </div>
      </CollapsibleSubsection>
    </section>
  );
}
