import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { selectReplicationsByArtistNames } from "../../server/replications";
import { contributorMatchNames } from "../contributorProfileIdentity";
import type { NormalizedUserProfile } from "../../src/data/userProfiles";

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
const cacheTrace = vi.hoisted(() => ({ entered: [] as string[] }));
vi.mock("next/cache", async () => {
  const { AsyncLocalStorage } = await import("node:async_hooks");
  const inside = new AsyncLocalStorage<string>();
  return {
    unstable_cache: <T extends (...args: never[]) => Promise<unknown>>(fn: T, keyParts: string[] = []) =>
      ((...args: Parameters<T>) => {
        const key = keyParts[0] ?? "<unkeyed>";
        const outer = inside.getStore();
        if (outer) {
          throw new Error(`unstable_cache "${key}" entered from inside unstable_cache "${outer}"; Next bypasses the inner one`);
        }
        cacheTrace.entered.push(key);
        return inside.run(key, () => fn(...args));
      }) as unknown as T,
  };
});

const mocks = vi.hoisted(() => ({
  queryData: vi.fn(),
}));

vi.mock("./serverClient", () => ({
  queryData: mocks.queryData,
}));

const substanceMocks = vi.hoisted(() => ({
  getPublicSubstanceBySlug: vi.fn(),
}));

vi.mock("./publicData.substances", () => ({
  getPublicSubstanceBySlug: substanceMocks.getPublicSubstanceBySlug,
}));

const contributor = (
  overrides: { key: string; displayName: string; aliases?: string[] },
): NormalizedUserProfile => ({
  aliases: [],
  avatarUrl: null,
  bio: "",
  links: [],
  hasCustomBio: false,
  ...overrides,
});

const row = (artist: string) => ({ slug: artist.toLowerCase(), artist });

describe("replication contributor matching", () => {
  const rows = [
    row("Josie Kins"),
    row("josie kins"),
    row("Unity"),
    row("Someone Else"),
    row("Unknown"),
    row("various artists"),
    row("midjourney"),
  ];

  it("matches a contributor across an exact-cased display name and a lowercase alias", () => {
    const profile = contributor({
      key: "JOSIE",
      displayName: "Josie Kins",
      aliases: ["unity"],
    });

    expect(
      selectReplicationsByArtistNames(rows, contributorMatchNames(profile)).map((item) => item.artist),
    ).toEqual(["Josie Kins", "josie kins", "Unity"]);
  });

  it("never joins the unattributed marker, which names nobody a profile could be", () => {
    expect(selectReplicationsByArtistNames(rows, ["Unknown"])).toEqual([]);
    expect(selectReplicationsByArtistNames(rows, ["  UNKNOWN  "])).toEqual([]);
    expect(
      selectReplicationsByArtistNames(
        rows,
        contributorMatchNames(contributor({ key: "IMPOSTOR", displayName: "Unknown" })),
      ),
    ).toEqual([]);
  });

  it("joins a collective or generator credit to the marker profile that names it", () => {
    // "various artists" and "midjourney" are real, repeatable bylines, and the
    // site gives them marker profiles so their gallery sections are curatable.
    // The join is what makes that ordering reachable from the Contributors tab.
    const markers = contributor({
      key: "VARIOUS-ARTISTS",
      displayName: "Various Artists",
      aliases: ["midjourney"],
    });

    expect(
      selectReplicationsByArtistNames(rows, contributorMatchNames(markers)).map((item) => item.artist),
    ).toEqual(["various artists", "midjourney"]);
  });

  it("keeps a marker in the name list from dragging in unrelated works", () => {
    expect(
      selectReplicationsByArtistNames(rows, ["unknown", "Unity"]).map((item) => item.artist),
    ).toEqual(["Unity"]);
  });

  it("returns nothing rather than everything when a contributor has no usable names", () => {
    expect(selectReplicationsByArtistNames(rows, [])).toEqual([]);
    expect(selectReplicationsByArtistNames(rows, ["", "   "])).toEqual([]);
  });
});

