import { afterEach, beforeEach, vi } from "vitest";
import type * as SiteFlavorModule from "@/config/siteFlavor";
import { describeMoleculeImageRoute } from "@/test/moleculeImageRoute";
import { GET } from "./route";

const mocks = vi.hoisted(() => ({
  enforceRateLimit: vi.fn(),
  query: vi.fn(),
}));
vi.mock("@/config/siteFlavor", async (importOriginal) => {
  const actual = await importOriginal<typeof SiteFlavorModule>();
  return {
    ...actual,
    SITE_FLAVOR_CONFIG: actual.SITE_FLAVOR_CONFIGS.dosewiki,
    isEffectIndex: (config = actual.SITE_FLAVOR_CONFIGS.dosewiki) =>
      actual.isEffectIndex(config),
  };
});


vi.mock("@server/data/serverClient", () => ({
  queryData: mocks.query,
}));
vi.mock("@server/http/nextRateLimit", () => ({
  enforceRateLimit: mocks.enforceRateLimit,
}));
// The route reads through the persistent public leaf; assert the Postgres
// boundary by running the leaf's callback inline.
vi.mock("next/cache", () => ({
  unstable_cache: <T extends (...args: never[]) => unknown>(fn: T) => fn,
}));

beforeEach(() => {
  vi.stubEnv("DATA_BACKEND", "postgres");
  vi.stubEnv("POSTGRES_POOLED_URL", "postgres://localhost/dosewiki");
  vi.stubEnv("POSTGRES_DIRECT_URL", undefined);
  vi.stubEnv("TARGET_POSTGRES_URL", undefined);
});
afterEach(() => vi.unstubAllEnvs());

describeMoleculeImageRoute(
  "substance molecule image route",
  {
    url: (slug, query = "") => `https://dose.wiki/api/molecules/${slug}${query}`,
    params: (slug) => ({ slug }),
    dataSlugFor: (slug) => slug,
    valid: "lsd",
    invalid: "LSD Tabs",
  },
  mocks,
  () => GET,
);
