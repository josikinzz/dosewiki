import type { IconName } from "@/components/common/Icon";
import type { Translate } from "@/i18n/messages";
import { ROUTE_LABELS } from "./routeLabels";

export const ROUTE_ICONS: Record<string, IconName> = {
  oral: "healthicons:stomach-outline-24px",
  insufflated: "mingcute:nose-line",
  intranasal: "mingcute:nose-line",
  snorted: "mingcute:nose-line",
  iv: "fluent:syringe-24-regular",
  intravenous: "fluent:syringe-24-regular",
  im: "fluent:syringe-24-regular",
  intramuscular: "fluent:syringe-24-regular",
  "i.m.": "fluent:syringe-24-regular",
  "iv/im": "fluent:syringe-24-regular",
  injection: "fluent:syringe-24-regular",
  transdermal: "fluent:syringe-24-regular",
  smoked: "tabler:lungs",
  inhaled: "tabler:lungs",
  vaporized: "tabler:lungs",
  sublingual: "hugeicons:tongue",
  rectal: "custom:rectal",
  buccal: "la:teeth-open",
};

function capitalizeRoute(route: string): string {
  return route.charAt(0).toUpperCase() + route.slice(1);
}

export function getRouteLabelKey(route: string): string {
  return ROUTE_LABELS[route.toLowerCase()] ?? capitalizeRoute(route);
}

export function formatRouteLabel(t: Translate, route: string): string {
  return t(getRouteLabelKey(route));
}

/**
 * A stored dose range as a reader sees it: "10-20 mg", "60+ mg", "~10 mg" for
 * a threshold. Units are never converted. A change diff also reads a duration
 * stage through it, because a diff shows the stored triple as it is.
 */
export function formatDose(
  range: { min: number | null; max: number | null; unit: string } | null,
  isThreshold = false,
): string {
  if (!range || (range.min === null && range.max === null)) return "N/A";
  if (range.min !== null && range.max !== null) {
    if (range.min === range.max) return `${range.min} ${range.unit}`;
    return `${range.min}-${range.max} ${range.unit}`;
  }
  if (range.min !== null)
    return isThreshold
      ? `~${range.min} ${range.unit}`
      : `${range.min}+ ${range.unit}`;
  return `${range.max} ${range.unit}`;
}
