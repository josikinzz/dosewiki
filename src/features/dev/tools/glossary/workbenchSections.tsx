import type { WorkbenchView, WordsList } from "@server/translation/reviewInboxTypes";

export type WorkbenchSection = WordsList | Exclude<WorkbenchView, "words">;

const SECTIONS: readonly { value: WorkbenchSection; label: string }[] = [
  { value: "terms", label: "Terms" },
  { value: "inbox", label: "Waiting" },
  { value: "suggestions", label: "Suggestions" },
  { value: "labels", label: "Interface text" },
  { value: "pages", label: "Articles" },
  { value: "style", label: "Style guide" },
];

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