describe("getReplicationsByContributor", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.queryData.mockReset();
    cacheTrace.entered.length = 0;
  });

  it("returns the contributor's own works for normalized match names", async () => {
    mocks.queryData.mockResolvedValueOnce({
      items: [{ slug: "drifting", artist: "Josie Kins", type: "video", url: "https://x/1" }],
      cursor: "done",
      isDone: true,
    });

    const { getReplicationsByContributor } = await import("./publicData.replications");
    const replications = await getReplicationsByContributor(
      contributor({ key: "JOSIE", displayName: "Josie Kins", aliases: ["Josie", "josie kins"] }),
    );

    expect(replications).toEqual([
      { slug: "drifting", artist: "Josie Kins", type: "video", url: "https://x/1" },
    ]);
  });

  it("leaves a figure out of a contributor's works rail, but keeps their audio", async () => {
    // The rail is headed "Replications" and prints its own count beside that
    // heading, and the permalink walks the same set — so a diagram credited to
    // this person would be presented as one of their works three times over.
    // A clip is a work, though: it has a tile, a viewer stage and a permalink.
    mocks.queryData.mockResolvedValueOnce({ items: [
      { slug: "drifting", artist: "Josie Kins", type: "video", url: "https://x/1" },
      { slug: "ecg-trace", artist: "Josie Kins", type: "image", role: "figure", url: "https://x/2" },
      { slug: "a-recording", artist: "Josie Kins", type: "audio", url: "https://x/3.mp3" },
    ], cursor: "done", isDone: true });

    const { getReplicationsByContributor } = await import("./publicData.replications");
    const works = await getReplicationsByContributor(
      contributor({ key: "JOSIE", displayName: "Josie Kins" }),
    );

    expect(works.map((work) => work.slug)).toEqual(["drifting", "a-recording"]);
  });

  it("returns an empty list for a contributor with no works", async () => {
    mocks.queryData.mockResolvedValueOnce({ items: [], cursor: "done", isDone: true });

    const { getReplicationsByContributor } = await import("./publicData.replications");

    await expect(
      getReplicationsByContributor(contributor({ key: "NOBODY", displayName: "Nobody" })),
    ).resolves.toEqual([]);
  });

  it("skips the read entirely when a profile carries no matchable name", async () => {
    const { getReplicationsByContributor } = await import("./publicData.replications");

    await expect(
      getReplicationsByContributor(contributor({ key: "BLANK", displayName: "" })),
    ).resolves.toEqual([]);
    expect(mocks.queryData).not.toHaveBeenCalled();
  });

  it("degrades to no works when the additive Postgres query is not deployed", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    mocks.queryData.mockRejectedValueOnce(
      new Error("[DATA Q(replications:getByArtistNamesPage)] Could not find public function"),
    );

    const { getReplicationsByContributor } = await import("./publicData.replications");

    await expect(
      getReplicationsByContributor(contributor({ key: "JOSIE", displayName: "Josie Kins" })),
    ).resolves.toEqual([]);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("surfaces any other Postgres failure instead of pretending the portfolio is empty", async () => {
    mocks.queryData.mockRejectedValueOnce(
      new Error("[DATA Q(replications:getByArtistNamesPage)] Server Error"),
    );

    const { getReplicationsByContributor } = await import("./publicData.replications");

    await expect(
      getReplicationsByContributor(contributor({ key: "JOSIE", displayName: "Josie Kins" })),
    ).rejects.toThrow("Server Error");
  });
});

