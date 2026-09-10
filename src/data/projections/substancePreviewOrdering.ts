import type {
  PublicSubstancePriority,
  SubstancePublicPreviewProjection,
} from "./substanceReadProjections";

export const compareSubstancePreviews = (
  left: SubstancePublicPreviewProjection,
  right: SubstancePublicPreviewProjection,
) => {
  const priorityScore: Record<PublicSubstancePriority, number> = {
    high: 0,
    normal: 1,
    low: 2,
  };
  const priorityDelta = priorityScore[left.priority] - priorityScore[right.priority];
  if (priorityDelta !== 0) return priorityDelta;
  return left.title.localeCompare(right.title);
};
