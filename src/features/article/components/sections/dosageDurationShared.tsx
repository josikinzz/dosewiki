import type { DurationStage } from "@/schema";
import type { Translate } from "@/i18n/messages";
import { normalizeDurationStageForDisplay } from "./durationUnits";
import {
  DurationPanelView,
  type DurationPanelViewProps,
} from "./dosageDurationPanels.client";

export {
  ROUTE_ICONS,
  formatDose,
  formatRouteLabel,
  getRouteLabelKey,
} from "./dosageDurationModel";

export function DurationPanel(props: DurationPanelViewProps) {
  return <DurationPanelView {...props} />;
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
