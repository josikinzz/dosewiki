import { useCallback } from "react";
import { Icon } from "@/components/common/Icon";
import type { SectionMeta } from "@/data/schema";
import { FIELD_REGISTRY, getValueByPath, setValueByPath } from "@/data/schema";
import type { SubstanceArticle } from "@/schema";
import { CollapsibleEditorCard } from "@/features/dev/forms/CollapsibleEditorCard";
import { SchemaField } from "./SchemaField";

interface SchemaSectionProps {
  section: SectionMeta;
  article: SubstanceArticle;
  onChange: (article: SubstanceArticle) => void;
  disabled?: boolean;
  defaultCollapsed?: boolean;
}

/**
 * Renders a collapsible section of form fields.
 * Automatically generates fields based on the section's field list.
 */
export function SchemaSection({
  section,
  article,
  onChange,
  disabled,
  defaultCollapsed,
}: SchemaSectionProps) {
  const startCollapsed =
    defaultCollapsed ?? section.defaultCollapsed ?? false;

  const handleFieldChange = useCallback(
    (path: string, value: unknown) => {
      const updated = setValueByPath(article, path, value);
      onChange(updated);
    },
    [article, onChange]
  );

  // Filter out route-dependent fields (handled separately)
  const nonRouteDependentFields = section.fields.filter((path) => {
    const meta = FIELD_REGISTRY[path];
    return meta && !meta.routeDependent;
  });

  // Skip section if it only has route-dependent fields
  if (nonRouteDependentFields.length === 0 && section.routeDependent) {
    return null;
  }

  const sectionIcon = section.icon || "lucide:folder";

  return (
    <CollapsibleEditorCard
      title={section.label}
      description={section.description}
      defaultExpanded={!startCollapsed}
      icon={<Icon icon={sectionIcon} className="h-5 w-5" size={20} />}
    >
      <div className="space-y-4">
        {nonRouteDependentFields.map((path) => {
          const meta = FIELD_REGISTRY[path];
          if (!meta) return null;

          const value = getValueByPath(article, path);

          return (
            <SchemaField
              key={path}
              meta={meta}
              value={value}
              onChange={(newValue) => handleFieldChange(path, newValue)}
              disabled={disabled}
            />
          );
        })}
      </div>
    </CollapsibleEditorCard>
  );
}
