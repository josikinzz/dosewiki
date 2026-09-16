import "server-only";

import { getPublicReagentTestBySlug } from "@server/data/publicData.reagents";
import { normalizeProtestKitResponse, type NormalizedReagentData } from "@/lib/reagentTesting";
import type { SubstanceArticle } from "@/schema";

type ReagentLookupArticle = Pick<SubstanceArticle, "reagent_testing">;

function hasStaticReagentData(article: ReagentLookupArticle): boolean {
  return Boolean(
    article.reagent_testing
      && Object.values(article.reagent_testing).some((value) => value?.trim().length > 0),
  );
}

/**
 * Static article data remains authoritative. Otherwise resolve the imported
 * ProtestKit snapshot from Postgres by canonical DoseWiki slug.
 */
export async function getCachedReagentDataForArticle(
  article: ReagentLookupArticle,
  slug: string,
): Promise<NormalizedReagentData | null> {
  if (hasStaticReagentData(article)) {
    return null;
  }

  const response = await getPublicReagentTestBySlug(slug);
  return response ? normalizeProtestKitResponse(response) : null;
}
