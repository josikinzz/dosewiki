/**
 * RHF-based Overview fields component.
 */

import { useFormContext } from "react-hook-form";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { SectionHeader, helperTextClass } from "./FormHelpers";
import { ControlledTagMultiSelect } from "./rhf";
import type { TagOption } from "../../../data/config/tagOptions";
import type { SubstanceArticle } from "../../../schema";

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
  const { register, watch, setValue } = useFormContext<SubstanceArticle>();

  // Sync title and common_name together
  const handleDisplayTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setValue("title", value);
    setValue("identification.common_name", value);
  };

  const displayTitle = watch("identification.common_name") || watch("title") || "";

  return (
    <section className="space-y-6">
      <SectionHeader title="Overview" description="Controls the hero title, alias rail, and index metadata." />
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
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor={`${idPrefix}-id`}>
            Article ID
          </Label>
          <Input
            id={`${idPrefix}-id`}
            {...register("id", { valueAsNumber: true })}
            placeholder="e.g., 101"
          />
          <p className={helperTextClass}>
            Leave blank to auto-assign the next available ID when staging a new article.
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
    </section>
  );
}
