import { useState, useCallback } from "react";
import { Icon } from "@/components/common/Icon";
import type { SectionMeta } from "@/data/schema";
import { FIELD_REGISTRY, getValueByPath, setValueByPath } from "@/data/schema";
import type { SubstanceArticle } from "@/schema";
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
  const [isCollapsed, setIsCollapsed] = useState(
    defaultCollapsed ?? section.defaultCollapsed ?? false
  );

  const toggleCollapsed = useCallback(() => {
    setIsCollapsed((prev) => !prev);
  }, []);

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
    <div className="rounded-xl border border-white/10 bg-[color-mix(in_srgb,#020617_40%,var(--theme-panel-base))]">
      <button
        type="button"
        onClick={toggleCollapsed}
        className="flex w-full items-center gap-3 p-4 text-left transition hover:bg-[color-mix(in_srgb,#fff_2%,var(--theme-control-base))]"
      >
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[color-mix(in_srgb,#d946ef_20%,var(--theme-control-base))] text-fuchsia-200">
          <Icon icon={sectionIcon} className="h-5 w-5" size={20} />
        </div>
        <div className="flex-1">
          <h3 className="text-base font-semibold text-fuchsia-200">{section.label}</h3>
          {section.description && (
            <p className="text-xs text-white/50">{section.description}</p>
          )}
        </div>
        {isCollapsed ? (
          <Icon icon="lucide:chevron-right" className="h-5 w-5 text-white/40" size={20} />
        ) : (
          <Icon icon="lucide:chevron-down" className="h-5 w-5 text-white/40" size={20} />
        )}
      </button>

      {!isCollapsed && (
        <div className="space-y-4 p-4 relative before:absolute before:left-0 before:right-0 before:top-0 before:h-px before:bg-gradient-to-r before:from-transparent before:via-white/10 before:to-transparent">
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
      )}
    </div>
  );
}
