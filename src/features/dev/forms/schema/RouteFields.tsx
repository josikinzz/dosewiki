import { useState, useCallback } from "react";
import { Icon } from "@/components/common/Icon";
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
        <h3 className="text-base font-semibold text-white">
          Routes of Administration
        </h3>
        <button
          type="button"
          onClick={addRoute}
          disabled={disabled}
          className="flex items-center gap-1.5 rounded-lg bg-[color-mix(in_srgb,#d946ef_20%,var(--theme-control-base))] px-3 py-1.5 text-sm font-medium text-fuchsia-200 transition hover:bg-[color-mix(in_srgb,#d946ef_30%,var(--theme-control-base))] disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Icon icon="lucide:plus" className="h-4 w-4" size={16} />
          Add Route
        </button>
      </div>

      {dosageRoutes.length === 0 ? (
        <div className="rounded-lg border border-dashed border-white/20 bg-[color-mix(in_srgb,#fff_2%,var(--theme-panel-base))] p-6 text-center">
          <p className="text-sm text-white/50">
            No routes configured. Click "Add Route" to add dosage and duration
            information.
          </p>
        </div>
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
              <div
                key={index}
                className="rounded-xl border border-white/10 bg-[color-mix(in_srgb,#fff_2%,var(--theme-panel-base))]"
              >
                <div className="flex items-center gap-3 p-3">
                  <button
                    type="button"
                    onClick={() => toggleRoute(index)}
                    className="flex flex-1 items-center gap-2 text-left"
                  >
                    {isExpanded ? (
                      <Icon icon="lucide:chevron-down" className="h-4 w-4 text-white/40" size={16} />
                    ) : (
                      <Icon icon="lucide:chevron-right" className="h-4 w-4 text-white/40" size={16} />
                    )}
                    <span className="font-medium text-white">{routeName}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => removeRoute(index)}
                    disabled={disabled}
                    className="rounded-lg p-1.5 text-white/40 transition hover:bg-[color-mix(in_srgb,#ef4444_20%,var(--theme-control-base))] hover:text-red-300 disabled:cursor-not-allowed disabled:opacity-50"
                    aria-label="Remove route"
                  >
                    <Icon icon="lucide:trash-2" className="h-4 w-4" size={16} />
                  </button>
                </div>

                {isExpanded && (
                  <div className="space-y-6 p-4 relative before:absolute before:left-0 before:right-0 before:top-0 before:h-px before:bg-gradient-to-r before:from-transparent before:via-white/10 before:to-transparent">
                    {/* Route Name */}
                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="space-y-1.5">
                        <label htmlFor={routeNameId} className="block text-sm font-medium text-white/80">
                          Route Name <span className="text-fuchsia-400">*</span>
                        </label>
                        <input
                          id={routeNameId}
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
                          className="w-full rounded-lg border border-white/10 bg-[color-mix(in_srgb,#fff_5%,var(--theme-control-base))] px-3 py-2 text-[16px] text-white placeholder-white/40 transition focus:border-fuchsia-500/50 focus:outline-none focus:ring-1 focus:ring-fuchsia-500/50"
                        />
                      </div>
                    </div>

                    {/* Dosage Fields */}
                    <div>
                      <h4 className="mb-3 text-sm font-semibold uppercase tracking-wider text-fuchsia-300/70">
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
                      <h4 className="mb-3 text-sm font-semibold uppercase tracking-wider text-fuchsia-300/70">
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
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
