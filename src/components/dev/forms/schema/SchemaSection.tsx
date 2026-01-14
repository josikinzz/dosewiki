import { useState, useCallback } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
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

  const Icon = section.icon;

  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.02]">
      <button
        type="button"
        onClick={toggleCollapsed}
        className="flex w-full items-center gap-3 p-4 text-left transition hover:bg-white/[0.02]"
      >
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-fuchsia-500/20 text-fuchsia-200">
          <Icon className="h-5 w-5" />
        </div>
        <div className="flex-1">
          <h3 className="text-base font-semibold text-white">{section.label}</h3>
          {section.description && (
            <p className="text-xs text-white/50">{section.description}</p>
          )}
        </div>
        {isCollapsed ? (
          <ChevronRight className="h-5 w-5 text-white/40" />
        ) : (
          <ChevronDown className="h-5 w-5 text-white/40" />
        )}
      </button>

      {!isCollapsed && (
        <div className="space-y-4 border-t border-white/10 p-4">
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
