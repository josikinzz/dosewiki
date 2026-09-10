import { afterEach, describe, expect, it, vi } from "vitest";
import { ConvexError } from "convex/values";
import { fullArticleWithDosage } from "../../src/test/fixtures/articles";
import { projectLibraryInput, projectMechanismRouteInput } from "../../src/data/projections/substanceReadProjections";

vi.mock("server-only", () => ({}));
const sourceQuery = vi.hoisted(() => vi.fn());
vi.mock("./serverClient", () => ({ queryConvex: sourceQuery }));

const stored = vi.hoisted(() => new Map<string, { value: unknown; tags: string[] }>());
const refresh = vi.hoisted(() => ({
  mode: null as "background" | "blocking" | null,
  onlyKey: null as string | null,
  pending: [] as Promise<unknown>[],
}));
vi.mock("next/cache", () => ({
  unstable_cache: (read: (...args: unknown[]) => Promise<unknown>, keys: string[], options: { tags?: string[] }) =>
    async (...args: unknown[]) => {
      const key = JSON.stringify([keys, args]);
      if (stored.has(key)) {
        const previous = stored.get(key)!.value;
        const mode = refresh.mode;
        if (!mode || (refresh.onlyKey && !keys.includes(refresh.onlyKey))) return previous;
        refresh.mode = null;
        // Like Next, stale regeneration failures preserve the old cached value.
        // Blocking ISR awaits this same error-swallowing refresh promise.
        const pending = Promise.resolve().then(() => read(...args)).then((value) => {
          stored.set(key, { value, tags: options.tags ?? [] });
          return value;
        }).catch(() => previous);
        refresh.pending.push(pending);
        return mode === "blocking" ? await pending : previous;
      }
      const value = await read(...args);
      stored.set(key, { value, tags: options.tags ?? [] });
      return value;
    },
  revalidateTag: (tag: string) => {
    for (const [key, entry] of stored) if (entry.tags.includes(tag)) stored.delete(key);
  },
  revalidatePath: vi.fn(),
}));
vi.mock("@server/convex/publicLibrary", () => ({ invalidatePublicDerivedDataCache: vi.fn() }));
import { publicDataCache, publicSubstanceTag, publicArticleHistoryTag, publicSubstanceGalleryTag } from "./publicData.cache";
import { revalidateSavedPaths } from "../../src/app/api/save-to-convex/revalidateSavedPaths";
import { getPublicDataReadAdapter } from "./publicData.reads";
import { getPublicReplicationsForSubstance } from "./publicData.replications";
import { getPublicFullSubstanceDocuments } from "./publicData.substances";

afterEach(() => {
  stored.clear();
  refresh.mode = null;
  refresh.onlyKey = null;
  refresh.pending.length = 0;
  sourceQuery.mockReset();
  vi.unstubAllEnvs();
});

