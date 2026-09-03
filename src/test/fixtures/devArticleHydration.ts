import { vi } from "vitest";
import type { DevArticleHydration } from "@/features/dev/context/useDevArticleHydration";

/**
 * A `useDevMode().articleHydration` stub that reports the corpus already whole.
 *
 * Tests that mock the dev context are exercising surfaces *after* their
 * articles have arrived, so the default here is "everything hydrated" — the
 * state those tests were written against, back when the library drain carried
 * whole articles.
 */
export function createHydratedArticleHydration(
  overrides: Partial<DevArticleHydration> = {},
): DevArticleHydration {
  return {
    hydratedSlugs: new Set<string>(),
    failedSlugs: new Set<string>(),
    isArticleHydrated: () => true,
    hydrateArticlesNow: vi.fn(async () => ({ ok: true, articles: [] })),
    requestArticle: vi.fn(),
    ...overrides,
  };
}
