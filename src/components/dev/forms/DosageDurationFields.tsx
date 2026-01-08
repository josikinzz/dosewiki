import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

import { SectionHeader, helperTextClass } from "./FormHelpers";
import {
  doseRangeLabels,
  durationLabels,
  routeDurationLabels,
  type DosageDurationFieldsProps,
} from "./types";

export const DosageDurationFields = ({
  idPrefix,
  form,
  handleRouteFieldChange,
  handleDoseRangeFieldChange,
  handleDurationFieldChange,
  handleDurationRouteStageChange,
  addRouteEntry,
  removeRouteEntry,
  applyDurationDefaultsToRoute,
}: DosageDurationFieldsProps) => (
  <section className="space-y-6">
    <SectionHeader
      title="Dosage & Duration"
      description="Mirrors the live dosage card with route tables followed by metabolism timing."
    />
    <div className="space-y-4">
      {form.routes.map((route, index) => {
        const routeKey = `${idPrefix}-route-${index}`;
        const durationRoute = form.durationRoutes[index];
        return (
          <div key={routeKey} className="space-y-4 rounded-2xl border border-white/10 bg-slate-950/45 p-4">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-semibold text-white/75">Route {index + 1}</p>
              {form.routes.length > 1 && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => removeRouteEntry(index)}
                >
                  Remove
                </Button>
              )}
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Administration route</Label>
                <Input
                  value={route.route}
                  onChange={handleRouteFieldChange(index, "route")}
                  placeholder="e.g., Oral"
                />
              </div>
              <div className="space-y-2">
                <Label>Units</Label>
                <Input
                  value={route.units}
                  onChange={handleRouteFieldChange(index, "units")}
                  placeholder="e.g., µg"
                />
              </div>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              {doseRangeLabels.map(([key, label]) => (
                <div key={`${routeKey}-${key}`} className="space-y-2">
                  <Label>{label}</Label>
                  <Input
                    value={route.doseRanges[key]}
                    onChange={handleDoseRangeFieldChange(index, key)}
                    placeholder="e.g., 10-20 µg"
                  />
                </div>
              ))}
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              {routeDurationLabels.map(([stageKey, label, placeholder]) => (
                <div key={`${routeKey}-duration-${stageKey}`} className="space-y-2">
                  <Label>{label}</Label>
                  <Input
                    value={durationRoute?.stages?.[stageKey] ?? ""}
                    onChange={handleDurationRouteStageChange(index, stageKey)}
                    placeholder={placeholder}
                  />
                </div>
              ))}
            </div>
            <div className="flex justify-end">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => applyDurationDefaultsToRoute(index)}
              >
                Copy defaults
              </Button>
            </div>
          </div>
        );
      })}
    </div>
    <Button
      type="button"
      variant="outline"
      className="w-full border-dashed"
      onClick={addRouteEntry}
    >
      Add route
    </Button>
    <p className={helperTextClass}>Separate ranges with hyphens; omit values when data is unavailable.</p>
    <div className="grid gap-4 md:grid-cols-2">
      {durationLabels.map(([key, label, placeholder]) => (
        <div key={`${idPrefix}-${key}`} className="space-y-2">
          <Label>{label}</Label>
          <Input
            value={form.duration[key]}
            onChange={handleDurationFieldChange(key)}
            placeholder={placeholder}
          />
        </div>
      ))}
    </div>
    <p className={helperTextClass}>Use these defaults to keep timing consistent—copy them into each route as needed with the per-route action above.</p>
  </section>
);