describe("public persistent cache boundaries", () => {
  it("does not reuse another read target's answer", async () => {
    const read = publicDataCache(async () => process.env.CONVEX_PUBLIC_READ_URL, ["target"], {});
    vi.stubEnv("CONVEX_PUBLIC_READ_URL", "https://first.example");
    expect(await read()).toBe("https://first.example");
    vi.stubEnv("CONVEX_PUBLIC_READ_URL", "https://second.example");
    expect(await read()).toBe("https://second.example");
  });

  it("never serves a convex-backed entry to a postgres-backed process, or the reverse", async () => {
    // Cutover safety: the same leaf runs in both backends during the migration,
    // and a shared entry would let stale Convex content answer Postgres reads.
    const read = publicDataCache(
      async () => `${process.env.DATA_BACKEND === "postgres" ? "postgres" : "convex"}:${process.env.DATA_BACKEND === "postgres" ? process.env.POSTGRES_POOLED_URL : process.env.CONVEX_PUBLIC_READ_URL}`,
      ["backend-identity"],
      {},
    );
    vi.stubEnv("CONVEX_PUBLIC_READ_URL", "https://deployment.convex.cloud");
    vi.stubEnv("POSTGRES_POOLED_URL", "postgres://pooled.example:6432/dosewiki");
    vi.stubEnv("DATA_BACKEND", "convex");
    expect(await read()).toBe("convex:https://deployment.convex.cloud");
    vi.stubEnv("DATA_BACKEND", "postgres");
    expect(await read()).toBe("postgres:postgres://pooled.example:6432/dosewiki");
    vi.stubEnv("DATA_BACKEND", "convex");
    expect(await read()).toBe("convex:https://deployment.convex.cloud");
    expect(stored.size).toBe(2);
  });

  it("retries readiness failures instead of persisting them as an empty answer", async () => {
    let ready = false;
    const read = publicDataCache(async () => {
      if (!ready) throw new Error("not ready");
      return ["complete"];
    }, ["readiness"], {});
    await expect(read()).rejects.toThrow("not ready");
    ready = true;
    expect(await read()).toEqual(["complete"]);
  });

  it("reuses full-document pages when the assembled export exceeds the cache limit", async () => {
    const records = Array.from({ length: 12 }, (_, index) => ({
      slug: `article-${index}`,
      summary: "x".repeat(200_000),
    }));
    sourceQuery.mockImplementation(async (name: string, args: { paginationOpts: { cursor: string | null; numItems: number } }) => {
      if (name !== "substanceIndex:getFullDocumentPage") throw new Error(`Unexpected query: ${name}`);
      const start = Number(args.paginationOpts.cursor ?? 0);
      const end = Math.min(start + args.paginationOpts.numItems, records.length);
      return { page: records.slice(start, end), isDone: end === records.length, continueCursor: String(end) };
    });
    expect(await getPublicFullSubstanceDocuments()).toEqual(records);
    const coldReads = sourceQuery.mock.calls.length;
    expect(coldReads).toBeGreaterThan(1);
    expect(await getPublicFullSubstanceDocuments()).toEqual(records);
    expect(sourceQuery).toHaveBeenCalledTimes(coldReads);
    records[0].summary = "published correction";
    await revalidateSavedPaths(["/article-0"], "manual");
    expect((await getPublicFullSubstanceDocuments())[0].summary).toBe("published correction");
  });

  it("returns oversized UTF-8 data intact without persisting it", async () => {
    let value = "界".repeat(650_000);
    const read = publicDataCache(async () => value, ["large"], {});
    expect(await read()).toBe(value);
    value = "replacement";
    expect(await read()).toBe("replacement");
  });

  it("counts the escaped fetch-cache body rather than only the raw result", async () => {
    let value = "\"".repeat(650_000);
    const read = publicDataCache(async () => value, ["escaped"], {});
    expect(await read()).toBe(value);
    value = "replacement";
    expect(await read()).toBe("replacement");
  });

  it.each(["background", "blocking"] as const)(
    "replaces a stale small value when %s regeneration grows oversized",
    async (mode) => {
      let value = "old small article";
      const read = publicDataCache(async () => value, ["growing-article"], {});
      expect(await read()).toBe(value);
      value = "fresh complete warning ".repeat(100_000);
      refresh.mode = mode;
      const first = await read();
      expect(first).toBe(mode === "background" ? "old small article" : value);
      await Promise.all(refresh.pending);
      expect(await read()).toBe(value);
      refresh.mode = mode;
      value = "subsequent safety correction";
      expect(await read()).toBe(value);
      await Promise.all(refresh.pending);
    },
  );

  it.each(["background", "blocking"] as const)(
    "uses complete corpus fallback when a cached gallery loses readiness during %s refresh",
    async (mode) => {
      let indexReady = true;
      const replication = (slug: string) => ({
        slug, title: slug, artist: "Artist", type: "image", format: "jpg",
        url: `https://example.test/${slug}.jpg`,
        title_drugs: [{ slug: "lsd", name: "LSD", class: "psychedelics" }],
      });
      sourceQuery.mockImplementation(async (name: string) => {
        if (name === "substanceIndex:getPublicBySlug") return { ...fullArticleWithDosage, slug: "lsd", title: "LSD" };
        if (name === "substanceGalleries:getPublicGalleryBySubstance") {
          if (!indexReady) throw new ConvexError({ code: "SUBSTANCE_GALLERY_INDEX_NOT_READY" });
          return { items: [{ replication: replication("old-indexed"), provenance: { matchedVia: "specific_drug", effectSlug: "geometry", substanceSlug: "lsd" } }] };
        }
        if (name === "substanceGalleries:getPublicMatchableReplicationsPage") return { items: [replication("fresh-corpus")], cursor: "", isDone: true };
        if (name === "substanceGalleries:getBySubstance") return null;
        if (name === "replications:getBySlugs") return [replication("fresh-corpus")];
        throw new Error(`Unexpected query: ${name}`);
      });
      const slugs = async () => (await getPublicReplicationsForSubstance("lsd")).items.map((item) => item.replication.slug);
      expect(await slugs()).toEqual(["old-indexed"]);
      indexReady = false;
      refresh.onlyKey = "convex-public-substance-gallery-v2";
      refresh.mode = mode;
      expect(await slugs()).toEqual(mode === "background" ? ["old-indexed"] : ["fresh-corpus"]);
      await Promise.all(refresh.pending);
      expect(await slugs()).toEqual(["fresh-corpus"]);
    },
  );

  it("immediately refreshes old and new article identities without evicting another article", async () => {
    let revision = "before";
    const reads = [publicSubstanceTag, publicArticleHistoryTag, publicSubstanceGalleryTag].map((tag, index) =>
      publicDataCache(async (slug: string) => `${slug}:${revision}`, [`scope-${index}`], {
        tags: (slug) => [tag(slug)],
      }),
    );
    for (const read of reads) {
      await read("old-name");
      await read("new-name");
      await read("untouched");
    }
    revision = "corrected";
    await revalidateSavedPaths(["/old-name", "/new-name", "/substances"], "save-to-convex");
    for (const read of reads) {
      expect(await read("old-name")).toBe("old-name:corrected");
      expect(await read("new-name")).toBe("new-name:corrected");
      expect(await read("untouched")).toBe("untouched:before");
    }
  });
  it("shares a persisted leaf across independent compositions", async () => {
    let revision = "first";
    const leaf = publicDataCache(async () => revision, ["shared-page"], {});
    const article = async () => ({ gallery: await leaf() });
    const routePlan = async () => ({ replications: await leaf() });
    expect(await article()).toEqual({ gallery: "first" });
    revision = "not-yet-expired";
    expect(await routePlan()).toEqual({ replications: "first" });
  });

  it("refreshes copy in a mixed proposal without expiring unrelated data", async () => {
    let revision = "before";
    const copy = publicDataCache(async () => revision, ["copy"], { tags: ["convex-public:copy"] });
    const unrelated = publicDataCache(async () => revision, ["other"], { tags: ["convex-public"] });
    await copy();
    await unrelated();
    revision = "after";
    await revalidateSavedPaths(["/lsd", "/copy-blocks"], "proposal-apply");
    expect(await copy()).toBe("after");
    expect(await unrelated()).toBe("before");
  });
});

it("persists library and mechanism input pages across compositions and refreshes them after edits", async () => {
  let priority: "high" | "low" = "high";
  sourceQuery.mockImplementation(async (name: string) => {
    const article = { ...fullArticleWithDosage, slug: "lsd", priority };
    const row = name === "substanceIndex:getPublicLibraryInputPage"
      ? projectLibraryInput(article)
      : projectMechanismRouteInput(article);
    return { items: [row], cursor: "done", isDone: true };
  });
  const adapter = getPublicDataReadAdapter();
  const firstLibrary = await adapter.getRawSubstances();
  const firstMechanisms = await adapter.getPublicMechanismRouteInput();
  expect(firstLibrary[0].priority).toBe("high");
  expect(firstMechanisms[0].priority).toBe("high");

  priority = "low";
  expect((await adapter.getRawSubstances())[0].priority).toBe("high");
  expect((await adapter.getPublicMechanismRouteInput())[0].priority).toBe("high");
  await revalidateSavedPaths(["/lsd"], "manual");
  expect((await adapter.getRawSubstances())[0].priority).toBe("low");
  expect((await adapter.getPublicMechanismRouteInput())[0].priority).toBe("low");
});
