import { useState, useCallback } from "react";
import { Icon } from "@/components/common/Icon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyStateSurface, Surface } from "@/components/ui/surface";
import { EditorField } from "@/features/dev/components";
import {
  FIELD_REGISTRY,
  getValueByPath,
  isFieldPathDiagnostic,
  routeTemplatePathToConcretePath,
  routeTemplatePathToRouteRelativePath,
  setValueByPath,
  createEmptyDosageRoute,
  createEmptyDurationRoute,
} from "@/data/schema";
import type { SubstanceArticle } from "@/schema";
import { SchemaField } from "./SchemaField";

interface RouteFieldsProps {
  article: SubstanceArticle;
  onChange: (article: SubstanceArticle) => void;
  disabled?: boolean;
}

/**
 * Renders route-dependent fields (dosage and duration) with the ability
 * to add/remove routes and edit each route's fields.
 */
export function RouteFields({ article, onChange, disabled }: RouteFieldsProps) {
  const [expandedRoutes, setExpandedRoutes] = useState<Record<number, boolean>>(
    {}
  );

  const dosageRoutes = article.dosage?.routes || [];
  const durationRoutes = article.duration?.routes || [];

  // Get unique routes from both dosage and duration
  const allRouteNames = new Set<string>();
  dosageRoutes.forEach((r) => r.route && allRouteNames.add(r.route));
  durationRoutes.forEach((r) => r.route && allRouteNames.add(r.route));

  const toggleRoute = useCallback((index: number) => {
    setExpandedRoutes((prev) => ({
      ...prev,
      [index]: !prev[index],
    }));
  }, []);

  const addRoute = useCallback(() => {
    const updated = {
      ...article,
      dosage: {
        ...article.dosage,
        routes: [...dosageRoutes, createEmptyDosageRoute()],
      },
      duration: {
        ...article.duration,
        routes: [...durationRoutes, createEmptyDurationRoute()],
      },
    };

    onChange(updated as SubstanceArticle);
    setExpandedRoutes((prev) => ({ ...prev, [dosageRoutes.length]: true }));
  }, [article, dosageRoutes, durationRoutes, onChange]);

  const removeRoute = useCallback(
    (index: number) => {
      const updated = {
        ...article,
        dosage: {
          ...article.dosage,
          routes: dosageRoutes.filter((_, i) => i !== index),
        },
        duration: {
          ...article.duration,
          routes: durationRoutes.filter((_, i) => i !== index),
        },
      };

      onChange(updated as SubstanceArticle);
    },
    [article, dosageRoutes, durationRoutes, onChange]
  );

  const handleFieldChange = useCallback(
    (index: number, fieldPath: string, value: unknown) => {
      const fullPath = routeTemplatePathToConcretePath(fieldPath, index);
      if (isFieldPathDiagnostic(fullPath)) return;
      const updated = setValueByPath(article, fullPath, value);
      onChange(updated);
    },
    [article, onChange]
  );

  // Get dosage fields that are route-dependent
  const dosageFields = Object.entries(FIELD_REGISTRY)
    .filter(
      ([path, meta]) =>
        meta.section === "dosage" && meta.routeDependent && path !== "dosage.routes[].route"
    )
    .map(([path, meta]) => ({ path, meta }));

  // Get duration fields that are route-dependent
  const durationFields = Object.entries(FIELD_REGISTRY)
    .filter(
      ([path, meta]) =>
        meta.section === "duration" &&
        meta.routeDependent &&
        path !== "duration.routes[].route"
    )
    .map(([path, meta]) => ({ path, meta }));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="theme-accent-heading text-base font-semibold">
          Routes of Administration
        </h3>
        <Button
          type="button"
          variant="accent"
          size="sm"
          onClick={addRoute}
          disabled={disabled}
          className="gap-1.5"
        >
          <Icon icon="lucide:plus" className="h-4 w-4" size={16} />
          Add Route
        </Button>
      </div>

      {dosageRoutes.length === 0 ? (
        <EmptyStateSurface padding="lg" radius="lg">
          <p className="theme-text-muted text-sm">
            No routes configured. Click "Add Route" to add dosage and duration
            information.
          </p>
        </EmptyStateSurface>
      ) : (
        <div className="space-y-3">
          {dosageRoutes.map((dosageRoute, index) => {
            const durationRoute = durationRoutes[index] || {
              route: "",
              stages: {},
            };
            const isExpanded = expandedRoutes[index] ?? false;
            const routeName = dosageRoute.route || `Route ${index + 1}`;
            const routeNameId = `route-fields-${index}-route-name`;

            return (
              <Surface
                key={index}
                variant="subtle"
                padding="none"
                radius="xl"
              >
                <div className="flex items-center gap-3 p-3">
                  <button
                    type="button"
                    onClick={() => toggleRoute(index)}
                    aria-expanded={isExpanded}
                    className="flex flex-1 items-center gap-2 rounded-lg text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--theme-accent-strong)]"
                  >
                    <Icon
                      icon={isExpanded ? "lucide:chevron-down" : "lucide:chevron-right"}
                      className="theme-icon-muted h-4 w-4"
                      size={16}
                    />
                    <span className="theme-text-primary font-medium">{routeName}</span>
                  </button>
                  <Button
                    type="button"
                    variant="ghostDestructive"
                    size="icon"
                    onClick={() => removeRoute(index)}
                    disabled={disabled}
                    aria-label="Remove route"
                    className="h-8 w-8"
                  >
                    <Icon icon="lucide:trash-2" className="h-4 w-4" size={16} />
                  </Button>
                </div>

                {isExpanded && (
                  <div className="space-y-6 p-4 relative before:absolute before:left-0 before:right-0 before:top-0 before:h-px before:bg-[image:var(--theme-horizontal-divider-image)]">
                    {/* Route Name */}
                    <div className="grid gap-4 md:grid-cols-2">
                      <EditorField
                        id={routeNameId}
                        label="Route Name"
                        required
                      >
                        {(fieldProps) => (
                          <Input
                            {...fieldProps}
                            type="text"
                            value={dosageRoute.route}
                            onChange={(e) => {
                              // Update both dosage and duration route names
                              let updated = setValueByPath(
                                article,
                                `dosage.routes[${index}].route`,
                                e.target.value
                              );
                              updated = setValueByPath(
                                updated,
                                `duration.routes[${index}].route`,
                                e.target.value
                              );
                              onChange(updated);
                            }}
                            placeholder="e.g., Oral, Insufflated"
                            disabled={disabled}
                          />
                        )}
                      </EditorField>
                    </div>

                    {/* Dosage Fields */}
                    <div>
                      <h4 className="theme-accent-heading mb-3 text-sm font-semibold uppercase tracking-wider">
                        Dosage
                      </h4>
                      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                        {dosageFields.map(({ path, meta }) => {
                          const fieldKey = routeTemplatePathToRouteRelativePath(path);
                          if (isFieldPathDiagnostic(fieldKey)) return null;
                          const value = getValueByPath(
                            dosageRoute,
                            fieldKey
                          );

                          return (
                            <SchemaField
                              key={path}
                              meta={meta}
                              value={value}
                              onChange={(newValue) =>
                                handleFieldChange(
                                  index,
                                  path,
                                  newValue
                                )
                              }
                              disabled={disabled}
                            />
                          );
                        })}
                      </div>
                    </div>

                    {/* Duration Fields */}
                    <div>
                      <h4 className="theme-accent-heading mb-3 text-sm font-semibold uppercase tracking-wider">
                        Duration
                      </h4>
                      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                        {durationFields.map(({ path, meta }) => {
                          const fieldKey = routeTemplatePathToRouteRelativePath(path);
                          if (isFieldPathDiagnostic(fieldKey)) return null;
                          const value = getValueByPath(
                            durationRoute,
                            fieldKey
                          );

                          return (
                            <SchemaField
                              key={path}
                              meta={meta}
                              value={value}
                              onChange={(newValue) =>
                                handleFieldChange(
                                  index,
                                  path,
                                  newValue
                                )
                              }
                              disabled={disabled}
                            />
                          );
                        })}
                      </div>
                    </div>
                  </div>
                )}
              </Surface>
            );
          })}
        </div>
      )}
    </div>
  );
}
