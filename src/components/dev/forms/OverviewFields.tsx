import type { ChangeEvent } from "react";

import { TagMultiSelect } from "../../common/TagMultiSelect";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { SectionHeader, ListPreview, helperTextClass } from "./FormHelpers";
import type { OverviewFieldsProps } from "./types";

export const OverviewFields = ({
  idPrefix,
  form,
  handleFieldChange,
  handleTagFieldChange,
  replaceForm,
  categoryOptions,
  indexCategoryOptions,
}: OverviewFieldsProps) => {
  const categoryPreview = form.categories;
  const displayNameTitleValue = form.drugName ?? form.title ?? "";
  const handleCategoriesChange = handleTagFieldChange("categories");
  const handleIndexCategoryChange = handleTagFieldChange("indexCategoryTags");

  const handleDisplayTitleChange = (event: ChangeEvent<HTMLInputElement>) => {
    const nextValue = event.target.value;
    replaceForm(
      {
        ...form,
        title: nextValue,
        drugName: nextValue,
      },
      { emitMutate: true },
    );
  };

  return (
    <section className="space-y-6">
      <SectionHeader title="Overview" description="Controls the hero title, alias rail, and index metadata." />
      <div className="space-y-2">
        <Label htmlFor={`${idPrefix}-display-title`}>
          Display name / Title
        </Label>
        <Input
          id={`${idPrefix}-display-title`}
          value={displayNameTitleValue}
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
            value={form.id}
            onChange={handleFieldChange("id")}
            placeholder="e.g., 101"
          />
          <p className={helperTextClass}>
            Leave blank to auto-assign the next available ID when staging a new article.
          </p>
        </div>
        <div>
          <TagMultiSelect
            label="Index tags"
            helperText="Use the + button to pick existing index tags or type to add new ones. Values export as a semicolon-separated list."
            placeholder="Filter or create index tags"
            value={form.indexCategoryTags}
            onChange={handleIndexCategoryChange}
            options={indexCategoryOptions}
            addButtonLabel="Add index tag"
            openStrategy="button"
          />
        </div>
      </div>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-2">
          <Label htmlFor={`${idPrefix}-substitutive-name`}>
            Substitutive name
          </Label>
          <Input
            id={`${idPrefix}-substitutive-name`}
            value={form.substitutiveName}
            onChange={handleFieldChange("substitutiveName")}
            placeholder="Systematic or ISO name"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor={`${idPrefix}-iupac-name`}>
            IUPAC name
          </Label>
          <Input
            id={`${idPrefix}-iupac-name`}
            value={form.iupacName}
            onChange={handleFieldChange("iupacName")}
            placeholder="Add full IUPAC naming (optional)"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor={`${idPrefix}-botanical-name`}>
            Botanical name
          </Label>
          <Input
            id={`${idPrefix}-botanical-name`}
            value={form.botanicalName}
            onChange={handleFieldChange("botanicalName")}
            placeholder="Latin binomial (optional)"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor={`${idPrefix}-alternative-name`}>
            Alternative name
          </Label>
          <Input
            id={`${idPrefix}-alternative-name`}
            value={form.alternativeName}
            onChange={handleFieldChange("alternativeName")}
            placeholder="Common alias (optional)"
          />
          <p className={helperTextClass}>Use semicolons for multiple aliases to keep the hero rail tidy.</p>
        </div>
      </div>
    <div>
      <TagMultiSelect
        label="Categories"
        helperText="Use the + button to open the picker. Type only when creating or filtering categories."
        placeholder="Filter or create categories"
        value={form.categories}
        onChange={handleCategoriesChange}
        options={categoryOptions}
        addButtonLabel="Add category"
        openStrategy="button"
      />
      <ListPreview items={categoryPreview} emptyLabel="Badges preview appears once categories are added." />
    </div>
    </section>
  );
};
