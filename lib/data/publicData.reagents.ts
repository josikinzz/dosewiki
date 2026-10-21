import "server-only";

import { publicDataCache, PUBLIC_DATA_CACHE_REVALIDATE_SECONDS } from "./publicData.cache";
import { PUBLIC_DATA_CACHE_TAGS, publicSubstanceTag } from "./publicData.cacheTags";
import { cache } from "react";
import { validateProtestKitResponse } from "@/lib/reagentTesting";
import type { ProtestKitResponse } from "@/types/reagent";
import { getPublicDataReadAdapter } from "./publicData.reads";

export const getPublicReagentTestBySlug = cache(
  publicDataCache(async (slug: string): Promise<ProtestKitResponse | null> => {
    const value = await getPublicDataReadAdapter().getPublicReagentTestBySlug(slug);
    if (value === null) {
      return null;
    }
    const validation = validateProtestKitResponse(value);
    if (!validation.ok) {
      throw new Error(
        `[reagents] reagentTests:getBySlug returned an invalid record for slug "${slug}": ${validation.error}`,
      );
    }
    return validation.data;
  },
  ["data-public-reagent-test-by-slug"],
  {
    revalidate: PUBLIC_DATA_CACHE_REVALIDATE_SECONDS,
    tags: (slug: string) => [PUBLIC_DATA_CACHE_TAGS.all, PUBLIC_DATA_CACHE_TAGS.reagentTests, publicSubstanceTag(slug)],
  },),
);
