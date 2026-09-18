import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const sourceQuery = vi.hoisted(() => vi.fn());
vi.mock("./serverClient", () => ({
  queryData: sourceQuery,
}));

const stored = vi.hoisted(() => new Map<string, { value: unknown; tags: string[] }>());
vi.mock("next/cache", () => ({
  unstable_cache: (
    read: (...args: unknown[]) => Promise<unknown>,
    keys: string[],
    options: { tags?: string[] },
  ) =>
    async (...args: unknown[]) => {
      const key = JSON.stringify([keys, args]);
      const previous = stored.get(key);
      if (previous) return previous.value;
      const value = await read(...args);
      stored.set(key, { value, tags: options.tags ?? [] });
      return value;
    },
  revalidateTag: (tag: string) => {
    for (const [key, entry] of stored) if (entry.tags.includes(tag)) stored.delete(key);
  },
  revalidatePath: vi.fn(),
}));

import { revalidateTag } from "next/cache";
import { publicMoleculeTag } from "./publicData.cache";
import {
  getMoleculeOverrideIndex,
  getMoleculeUpdatedAt,
  getPublicMolecule,
} from "./publicData.molecules";

const revision = "2026-01-01T00:00:00.000Z";
const nextRevision = "2026-01-02T00:00:00.000Z";
const depiction = { svg: "<svg id='lsd' />", updatedAt: revision };

beforeEach(() => {
  vi.stubEnv("DATA_BACKEND", "postgres");
  vi.stubEnv("POSTGRES_POOLED_URL", "postgres://localhost/dosewiki_test");
  vi.stubEnv("POSTGRES_DIRECT_URL", undefined);
  vi.stubEnv("TARGET_POSTGRES_URL", undefined);
});

afterEach(() => {
  stored.clear();
  sourceQuery.mockReset();
  vi.unstubAllEnvs();
});

describe("public molecule depiction reads", () => {
  it("keeps the SVG and its saved revision together across cached reads", async () => {
    sourceQuery.mockResolvedValueOnce(depiction);
    await expect(getPublicMolecule("lsd")).resolves.toEqual(depiction);
    sourceQuery.mockResolvedValue({ svg: "<svg id='new' />", updatedAt: nextRevision });
    await expect(getPublicMolecule("lsd")).resolves.toEqual(depiction);
    expect(sourceQuery).toHaveBeenCalledTimes(1);
  });

  it("caches confirmed absence until publication invalidates that molecule", async () => {
    sourceQuery.mockResolvedValueOnce(null);
    await expect(getPublicMolecule("lsd")).resolves.toBeNull();
    sourceQuery.mockResolvedValue(depiction);
    await expect(getPublicMolecule("lsd")).resolves.toBeNull();
    revalidateTag(publicMoleculeTag("lsd"), { expire: 0 });
    await expect(getPublicMolecule("lsd")).resolves.toEqual(depiction);
  });

  it("propagates a transport failure instead of persisting it as a missing depiction", async () => {
    sourceQuery.mockRejectedValueOnce(new Error("fetch failed"));
    await expect(getPublicMolecule("lsd")).rejects.toThrow("fetch failed");
    sourceQuery.mockResolvedValueOnce(depiction);
    await expect(getPublicMolecule("lsd")).resolves.toEqual(depiction);
  });

  it("refreshes the saved molecule's bytes and revision without expiring a class depiction", async () => {
    const classDepiction = { svg: "<svg id='class' />", updatedAt: revision };
    sourceQuery.mockResolvedValueOnce(depiction).mockResolvedValueOnce(classDepiction);
    await getPublicMolecule("lsd");
    await getPublicMolecule("class:lysergamides");
    revalidateTag(publicMoleculeTag("lsd"), { expire: 0 });
    const replacement = { svg: "<svg id='new' />", updatedAt: nextRevision };
    sourceQuery.mockResolvedValue(replacement);
    await expect(getPublicMolecule("class:lysergamides")).resolves.toEqual(classDepiction);
    await expect(getPublicMolecule("lsd")).resolves.toEqual(replacement);
  });

  it("refreshes one slug's version after publication", async () => {
    sourceQuery.mockResolvedValueOnce({ updatedAt: revision });
    await expect(getMoleculeUpdatedAt("lsd")).resolves.toBe(revision);
    sourceQuery.mockResolvedValue({ updatedAt: nextRevision });
    await expect(getMoleculeUpdatedAt("lsd")).resolves.toBe(revision);
    revalidateTag(publicMoleculeTag("lsd"), { expire: 0 });
    await expect(getMoleculeUpdatedAt("lsd")).resolves.toBe(nextRevision);
  });

  it("does not let a metadata failure become renderable absence", async () => {
    sourceQuery.mockRejectedValueOnce(new Error("fetch failed"));
    await expect(getMoleculeUpdatedAt("lsd")).rejects.toThrow("fetch failed");
    sourceQuery.mockResolvedValueOnce({ updatedAt: revision });
    await expect(getMoleculeUpdatedAt("lsd")).resolves.toBe(revision);
  });

  it("does not let an index failure become a renderable empty index", async () => {
    sourceQuery.mockRejectedValueOnce(new Error("fetch failed"));
    await expect(getMoleculeOverrideIndex()).rejects.toThrow("fetch failed");
    sourceQuery.mockResolvedValueOnce([{ slug: "lsd", updatedAt: revision }]);
    await expect(getMoleculeOverrideIndex()).resolves.toEqual(new Map([["lsd", revision]]));
  });
});
