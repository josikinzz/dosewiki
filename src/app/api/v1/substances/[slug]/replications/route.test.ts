import { beforeEach, describe, expect, it, vi } from "vitest";


const mocks = vi.hoisted(() => ({
  getPublicReplicationsForSubstance: vi.fn(),
  getPublicSubstanceBySlug: vi.fn(),
  getPublicEffectBySlug: vi.fn(),
  getPublicContributorProfiles: vi.fn(),
  enforceRateLimit: vi.fn(),
}));

vi.mock("@server/convex/publicData", () => ({
  getPublicReplicationsForSubstance: mocks.getPublicReplicationsForSubstance,
  getPublicSubstanceBySlug: mocks.getPublicSubstanceBySlug,
  getPublicEffectBySlug: mocks.getPublicEffectBySlug,
  getPublicContributorProfiles: mocks.getPublicContributorProfiles,
}));
vi.mock("@server/http/nextRateLimit", () => ({ enforceRateLimit: mocks.enforceRateLimit }));

// `vi.mock` registrations hoist above this import, so the route binds the
// mocked reads even though the import is static.
import { GET } from "./route";

/** The minimum a stored row needs for the route's own reads: publishability, URL, credit, effect. */
const replication = (overrides: Record<string, unknown> = {}) => ({
  _id: "r1",
  _creationTime: 0,
  slug: "tracers-hand-wave",
  title: "Tracers (hand wave)",
  artist: "Chelsea Morgan",
  type: "image",
  storage_id: "st1",
  effect_slug: "tracers",
  format: "webp",
  created_at: "2026-01-01",
  url: "https://cdn.test/tracers.webp",
  ...overrides,
});

describe("substance replication viewer-set API", () => {
  beforeEach(() => {
    mocks.enforceRateLimit.mockReset().mockResolvedValue(null);
    mocks.getPublicSubstanceBySlug.mockReset().mockResolvedValue({ title: "LSD", slug: "lsd" });
    mocks.getPublicContributorProfiles.mockReset().mockResolvedValue([
      { key: "chelsea", displayName: "Chelsea Morgan", aliases: [] },
    ]);
    mocks.getPublicEffectBySlug.mockReset().mockImplementation(async (slug: string) =>
      slug === "tracers"
        ? { slug: "tracers", name: "Tracers", summary: "", tags: ["visual", "distortion"] }
        : null,
    );
    mocks.getPublicReplicationsForSubstance.mockReset().mockResolvedValue({
      items: [
        {
          replication: replication(),
          provenance: { matchedVia: "effect_slug", effectSlug: "tracers" },
        },
        {
          // No effect of its own and an unattributed credit: the caption falls
          // back to the substance-derived match, and no profile lookup can claim it.
          replication: replication({
            _id: "r2",
            slug: "drifting-wood-grain",
            title: "Drifting (wood grain)",
            artist: "Unknown",
            effect_slug: undefined,
            url: "https://cdn.test/drifting.webp",
          }),
          provenance: { matchedVia: "effect_tags", effectSlug: "drifting" },
        },
      ],
      unmatchedEffectNames: [],
    });
  });

  it("returns the viewer-set contract with per-item effect and artist resolution", async () => {
    const response = await GET(
      new Request("https://dose.wiki/api/v1/substances/lsd/replications"),
      { params: Promise.resolve({ slug: "lsd" }) },
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("access-control-allow-origin")).toBe("*");
    const body = await response.json();
    expect(body.scope).toBe("substance");
    expect(body.scopeLabel).toBe("LSD");
    expect(body.items).toHaveLength(2);
    expect(body.items[0]).toMatchObject({
      replication: { slug: "tracers-hand-wave" },
      effectName: "Tracers",
      effectSlug: "tracers",
      artistProfileHref: "/contributors/chelsea",
    });
    expect(body.items[0].effectCategories.length).toBeGreaterThan(0);
    // The fallback slug names a real page even though this deployment's effect
    // read returned nothing for it, so the caption link survives with no name.
    expect(body.items[1]).toMatchObject({
      replication: { slug: "drifting-wood-grain" },
      effectName: null,
      effectSlug: "drifting",
      effectCategories: [],
      artistProfileHref: null,
    });
  });

  it("drops rows the viewer cannot draw before deciding emptiness", async () => {
    mocks.getPublicReplicationsForSubstance.mockResolvedValueOnce({
      items: [
        {
          replication: replication({ url: "" }),
          provenance: { matchedVia: "effect_slug", effectSlug: "tracers" },
        },
      ],
      unmatchedEffectNames: [],
    });
    const response = await GET(
      new Request("https://dose.wiki/api/v1/substances/lsd/replications"),
      { params: Promise.resolve({ slug: "lsd" }) },
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: "not-found" });
  });

  it("answers an unknown substance's empty gallery with the contract 404", async () => {
    mocks.getPublicReplicationsForSubstance.mockResolvedValueOnce({
      items: [],
      unmatchedEffectNames: [],
    });
    mocks.getPublicSubstanceBySlug.mockResolvedValueOnce(null);
    const { GET } = await import("./route");
    const response = await GET(
      new Request("https://dose.wiki/api/v1/substances/unknown/replications"),
      { params: Promise.resolve({ slug: "unknown" }) },
    );
    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: "not-found" });
  });

  it("rejects malformed slugs before reading data", async () => {
    const { GET } = await import("./route");
    const response = await GET(
      new Request("https://dose.wiki/api/v1/substances/LSD!/replications"),
      { params: Promise.resolve({ slug: "LSD!" }) },
    );
    expect(response.status).toBe(404);
    expect(mocks.getPublicReplicationsForSubstance).not.toHaveBeenCalled();
  });
});
