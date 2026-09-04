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
  resetDraft: () => void;
  restoreSource: () => void;
};

const COMMIT_REMINDER = "The public index does not change until you commit to production.";

function countNoun(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

/**
 * Every destructive board action asks first through the shared dialog. The
 * draft has no undo; without this a misclick on a trash icon dropped a whole
 * category and the only way back was resetting every other edit too.
 */
export function useLayoutConfirms({
  confirm,
  datasetLabel,
  categories,
  substanceOptions,
  removeCategory,
  removeSection,
  resetDraft,
  restoreSource,
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

  const requestResetDraft = useCallback(() => {
    confirm({
      title: "Discard unsaved changes?",
      description: `The ${datasetLabel} draft goes back to the layout you last applied. Edits since then go away.`,
      confirmLabel: "Discard changes",
      destructive: true,
      onConfirm: resetDraft,
    });
  }, [confirm, datasetLabel, resetDraft]);

  const requestRestoreSource = useCallback(() => {
    confirm({
      title: "Restore the source layout?",
      description: `The ${datasetLabel} draft goes back to the layout production has now. Every edit to this dataset, applied or not, goes away.`,
      confirmLabel: "Restore source",
      destructive: true,
      onConfirm: restoreSource,
    });
  }, [confirm, datasetLabel, restoreSource]);

  return { requestRemoveCategory, requestRemoveSection, requestResetDraft, requestRestoreSource };
}
