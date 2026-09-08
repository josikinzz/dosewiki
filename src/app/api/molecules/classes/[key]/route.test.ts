import { vi } from "vitest";
import { describeMoleculeImageRoute } from "@/test/moleculeImageRoute";
import { GET } from "./route";

const mocks = vi.hoisted(() => ({
  enforceRateLimit: vi.fn(),
  query: vi.fn(),
}));

vi.mock("@server/convex/serverClient", () => ({
  getServerConvexReadClient: () => ({ query: mocks.query }),
}));
vi.mock("@server/http/nextRateLimit", () => ({
  enforceRateLimit: mocks.enforceRateLimit,
}));
// The route reads through the persistent public leaf; assert the Convex
// boundary by running the leaf's callback inline.
vi.mock("next/cache", () => ({
  unstable_cache: <T extends (...args: never[]) => unknown>(fn: T) => fn,
}));

// "class:tryptamine" is a deliberately invalid key: the colon fails CLASS_KEY_RE, so a
// caller cannot smuggle the namespace prefix the route adds itself.
describeMoleculeImageRoute(
  "class molecule image route",
  {
    url: (key, query = "") => `https://dose.wiki/api/molecules/classes/${key}${query}`,
    params: (key) => ({ key }),
    convexSlugFor: (key) => `class:${key}`,
    valid: "tryptamine",
    invalid: "class:tryptamine",
  },
  mocks,
  () => GET,
);
