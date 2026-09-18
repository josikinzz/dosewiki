/**
 * RHF-based Overview fields component.
 */

import { Controller, useFormContext } from "react-hook-form";
import { Icon } from "@/components/common/Icon";

import { Input } from "@/components/ui/input";
import { EditorFieldRow } from "@/features/dev/components";

import { FormEditorField } from "./FormEditorField";
import { CollapsibleSubsection, FieldGroup } from "./FormHelpers";
import { ControlledTagMultiSelect } from "./rhf";
import type { TagOption } from "@/data/config/tagOptions";
import type { SubstanceArticle } from "@/schema";
import { buildArticleChemistryPresentation } from "@/data/builders/articleChemistryPresentation";
import { ArticleDisplayNameInput, ArticlePrioritySelect } from "./ArticleDisplayFields";


export type OverviewFieldsRHFProps = {
  idPrefix: string;
  categoryOptions: TagOption[];
  indexCategoryOptions: TagOption[];
  identificationOnly?: boolean;
};

export function OverviewFieldsRHF({
  idPrefix,
  categoryOptions: _categoryOptions,
  indexCategoryOptions,
  identificationOnly = false,
}: OverviewFieldsRHFProps) {
  const { register, watch, setValue, control, getValues } = useFormContext<SubstanceArticle>();

  // Sync title and common_name together
  const handleDisplayTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setValue("title", value);
    setValue("identification.common_name", value);
  };

  const displayTitle = watch("identification.common_name") || watch("title") || "";
  const chemistryGroupLabel = buildArticleChemistryPresentation(getValues()).editorGroups.chemistry;

  return (
    <section className="space-y-6">
      {/* Article metadata - first for quick reference */}
      {!identificationOnly && (
      <FieldGroup label="Article Metadata">
        <EditorFieldRow layout="twoColumn">
          <FormEditorField
            htmlFor={`${idPrefix}-id`}
            label="Article ID"
            name="id"
            description="Leave blank to auto-assign when staging."
          >
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
          </FormEditorField>
          <FormEditorField htmlFor={`${idPrefix}-priority`} label="Priority" name="priority">
            <Controller
              name="priority"
              control={control}
              render={({ field }) => (
                <ArticlePrioritySelect id={`${idPrefix}-priority`} value={field.value ?? "normal"} onChange={field.onChange} />
              )}
            />
          </FormEditorField>
        </EditorFieldRow>
      </FieldGroup>
      )}

      {/* Primary identification - matches HeroSection visual order */}
      <FormEditorField
        htmlFor={`${idPrefix}-display-title`}
        label="Display Name / Title"
        name="title"
      >
        <ArticleDisplayNameInput id={`${idPrefix}-display-title`} value={displayTitle} onChange={handleDisplayTitleChange} />
      </FormEditorField>

      <FormEditorField
        htmlFor={`${idPrefix}-substitutive-name`}
        name="identification.substitutive_name"
        label={
          <span className="inline-flex items-center gap-1.5">
            <Icon icon="lucide:book-open-text" size={14} className="theme-icon-accent" />
            Substitutive Name
          </span>
        }
      >
        <Input
          id={`${idPrefix}-substitutive-name`}
          {...register("identification.substitutive_name")}
          placeholder="Systematic or ISO name"
        />
      </FormEditorField>

      <ControlledTagMultiSelect
        name="identification.alternative_names"
        label="Aliases"
        helperText="Street names, slang, abbreviations"
        placeholder="Add alias"
        options={[]}
        compact
        openStrategy="focus"
        icon={<Icon icon="lucide:message-square-quote" size={14} className="theme-icon-accent" />}
      />

      <FormEditorField
        htmlFor={`${idPrefix}-botanical-name`}
        name="identification.botanical_name"
        label={
          <span className="inline-flex items-center gap-1.5">
            <Icon icon="lucide:leaf" size={14} className="theme-icon-accent" />
            Botanical Name
          </span>
        }
      >
        <Input
          id={`${idPrefix}-botanical-name`}
          {...register("identification.botanical_name")}
          placeholder="For natural substances (e.g., Psilocybe cubensis)"
        />
      </FormEditorField>

      {!identificationOnly && (
      <ControlledTagMultiSelect
        name="index_categories"
        label="Index Categories"
        placeholder="Filter or create index tags"
        options={indexCategoryOptions}
        openStrategy="button"
        icon={<Icon icon="lucide:tag" className="theme-icon-accent h-3.5 w-3.5" size={14} />}
      />
      )}

      {/* Chemical identification - expandable details in hero */}
      <CollapsibleSubsection
        title={chemistryGroupLabel}
        icon={<Icon icon="lucide:fingerprint" size={20} />}
        description="These fields appear in the expandable 'See more' section of the hero."
        pairedIndicator={identificationOnly}
      >
        <EditorFieldRow layout="twoColumn" className="lg:grid-cols-3">
          <FormEditorField htmlFor={`${idPrefix}-iupac-name`} label="IUPAC name" name="identification.iupac_name">
            <Input
              id={`${idPrefix}-iupac-name`}
              {...register("identification.iupac_name")}
              placeholder="Add full IUPAC naming"
            />
          </FormEditorField>
          <FormEditorField htmlFor={`${idPrefix}-cas-number`} label="CAS Number" name="identification.cas_number">
            <Input
              id={`${idPrefix}-cas-number`}
              {...register("identification.cas_number")}
              placeholder="e.g., 50-37-3"
            />
          </FormEditorField>
          <FormEditorField htmlFor={`${idPrefix}-molecular-formula`} label="Molecular Formula" name="identification.molecular_formula">
            <Input
              id={`${idPrefix}-molecular-formula`}
              {...register("identification.molecular_formula")}
              placeholder="e.g., C20H25N3O"
            />
          </FormEditorField>
          <FormEditorField htmlFor={`${idPrefix}-molecular-weight`} label="Molecular Weight" name="identification.molecular_weight">
            <Input
              id={`${idPrefix}-molecular-weight`}
              {...register("identification.molecular_weight")}
              placeholder="e.g., 323.43 g/mol"
            />
          </FormEditorField>
          <FormEditorField htmlFor={`${idPrefix}-smiles`} label="SMILES" name="identification.smiles">
            <Input
              id={`${idPrefix}-smiles`}
              {...register("identification.smiles")}
              placeholder="e.g., CCN(CC)C(=O)..."
              className={identificationOnly ? "font-mono text-[16px] md:text-sm" : "font-mono text-sm"}
            />
          </FormEditorField>
          <FormEditorField htmlFor={`${idPrefix}-inchi-key`} label="InChI Key" name="identification.inchi_key">
            <Input
              id={`${idPrefix}-inchi-key`}
              {...register("identification.inchi_key")}
              placeholder="e.g., VYFYYTLLBUKUHU-..."
              className={identificationOnly ? "font-mono text-[16px] md:text-sm" : "font-mono text-sm"}
            />
          </FormEditorField>
        </EditorFieldRow>
      </CollapsibleSubsection>
    </section>
  );
}
