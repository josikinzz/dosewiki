import {
  UNPLACED_GROUP_KEY,
  type ReviewQueueEntry,
  type ReviewQueueGroup,
} from "./reviewQueue";

export interface ReviewCelebration {
  level: "section" | "group";
  label: string;
  iconKey?: string;
  total: number;
  groupLabel?: string;
}

export function resolveReviewCelebration(
  groups: readonly ReviewQueueGroup[],
  slug: string,
): ReviewCelebration | null {
  const done = (entry: ReviewQueueEntry) =>
    entry.slug === slug || entry.status === "completed";

  for (const group of groups) {
    const section = group.sections.find((candidate) =>
      candidate.entries.some((entry) => entry.slug === slug),
    );
    const inLoose = group.entries.some((entry) => entry.slug === slug);
    if (!section && !inLoose) continue;

    if (
      group.key !== UNPLACED_GROUP_KEY &&
      group.entries.every(done) &&
      group.sections.every((candidate) => candidate.entries.every(done))
    ) {
      return {
        level: "group",
        label: group.label,
        iconKey: group.iconKey ?? group.key,
        total: group.count,
      };
    }

    if (section && section.entries.every(done)) {
      return { level: "section", label: section.label, total: section.entries.length, groupLabel: group.label };
    }

    return null;
  }

  return null;
}
