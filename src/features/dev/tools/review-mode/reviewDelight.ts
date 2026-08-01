import {
  UNPLACED_GROUP_KEY,
  type ReviewQueueEntry,
  type ReviewQueueGroup,
} from "./reviewQueue";

/**
 * A bucket the tick being processed just finished off: a chemical-class
 * subsection ("section") or a whole psychoactive category ("group"). The
 * group level outranks the section level — one tick can complete both, and
 * only the loudest celebration fires.
 */
export interface ReviewCelebration {
  level: "section" | "group";
  /** Human label of the completed bucket — "Lysergamides", "Psychedelics". */
  label: string;
  /** Category icon key, group level only; feed it to `getCategoryIcon`. */
  iconKey?: string;
  /** How many articles the completed bucket holds. */
  total: number;
}

/**
 * What marking `slug` reviewed completes, if anything.
 *
 * Called with the tree as it stood *before* the tick landed, so `slug` is
 * treated as completed regardless of its recorded status — which also makes
 * the check idempotent if it ever runs against the post-tick tree. The
 * unplaced bucket never celebrates: "Not on the index" is a holding pen, not
 * an achievement.
 */
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
      return { level: "section", label: section.label, total: section.entries.length };
    }

    // A slug lives in exactly one bucket (first placement wins upstream), so
    // once its group is found and neither level completed, nothing will.
    return null;
  }

  return null;
}
