import { vi } from "vitest";
import { describeMoleculeImageRoute } from "@/test/moleculeImageRoute";
import { GET } from "./route";

const mocks = vi.hoisted(() => ({
  enforceRateLimit: vi.fn(),
  query: vi.fn(),
}));

vi.mock("@server/convex/serverClient", () => ({
  queryConvex: mocks.query,
}));
vi.mock("@server/http/nextRateLimit", () => ({
  enforceRateLimit: mocks.enforceRateLimit,
}));
// The route reads through the persistent public leaf; assert the Convex
// boundary by running the leaf's callback inline.
vi.mock("next/cache", () => ({
  unstable_cache: <T extends (...args: never[]) => unknown>(fn: T) => fn,
}));

describeMoleculeImageRoute(
  "substance molecule image route",
  {
    url: (slug, query = "") => `https://dose.wiki/api/molecules/${slug}${query}`,
    params: (slug) => ({ slug }),
    convexSlugFor: (slug) => slug,
    valid: "lsd",
    invalid: "LSD Tabs",
  },
  mocks,
  () => GET,
);
