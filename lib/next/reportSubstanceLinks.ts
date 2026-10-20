import type { TripReportSubstance } from "@/types/tripReport";
import { publicHref } from "@/utils/publicHref";
import { slugify } from "@/utils/slug";

export function buildReportSubstanceLinks(
  substances: TripReportSubstance[],
  substanceBySlug: Record<string, { name: string }>,
): Record<string, string> {
  const links: Record<string, string> = {};
  for (const substance of substances) {
    const slug = slugify(substance.name);
    if (slug && substanceBySlug[slug]) {
      links[substance.name] = publicHref.substance(slug);
    }
  }
  return links;
}
