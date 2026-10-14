import type { WorkbenchView, WordsList } from "@server/translation/reviewInboxTypes";

/** The one nav: glossary terms, UI labels, and the style guide are the Words view's lists; Articles is the Pages view. */
export type WorkbenchSection = WordsList | Exclude<WorkbenchView, "words">;

/** Terms opens first; Waiting gathers everything needing a person, and Suggestions what readers sent. */
const SECTIONS: readonly { value: WorkbenchSection; label: string }[] = [
  { value: "terms", label: "Terms" },
  { value: "inbox", label: "Waiting" },
  { value: "suggestions", label: "Suggestions" },
  { value: "labels", label: "Interface text" },
  { value: "pages", label: "Articles" },
  { value: "style", label: "Style guide" },
];

/**
 * The workbench's view tabs. Counts ride on them as a number with the words
 * sr-only, and drop out while unknown (null) or for a section that has none.
 */
export function workbenchTabs(waiting: Partial<Record<WorkbenchSection, number | null>>, disabled: boolean) {
  return SECTIONS.map((option) => {
    const count = waiting[option.value] ?? null;
    const noun = option.value === "inbox" || option.value === "suggestions" ? "waiting" : "to review";
    return {
      value: option.value,
      controls: `glossary-view-${option.value}`,
      disabled,
      label: count ? <>{option.label}<span className="sr-only">{`, ${count} ${noun}`}</span></> : option.label,
      ...(count ? { badge: <span aria-hidden className="tabular-nums">{count}</span> } : {}),
    };
  });
}
