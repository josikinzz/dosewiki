import {
  DosagePanelView,
  type DosagePanelViewProps,
} from "./DosageDurationPanelView.client";

/** Server-compatible panel wrapper; prose and citation slots are already rendered. */
export function DosagePanel(props: DosagePanelViewProps) {
  return <DosagePanelView {...props} />;
}