describe("getPublicReplicationsForSubstance", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
    mocks.queryData.mockReset();
    substanceMocks.getPublicSubstanceBySlug.mockReset();
    cacheTrace.entered.length = 0;
  });

  const substanceRecord = {
    slug: "lsd",
    title: "LSD",
    classification: { psychoactive_class: ["Psychedelic"] },
  };
  const matchable = (slug: string, overrides: Record<string, unknown> = {}) => ({
    slug,
    title: slug,
    type: "image",
    effect_slug: "geometry",
    title_drugs: [{ slug: "lsd", name: "LSD", class: "psychedelics" }],
    ...overrides,
  });
  const resolved = (slug: string, overrides: Record<string, unknown> = {}) => ({
    slug,
    title: slug,
    artist: "Josie Kins",
    type: "image",
    format: "jpg",
    url: `https://x/${slug}`,
    ...overrides,
  });
  const ONE_SHOT = "substanceGalleries:getPublicGalleryBySubstance";
  const notDeployed = () => {
    throw new Error(`[DATA Q(${ONE_SHOT})] Could not find public function for '${ONE_SHOT}'`);
  };
  const respond = (handlers: Record<string, (args: Record<string, unknown>) => unknown>) => {
    mocks.queryData.mockImplementation(async (name: string, args: Record<string, unknown>) => {
      const handler = handlers[name];
      if (!handler) throw new Error(`Unexpected Postgres query ${name}`);
      return handler(args);
    });
  };

  it("returns the deployed showcase in deterministic publishable order", async () => {
    substanceMocks.getPublicSubstanceBySlug.mockResolvedValue(substanceRecord);
    respond({
      [ONE_SHOT]: (args) => {
        expect(args).toEqual({ substance_slug: "lsd" });
        return {
          items: [
            {
              replication: resolved("specific-video", { type: "video", format: "mp4" }),
              provenance: { matchedVia: "specific_drug", effectSlug: "geometry", substanceSlug: "lsd" },
            },
            {
              replication: resolved("hand-picked"),
              provenance: { matchedVia: "curated", effectSlug: "geometry" },
            },
            {
              // The gate ships with the build: a row Postgres still returns but
              // this build no longer publishes is dropped here.
              replication: resolved("demoted", { replication_status: "not-replication" }),
              provenance: { matchedVia: "specific_drug", effectSlug: "geometry", substanceSlug: "lsd" },
            },
          ],
        };
      },
    });

    const { getPublicReplicationsForSubstance } = await import("./publicData.replications");
    const gallery = await getPublicReplicationsForSubstance("lsd");

    expect(gallery.items.map((entry) => entry.replication.slug)).toEqual([
      "specific-video",
      "hand-picked",
    ]);
    expect(gallery.items.map((entry) => entry.provenance.matchedVia)).toEqual([
      "specific_drug",
      "curated",
    ]);
  });

  it("falls back to the corpus path when the one-shot query is not deployed", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    substanceMocks.getPublicSubstanceBySlug.mockImplementation(async (slug: string) =>
      slug === "lsd"
        ? substanceRecord
        : { slug, title: slug, classification: { psychoactive_class: ["Stimulant"] } },
    );
    respond({
      [ONE_SHOT]: notDeployed,
      "substanceGalleries:getPublicMatchableReplicationsPage": () => ({
        items: [matchable("specific-image")],
        cursor: "done",
        isDone: true,
      }),
      "substanceGalleries:getBySubstance": () => null,
      "replications:getBySlugs": (args) => (args.slugs as string[]).map((slug) => resolved(slug)),
    });

    const { getPublicReplicationsForSubstance } = await import("./publicData.replications");
    await expect(getPublicReplicationsForSubstance("lsd")).resolves.toMatchObject({
      items: [{ replication: { slug: "specific-image" } }],
    });
    await expect(getPublicReplicationsForSubstance("caffeine")).resolves.toEqual({ items: [] });

  });

  it("falls back to the corpus path when the one-shot query fails for another reason", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    substanceMocks.getPublicSubstanceBySlug.mockResolvedValue(substanceRecord);
    respond({
      [ONE_SHOT]: () => {
        throw new Error(`[DATA Q(${ONE_SHOT})] Server Error: Too many bytes read`);
      },
      "substanceGalleries:getPublicMatchableReplicationsPage": () => ({
        items: [matchable("specific-image")],
        cursor: "done",
        isDone: true,
      }),
      "substanceGalleries:getBySubstance": () => null,
      "replications:getBySlugs": (args) => (args.slugs as string[]).map((slug) => resolved(slug)),
    });

    const { getPublicReplicationsForSubstance } = await import("./publicData.replications");
    await expect(getPublicReplicationsForSubstance("lsd")).resolves.toMatchObject({
      items: [{ replication: { slug: "specific-image" } }],
    });
  });

  it("keeps a disabled gallery empty on the complete-corpus fallback", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    substanceMocks.getPublicSubstanceBySlug.mockResolvedValue(substanceRecord);
    respond({
      [ONE_SHOT]: notDeployed,
      "substanceGalleries:getPublicMatchableReplicationsPage": () => ({
        items: [matchable("new-specific-image"), matchable("direct", { title_drugs: [] })],
        cursor: "done",
        isDone: true,
      }),
      "substanceGalleries:getBySubstance": () => ({
        curated_slugs: ["direct"], removed_slugs: [], carousel_order: ["direct"], disabled: true,
      }),
    });
    // Reload after resetModules to exercise deployment fallback and its cache leaves.
    const { getPublicReplicationsForSubstance } = await import("./publicData.replications");
    expect(await getPublicReplicationsForSubstance("lsd")).toEqual({ items: [] });
  });

  it("assembles the showcase from the shared corpus, curation, and one indexed resolution", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    substanceMocks.getPublicSubstanceBySlug.mockResolvedValue(substanceRecord);
    respond({
      [ONE_SHOT]: notDeployed,
      "substanceGalleries:getPublicMatchableReplicationsPage": (args) => {
        expect(args).toEqual({ limit: 256 });
        return {
          items: [
            matchable("specific-image"),
            matchable("specific-video", { type: "video" }),
            matchable("hand-picked", { title_drugs: [] }),
            matchable("banned-work"),
          ],
          cursor: "done",
          isDone: true,
        };
      },
      "substanceGalleries:getBySubstance": (args) => {
        expect(args).toEqual({ substance_slug: "lsd" });
        return {
          substance_slug: "lsd",
          curated_slugs: ["hand-picked"],
          removed_slugs: ["banned-work"],
          carousel_order: [],
        };
      },
      "replications:getBySlugs": (args) =>
        (args.slugs as string[]).map((slug) => resolved(slug)).reverse(),
    });

    const { getPublicReplicationsForSubstance } = await import("./publicData.replications");
    const gallery = await getPublicReplicationsForSubstance("lsd");

    // Merged order survives an out-of-order indexed resolution: specific
    // videos, then specific images, then the unmatched manual placement.
    expect(gallery.items.map((entry) => entry.replication.slug)).toEqual([
      "specific-video",
      "specific-image",
      "hand-picked",
    ]);
    expect(gallery.items.map((entry) => entry.provenance.matchedVia)).toEqual([
      "specific_drug",
      "specific_drug",
      "curated",
    ]);
  });

  it("drops slugs the indexed resolution does not return and re-applies the publishability gate", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    substanceMocks.getPublicSubstanceBySlug.mockResolvedValue(substanceRecord);
    respond({
      [ONE_SHOT]: notDeployed,
      "substanceGalleries:getPublicMatchableReplicationsPage": () => ({
        items: [matchable("kept"), matchable("vanishing"), matchable("demoted")],
        cursor: "done",
        isDone: true,
      }),
      "substanceGalleries:getBySubstance": () => null,
      "replications:getBySlugs": () => [
        resolved("kept"),
        resolved("demoted", { replication_status: "not-replication" }),
      ],
    });

    const { getPublicReplicationsForSubstance } = await import("./publicData.replications");
    const gallery = await getPublicReplicationsForSubstance("lsd");

    expect(gallery.items.map((entry) => entry.replication.slug)).toEqual(["kept"]);
  });

  it("returns an empty gallery for a missing substance without touching the corpus", async () => {
    substanceMocks.getPublicSubstanceBySlug.mockResolvedValue(null);

    const { getPublicReplicationsForSubstance } = await import("./publicData.replications");

    await expect(getPublicReplicationsForSubstance("aspirin")).resolves.toEqual({
      items: [],
    });
    expect(mocks.queryData).not.toHaveBeenCalled();
  });

  it("degrades to an empty showcase when neither additive gallery query is deployed", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    substanceMocks.getPublicSubstanceBySlug.mockResolvedValue(substanceRecord);
    respond({
      [ONE_SHOT]: notDeployed,
      "substanceGalleries:getPublicMatchableReplicationsPage": () => {
        throw new Error(
          "[DATA Q(substanceGalleries:getPublicMatchableReplicationsPage)] Could not find public function",
        );
      },
      "substanceGalleries:getBySubstance": () => null,
    });

    const { getPublicReplicationsForSubstance } = await import("./publicData.replications");

    await expect(getPublicReplicationsForSubstance("lsd")).resolves.toEqual({
      items: [],
    });
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("surfaces any other Postgres failure instead of pretending the showcase is empty", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    substanceMocks.getPublicSubstanceBySlug.mockResolvedValue(substanceRecord);
    respond({
      [ONE_SHOT]: notDeployed,
      "substanceGalleries:getPublicMatchableReplicationsPage": () => {
        throw new Error(
          "[DATA Q(substanceGalleries:getPublicMatchableReplicationsPage)] Server Error",
        );
      },
      "substanceGalleries:getBySubstance": () => null,
    });

    const { getPublicReplicationsForSubstance } = await import("./publicData.replications");

    await expect(getPublicReplicationsForSubstance("lsd")).rejects.toThrow("Server Error");
  });
});

