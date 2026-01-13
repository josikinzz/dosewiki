/**
 * RHF-based Overview fields component.
 */

import { Controller, useFormContext } from "react-hook-form";
import { FileText } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { SectionHeader, helperTextClass } from "./FormHelpers";
import { ControlledTagMultiSelect } from "./rhf";
import type { TagOption } from "../../../data/config/tagOptions";
import type { SubstanceArticle } from "../../../schema";

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
  categoryOptions,
  indexCategoryOptions,
}: OverviewFieldsRHFProps) {
  const { register, watch, setValue, control } = useFormContext<SubstanceArticle>();

  // Sync title and common_name together
  const handleDisplayTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setValue("title", value);
    setValue("identification.common_name", value);
  };

  const displayTitle = watch("identification.common_name") || watch("title") || "";

  return (
    <section className="space-y-6">
      <SectionHeader title="Overview" description="Controls the hero title, alias rail, and index metadata." icon={<FileText className="h-5 w-5" />} />
      <div className="space-y-2">
        <Label htmlFor={`${idPrefix}-display-title`}>
          Display name / Title
        </Label>
        <Input
          id={`${idPrefix}-display-title`}
          value={displayTitle}
          onChange={handleDisplayTitleChange}
          placeholder="Primary article title"
        />
        <p className={helperTextClass}>
          Keeps the hero heading and display name badge in sync.
        </p>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        <div className="space-y-2">
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
            Leave blank to auto-assign the next available ID when staging a new article.
          </p>
        </div>
        <div className="space-y-2">
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
          <p className={helperTextClass}>
            Controls article visibility in listings and search.
          </p>
        </div>
        <div>
          <ControlledTagMultiSelect
            name="index_categories"
            label="Index Categories"
            helperText="Use the + button to pick existing index tags or type to add new ones."
            placeholder="Filter or create index tags"
            options={indexCategoryOptions}
            addButtonLabel="Add index tag"
            openStrategy="button"
          />
        </div>
      </div>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <div className="space-y-2">
          <Label htmlFor={`${idPrefix}-substitutive-name`}>
            Substitutive name
          </Label>
          <Input
            id={`${idPrefix}-substitutive-name`}
            {...register("identification.substitutive_name")}
            placeholder="Systematic or ISO name"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor={`${idPrefix}-iupac-name`}>
            IUPAC name
          </Label>
          <Input
            id={`${idPrefix}-iupac-name`}
            {...register("identification.iupac_name")}
            placeholder="Add full IUPAC naming (optional)"
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
      </div>
      {/* Additional Identification Fields */}
      <div className="space-y-2">
        <ControlledTagMultiSelect
          name="identification.alternative_names"
          label="Alternative Names / Aliases"
          helperText="Street names, abbreviations, or other common names."
          placeholder="Add alias"
          options={[]}
          addButtonLabel="Add alias"
          openStrategy="focus"
        />
      </div>
      <div className="grid gap-4 md:grid-cols-2">
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
          <p className={helperTextClass}>
            Simplified molecular-input line-entry system notation.
          </p>
        </div>
        <div className="space-y-2">
          <Label htmlFor={`${idPrefix}-inchi-key`}>
            InChI Key
          </Label>
          <Input
            id={`${idPrefix}-inchi-key`}
            {...register("identification.inchi_key")}
            placeholder="e.g., VYFYYTLLBUKUHU-UHFFFAOYSA-N"
            className="font-mono text-sm"
          />
          <p className={helperTextClass}>
            International Chemical Identifier hash key.
          </p>
        </div>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
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
      </div>
      <div className="space-y-2">
        <Label htmlFor={`${idPrefix}-botanical-name`}>
          Botanical Name
        </Label>
        <Input
          id={`${idPrefix}-botanical-name`}
          {...register("identification.botanical_name")}
          placeholder="For natural substances (e.g., Psilocybe cubensis)"
        />
        <p className={helperTextClass}>
          Only applicable for plant/fungal sources.
        </p>
      </div>
    </section>
  );
}
