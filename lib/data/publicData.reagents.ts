import "server-only";

import { publicDataCache } from "./publicData.cache"
import { cache } from "react";
import { validateProtestKitResponse } from "@/lib/reagentTesting";
import type { ProtestKitResponse } from "@/types/reagent";
import {
  PUBLIC_DATA_CACHE_REVALIDATE_SECONDS,
  PUBLIC_DATA_CACHE_TAGS,
  publicSubstanceTag,
} from "./publicData.cache";
import { getPublicDataReadAdapter } from "./publicData.reads";

export const getPublicReagentTestBySlug = cache(
  publicDataCache(async (slug: string): Promise<ProtestKitResponse | null> => {
    const value = await getPublicDataReadAdapter().getPublicReagentTestBySlug(slug);
    const validation = validateProtestKitResponse(value);
    return validation.ok ? validation.data : null;
  },
  ["data-public-reagent-test-by-slug"],
  {
    revalidate: PUBLIC_DATA_CACHE_REVALIDATE_SECONDS,
    tags: (slug: string) => [PUBLIC_DATA_CACHE_TAGS.all, PUBLIC_DATA_CACHE_TAGS.reagentTests, publicSubstanceTag(slug)],
  },),
);
