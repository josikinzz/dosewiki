import type { DoseRange, DurationStage } from "@/schema";
import type { Translate } from "@/i18n/messages";
import { normalizeDurationStageForDisplay } from "./durationUnits";
import {
  DurationPanelView,
  type DurationPanelViewProps,
} from "./dosageDurationPanels.client";

export {
  ROUTE_ICONS,
  formatRouteLabel,
  getRouteLabelKey,
} from "./dosageDurationModel";

/** Server-compatible panel wrapper; prose and citation slots are already rendered. */
export function DurationPanel(props: DurationPanelViewProps) {
  return <DurationPanelView {...props} />;
}

export function formatDose(
  range: DoseRange | null,
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

export function formatDuration(
  t: Translate,
  stage: DurationStage | null,
): string {
  if (!stage || (stage.min === null && stage.max === null)) return "N/A";
  const { min, max, unit } = normalizeDurationStageForDisplay(t, stage);
  if (min !== null && max !== null) {
    if (min === max) return `${min} ${unit}`;
    return `${min}-${max} ${unit}`;
  }
  if (min !== null) return `${min}+ ${unit}`;
  return `${max} ${unit}`;
}
