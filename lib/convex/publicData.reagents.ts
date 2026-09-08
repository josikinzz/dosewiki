import "server-only";

import { publicDataCache } from "./publicData.cache"
import { cache } from "react";
import { validateProtestKitResponse } from "@/lib/reagentTesting";
import type { ProtestKitResponse } from "@/types/reagent";
import {
  PUBLIC_CONVEX_CACHE_REVALIDATE_SECONDS,
  PUBLIC_CONVEX_CACHE_TAGS,
  publicSubstanceTag,
} from "./publicData.cache";
import { queryConvex } from "./serverClient";

export const getPublicReagentTestBySlug = cache(
  publicDataCache(async (slug: string): Promise<ProtestKitResponse | null> => {
    const value = await queryConvex<unknown | null, { slug: string }>(
      "reagentTests:getBySlug",
      { slug },
    );
    const validation = validateProtestKitResponse(value);
    return validation.ok ? validation.data : null;
  },
  ["convex-public-reagent-test-by-slug"],
  {
    revalidate: PUBLIC_CONVEX_CACHE_REVALIDATE_SECONDS,
    tags: (slug: string) => [PUBLIC_CONVEX_CACHE_TAGS.all, PUBLIC_CONVEX_CACHE_TAGS.reagentTests, publicSubstanceTag(slug)],
  },),
);
