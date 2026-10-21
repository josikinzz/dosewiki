import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

beforeEach(() => {
  vi.stubEnv("DATA_BACKEND", "postgres");
  vi.stubEnv("POSTGRES_POOLED_URL", "postgres://localhost/dosewiki_test");
  vi.stubEnv("POSTGRES_DIRECT_URL", undefined);
  vi.stubEnv("TARGET_POSTGRES_URL", undefined);
});
afterEach(() => vi.unstubAllEnvs());

vi.mock("server-only", () => ({}));
vi.mock("react", () => ({
  cache: <T extends (...args: never[]) => unknown>(fn: T) => fn,
}));
vi.mock("next/cache", () => ({
  unstable_cache: <T extends (...args: never[]) => unknown>(fn: T) => fn,
}));

const mocks = vi.hoisted(() => ({
  queryData: vi.fn(),
}));

vi.mock("./serverClient", () => ({
  queryData: mocks.queryData,
}));

const storedRecord = {
  substance: { name: "MDMA", aliases: ["Molly"] },
  reagents: [
    { reagent: "marquis", hint: "", isReacting: true, colors: [{ id: 7, name: "Purple", simple: true, simpleColorId: 3 }] },
    { reagent: "simon", hint: "Secondary amine", isReacting: false, colors: [] },
  ],
};

describe("public reagent test read", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.queryData.mockReset();
  });

  it("returns null when no reagent record exists for the slug", async () => {
    mocks.queryData.mockResolvedValueOnce(null);
    const { getPublicReagentTestBySlug } = await import("./publicData.reagents");

    await expect(getPublicReagentTestBySlug("mdma")).resolves.toBeNull();
  });

  it("returns a valid stored record unchanged", async () => {
    mocks.queryData.mockResolvedValueOnce(structuredClone(storedRecord));
    const { getPublicReagentTestBySlug } = await import("./publicData.reagents");

    await expect(getPublicReagentTestBySlug("mdma")).resolves.toEqual(storedRecord);
  });

  it("rejects an invalid stored record instead of reading it as absent", async () => {
    mocks.queryData.mockResolvedValueOnce({
      ...structuredClone(storedRecord),
      reagents: [{ reagent: "marquis", hint: "", isReacting: "yes", colors: [] }],
    });
    const { getPublicReagentTestBySlug } = await import("./publicData.reagents");

    await expect(getPublicReagentTestBySlug("mdma")).rejects.toThrow(
      /invalid record for slug "mdma": ProtestKit reagent reaction state must be a boolean/,
    );
  });

  it("rejects a failed read", async () => {
    mocks.queryData.mockRejectedValueOnce(new Error("connection reset"));
    const { getPublicReagentTestBySlug } = await import("./publicData.reagents");

    await expect(getPublicReagentTestBySlug("mdma")).rejects.toThrow("connection reset");
  });
});
