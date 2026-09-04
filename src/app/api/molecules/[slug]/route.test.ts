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

describeMoleculeImageRoute(
  "substance molecule image route",
  {
    url: (slug, query = "") => `https://dose.wiki/api/molecules/${slug}${query}`,
    params: (slug) => ({ slug }),
    convexSlugFor: (slug) => slug,
    valid: "lsd",
    invalid: "LSD Tabs",
    errors: {
      invalid: "Invalid molecule slug.",
      lookupFailed: "Molecule lookup failed.",
      missing: "No override for this molecule.",
    },
  },
  mocks,
  () => GET,
);
