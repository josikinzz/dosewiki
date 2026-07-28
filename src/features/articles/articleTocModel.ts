import type { PublicTableOfContentsItem } from "@/components/common/PublicTableOfContents";
import { extractVCodeHeadings, type VCodeHeading } from "@/features/effects/vcode/headings";
import type { VCodeContent } from "@/features/effects/vcode/types";
import { icons } from "@/utils/iconNames";

/** One destination is not a table of contents; it is a restatement. */
const TOC_MIN_ITEMS = 2;

/**
 * The level an article is actually outlined at, which varies across the corpus:
 * some bodies are h2 sections, some are h3 throughout, and the intensity scales
 * are a stack of level cards. It is the shallowest level with enough headings to
 * form an outline — the shallowest level alone would let a lone trailing "See
 * also" pose as the structure of an article built entirely below it.
 */
function findOutlineLevel(headings: VCodeHeading[]): number | undefined {
  const levels = [...new Set(headings.map((heading) => heading.level))].sort((a, b) => a - b);

  return levels.find(
    (level) => headings.filter((heading) => heading.level === level).length >= TOC_MIN_ITEMS,
  );
}

/**
 * Contents rail for an Effect Index article, derived from the body's own
 * headings. Returns nothing when the body has no outline — several articles are
 * a single flowing essay whose only headings are a closing "See also" pair.
 */
export function getEffectIndexArticleTocItems(
  body: VCodeContent | undefined,
): PublicTableOfContentsItem[] {
  const headings = extractVCodeHeadings(body);
  const outlineLevel = findOutlineLevel(headings);

  if (outlineLevel === undefined) {
    return [];
  }

  return headings
    .filter((heading) => heading.level === outlineLevel)
    .map((heading) => ({
      id: heading.id,
      label: heading.text,
      icon: icons.chevronRight,
    }));
}
