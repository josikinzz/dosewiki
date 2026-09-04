import { useCallback, useMemo } from "react";
import type { ConfirmRequest } from "@/features/dev/components";
import type { ManualCategoryDefinition, SubstanceOption } from "./types";
import { collectCategorySlugs } from "./utils";

type UseLayoutConfirmsArgs = {
  confirm: (request: ConfirmRequest) => void;
  datasetLabel: string;
  categories: readonly ManualCategoryDefinition[];
  substanceOptions: readonly SubstanceOption[];
  removeCategory: (index: number) => void;
  removeSection: (index: number, sectionIndex: number) => void;
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
    (index: number) => {
      const category = categories[index];
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
        onConfirm: () => removeCategory(index),
      });
    },
    [categories, confirm, datasetLabel, namesBySlug, removeCategory],
  );

  const requestRemoveSection = useCallback(
    (index: number, sectionIndex: number) => {
      const category = categories[index];
      const section = category?.sections[sectionIndex];
      if (!category || !section) {
        return;
      }
      const affected = section.drugs.map((slug) => namesBySlug.get(slug) ?? slug);
      const label = section.label.trim() || "this section";
      const categoryLabel = category.label.trim() || "its category";
      const contents = affected.length === 0
        ? "It holds no substances yet."
        : `Its ${countNoun(affected.length, "substance")} leave ${categoryLabel} in the ${datasetLabel} draft.`;
      confirm({
        title: `Remove ${label}?`,
        description: `${contents} ${COMMIT_REMINDER}`,
        confirmLabel: "Remove section",
        destructive: true,
        affected,
        onConfirm: () => removeSection(index, sectionIndex),
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
