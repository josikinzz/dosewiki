import { useCallback, useMemo } from "react";
import type { ConfirmRequest } from "@/features/dev/components";
import type { ManualCategoryDefinition, SubstanceOption } from "./types";
import { collectCategorySlugs } from "./utils";

type UseLayoutConfirmsArgs = {
  confirm: (request: ConfirmRequest) => void;
  datasetLabel: string;
  categories: readonly ManualCategoryDefinition[];
  substanceOptions: readonly SubstanceOption[];
  removeCategory: (categoryKey: string) => void;
  /** `keepDrugs` moves the section's substances to the category list instead of dropping them. */
  removeSection: (categoryKey: string, sectionKey: string, keepDrugs: boolean) => void;
  revertDataset: () => void;
};

const COMMIT_REMINDER = "The public index does not change until you commit to production.";

function countNoun(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

/**
 * Losing a whole category or section to a misclick is worth a question even
 * with undo behind it, because the trail is per-session: a reload takes it,
 * and a removed section's substances are not obviously recoverable by eye.
 */
export function useLayoutConfirms({
  confirm,
  datasetLabel,
  categories,
  substanceOptions,
  removeCategory,
  removeSection,
  revertDataset,
}: UseLayoutConfirmsArgs) {
  const namesBySlug = useMemo(
    () => new Map(substanceOptions.map((option) => [option.slug, option.name])),
    [substanceOptions],
  );

  const requestRemoveCategory = useCallback(
    (categoryKey: string) => {
      const category = categories.find((entry) => entry.key === categoryKey);
      if (!category) {
        return;
      }
      const affected = Array.from(collectCategorySlugs(category), (slug) => namesBySlug.get(slug) ?? slug);
      const label = category.label.trim() || "this category";
      const contents = affected.length === 0 && category.sections.length === 0
        ? "It holds no substances yet."
        : `Its ${countNoun(category.sections.length, "section")} and ${countNoun(affected.length, "substance")} leave the ${datasetLabel} draft.`;
      confirm({
        title: `Remove ${label}?`,
        description: `${contents} ${COMMIT_REMINDER}`,
        confirmLabel: "Remove category",
        destructive: true,
        affected,
        onConfirm: () => removeCategory(categoryKey),
      });
    },
    [categories, confirm, datasetLabel, namesBySlug, removeCategory],
  );

  const requestRemoveSection = useCallback(
    (categoryKey: string, sectionKey: string) => {
      const category = categories.find((entry) => entry.key === categoryKey);
      const section = category?.sections.find((entry) => entry.key === sectionKey);
      if (!category || !section) {
        return;
      }
      const affected = section.drugs.map((slug) => namesBySlug.get(slug) ?? slug);
      const label = section.label.trim() || "this section";
      const categoryLabel = category.label.trim() || "its category";
      if (affected.length === 0) {
        confirm({
          title: `Remove ${label}?`,
          description: `It holds no substances yet. ${COMMIT_REMINDER}`,
          confirmLabel: "Remove section",
          destructive: true,
          onConfirm: () => removeSection(categoryKey, sectionKey, false),
        });
        return;
      }
      confirm({
        title: `Remove ${label}?`,
        description: `Its ${countNoun(affected.length, "substance")} move to the ${categoryLabel} list, where the site shows them under General. Remove them from the list afterwards if they should leave the ${datasetLabel} index. ${COMMIT_REMINDER}`,
        confirmLabel: "Remove section, keep substances",
        destructive: true,
        affected,
        onConfirm: () => removeSection(categoryKey, sectionKey, true),
      });
    },
    [categories, confirm, datasetLabel, namesBySlug, removeSection],
  );

  const requestRevertDataset = useCallback(() => {
    confirm({
      title: `Revert the ${datasetLabel} layout?`,
      description: `This dataset goes back to the layout production has now, and every draft edit to it goes away. ${COMMIT_REMINDER}`,
      confirmLabel: "Revert layout",
      destructive: true,
      onConfirm: revertDataset,
    });
  }, [confirm, datasetLabel, revertDataset]);

  return { requestRemoveCategory, requestRemoveSection, requestRevertDataset };
}
