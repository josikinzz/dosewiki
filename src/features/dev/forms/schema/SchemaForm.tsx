import { useCallback, useMemo } from "react";
import { SECTION_REGISTRY } from "@/data/schema";
import type { SubstanceArticle } from "@/schema";
import { SchemaSection } from "./SchemaSection";
import { RouteFields } from "./RouteFields";

interface SchemaFormProps {
  article: SubstanceArticle;
  onChange: (article: SubstanceArticle) => void;
  disabled?: boolean;
  /** Sections to exclude from rendering */
  excludeSections?: string[];
  /** Whether to show route-dependent fields */
  showRouteFields?: boolean;
}

/**
 * Main schema-driven form component.
 * Automatically renders all sections and fields based on the registries.
 */
export function SchemaForm({
  article,
  onChange,
  disabled,
  excludeSections = [],
  showRouteFields = true,
}: SchemaFormProps) {
  const handleArticleChange = useCallback(
    (updated: SubstanceArticle) => {
      onChange(updated);
    },
    [onChange]
  );

  // Filter and order sections
  const sections = useMemo(() => {
    return SECTION_REGISTRY.filter(
      (section) =>
        !excludeSections.includes(section.key) &&
        // Skip dosage/duration sections (handled by RouteFields)
        section.key !== "dosage" &&
        section.key !== "duration"
    );
  }, [excludeSections]);

  // Find where to insert RouteFields (after classification, before subjective_effects)
  const routeFieldsIndex = useMemo(() => {
    const classificationIndex = sections.findIndex(
      (s) => s.key === "classification"
    );
    return classificationIndex >= 0 ? classificationIndex + 1 : 2;
  }, [sections]);

  return (
    <div className="space-y-6">
      {sections.slice(0, routeFieldsIndex).map((section) => (
        <SchemaSection
          key={section.key}
          section={section}
          article={article}
          onChange={handleArticleChange}
          disabled={disabled}
        />
      ))}

      {showRouteFields && (
        <div className="rounded-xl border border-white/10 bg-[color-mix(in_srgb,#fff_2%,var(--theme-panel-base))] p-4">
          <RouteFields
            article={article}
            onChange={handleArticleChange}
            disabled={disabled}
          />
        </div>
      )}

      {sections.slice(routeFieldsIndex).map((section) => (
        <SchemaSection
          key={section.key}
          section={section}
          article={article}
          onChange={handleArticleChange}
          disabled={disabled}
        />
      ))}
    </div>
  );
}