describe("getPublicGalleryReplications", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.queryData.mockReset();
    cacheTrace.entered.length = 0;
  });

  const work = (slug: string, artist: string) => ({
    slug,
    artist,
    effect_slug: slug,
    type: "image",
    url: `https://x/${slug}`,
  });

  const corpus = [
    work("drifting", "Josie Kins"),
    work("tracers", "josie"),
    work("breathing", "Kaytwo"),
    work("orbism", "A Stranger"),
  ];

  const stubData = (profiles: NormalizedUserProfile[]) => {
    mocks.queryData.mockImplementation(async (functionName: string, args: { slugs?: string[] } = {}) => {
      if (functionName === "replications:getPublicGalleryPage") {
        return { items: corpus, cursor: "done", isDone: true };
      }
      if (functionName === "replications:getBySlugs") {
        return corpus.filter((row) => args.slugs?.includes(row.slug));
      }
      if (functionName === "contributorProfiles:getPublicIdentities") {
        return profiles;
      }
      if (functionName === "replicationTaxonomy:getPublicArtistsByKeys") {
        return [];
      }
      throw new Error(`Unexpected Postgres read: ${functionName}`);
    });
  };

  it("returns the compact, already-filtered gallery membership in one read", async () => {
    const membership = [
      {
        _id: "replication-1",
        slug: "breathing",
        title: "Breathing",
        artist: "Kaytwo",
        type: "image",
        format: "webp",
        effect_slug: "breathing",
        url: "https://x/breathing",
        created_at: "2026-01-01",
      },
      {
        _id: "replication-2",
        slug: "orbism",
        title: "Orbism",
        artist: "A Stranger",
        type: "video",
        format: "mp4",
        effect_slug: "geometry",
        url: "https://x/orbism",
        created_at: "2026-01-02",
      },
    ];
    mocks.queryData.mockResolvedValueOnce(membership);

    const { getPublicGalleryReplications } = await import("./publicData.replications");

    await expect(getPublicGalleryReplications()).resolves.toEqual(membership);
    expect(mocks.queryData).toHaveBeenCalledTimes(1);
    expect(mocks.queryData).toHaveBeenCalledWith(
      "replications:getPublicGalleryMembership",
      {},
    );
  });

  it("preserves omitted nullable media fields in the compact membership contract", async () => {
    const membership = [{
      _id: "replication-1",
      slug: "nullable-renditions",
      title: "Nullable renditions",
      artist: "A Stranger",
      type: "image",
      format: "webp",
      effect_slug: "geometry",
      url: "https://x/nullable-renditions",
      created_at: "2026-01-01",
    }];
    mocks.queryData.mockResolvedValueOnce(membership);

    const { getPublicGalleryReplications } = await import("./publicData.replications");
    const [preview] = await getPublicGalleryReplications();

    expect(preview).toEqual(membership[0]);
    expect(preview).not.toHaveProperty("thumbnail_url");
    expect(preview).not.toHaveProperty("preview_url");
    expect(preview).not.toHaveProperty("motion_url");
    expect(preview).not.toHaveProperty("motion_poster_url");
  });

  it("leaves every other replication read unfiltered by the exclusion", async () => {
    stubData([
      {
        ...contributor({ key: "JOSIE", displayName: "Josie Kins", aliases: ["josie"] }),
        exclude_from_gallery: true,
      },
    ]);

    const { getPublicReplications } = await import("./publicData.effects");
    // The shared corpus read feeds the public API and the permalink walk; the
    // exclusion is a gallery-presentation choice, not an unpublication.
    await expect(getPublicReplications()).resolves.toEqual(corpus);

    const { getPublicReplicationsByEffect } = await import("./publicData.effects");
    // Effect-article replication sections still show an excluded artist's work.
    await expect(getPublicReplicationsByEffect("drifting")).resolves.toEqual([
      work("drifting", "Josie Kins"),
    ]);
  });
});

describe("getPublicReplicationsBySlugs", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.queryData.mockReset();
    cacheTrace.entered.length = 0;
  });

  it("returns a complete, ordered, deduplicated long curated selection", async () => {
    let checkedOut = false;
    mocks.queryData.mockImplementation(
      async (_functionName: string, args: { slugs: string[] }) => {
        if (checkedOut) throw new Error("checkout queue exhausted");
        checkedOut = true;
        await Promise.resolve();
        checkedOut = false;
        return args.slugs.map((slug) => ({
          slug,
          artist: "Artist",
          type: "image",
          url: `https://x/${slug}`,
        }));
      },
    );
    const uniqueSlugs = Array.from({ length: 205 }, (_, index) => `work-${index}`);
    const slugs = [
      ...uniqueSlugs.slice(0, 100),
      "work-0",
      ...uniqueSlugs.slice(100),
      "work-100",
      "work-204",
    ];
    const { getPublicReplicationsBySlugs } = await import(
      "./publicData.replicationDetails"
    );

    await expect(getPublicReplicationsBySlugs(slugs)).resolves.toEqual(
      uniqueSlugs.map((slug) => ({
        slug,
        artist: "Artist",
        type: "image",
        url: `https://x/${slug}`,
      })),
    );
  });
});
