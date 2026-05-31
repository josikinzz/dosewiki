import { describe, expect, it, vi } from "vitest";
import { fullArticleWithDosage } from "../../src/test/fixtures/articles";
import {
  createConvexPublicDataReadAdapter,
  projectPublicEffectPreviews,
  projectPublicSubstanceLibraryRecord,
  projectPublicSubstancePreviews,
} from "./publicData.reads";
import type { SubstanceRecord } from "./publicData.shared";

vi.mock("server-only", () => ({}));

describe("public data read adapter", () => {
  it("maps DoseWiki public reads to the Convex public query catalog", async () => {
    const queryCalls: Array<[string, Record<string, unknown>]> = [];
    const query = async <Result, Args extends Record<string, unknown>>(name: string, args: Args): Promise<Result> => {
      queryCalls.push([name, args]);
      if (name === "substanceIndex:getPublicBySlug") {
        return {
          id: 1,
          title: "LSD",
          slug: "lsd",
          priority: "high",
          index_categories: [],
        } as Result;
      }
      return [] as Result;
    };
    const adapter = createConvexPublicDataReadAdapter(query);

    await adapter.getPublicSubstanceBySlug("lsd");
    await adapter.getPublicTripReportsByContributor("AUTHOR", ["Author", "Alias"]);
    await adapter.getPublicReplicationsByEffect("visual-drifting");
    await adapter.getPublicIndexLayoutByType("psychoactive");

    expect(queryCalls[0]).toEqual(["substanceIndex:getPublicBySlug", { slug: "lsd" }]);
    expect(queryCalls[1]).toEqual(["tripReports:getByContributor", {
      profileKey: "AUTHOR",
      authorNames: ["Author", "Alias"],
    }]);
    expect(queryCalls[2]).toEqual(["replications:getReplicationsByEffect", {
      effect_slug: "visual-drifting",
    }]);
    expect(queryCalls[3]).toEqual(["indexLayouts:getByType", { type: "psychoactive" }]);
  });

  it("owns public effect preview projection and ordering", () => {
    expect(
      projectPublicEffectPreviews([
        {
          name: "Zeta",
          slug: "zeta",
          summary: "Long ".repeat(80),
          tags: ["visual"],
        },
        {
          name: "Alpha",
          slug: "alpha",
          summary: "Short summary",
          featured: true,
          tags: [],
        },
      ]),
    ).toEqual([
      {
        name: "Alpha",
        slug: "alpha",
        summary: "Short summary",
        featured: true,
        tags: [],
      },
      {
        name: "Zeta",
        slug: "zeta",
        summary: expect.stringMatching(/…$/),
        featured: false,
        tags: ["visual"],
      },
    ]);
  });

  it("owns public substance preview projection and ordering", () => {
    expect(
      projectPublicSubstancePreviews([
        {
          id: 2,
          title: "Zed Drug",
          priority: "normal",
          index_categories: ["other"],
          summary: "Long ".repeat(80),
        },
        {
          id: 1,
          title: "LSD",
          slug: "lsd",
          priority: "high",
          index_categories: ["psychedelic"],
          summary: "Acid",
        },
      ] as SubstanceRecord[]),
    ).toEqual([
      {
        title: "LSD",
        slug: "lsd",
        summary: "Acid",
        priority: "high",
        indexCategories: ["psychedelic"],
      },
      {
        title: "Zed Drug",
        slug: "zed-drug",
        summary: expect.stringMatching(/…$/),
        priority: "normal",
        indexCategories: ["other"],
      },
    ]);
  });

  it("preserves structured references in server library records without exposing editorial review", () => {
    const result = projectPublicSubstanceLibraryRecord({
      id: 1,
      title: "LSD",
      slug: "lsd",
      priority: "high",
      index_categories: ["psychedelic"],
      summary: "Acid",
      references: [
        {
          id: "ref-1",
          type: "webpage",
          title: "Reference One",
          authors: [],
          url: "https://example.test/ref-1",
          sourceType: "unknown",
          quality: "fallback",
        },
      ],
      editorial_review: {
        status: "approved",
        notes: "internal",
      },
    } as unknown as SubstanceRecord);

    expect(result.references).toEqual([
      expect.objectContaining({
        id: "ref-1",
        title: "Reference One",
      }),
    ]);
    expect(result).not.toHaveProperty("editorial_review");
  });

  it("falls back to legacy rows for stale public projection reads when Convex only reports Server Error", async () => {
    const stalePublicFunctions = new Set([
      "substanceIndex:getPublicLibraryInput",
      "substanceIndex:getPublicLookup",
      "subjectiveEffects:getPublicPreviews",
    ]);
    const queryCalls: Array<[string, Record<string, unknown>]> = [];
    const query = async <Result, Args extends Record<string, unknown>>(name: string, args: Args): Promise<Result> => {
      queryCalls.push([name, args]);

      if (stalePublicFunctions.has(name)) {
        throw new Error(`[CONVEX Q(${name})] Server Error`);
      }

      if (name === "substanceIndex:getAll") {
        return [
          {
            ...fullArticleWithDosage,
            slug: "lsd",
            priority: "high",
            editorial_review: {
              status: "completed",
              notes: "internal",
            },
          },
        ] as Result;
      }

      if (name === "subjectiveEffects:getAll") {
        return [
          {
            name: "Visual drifting",
            slug: "visual-drifting",
            summary: "Objects appear to drift.",
            featured: true,
            tags: ["visual"],
            description_raw: "Objects appear to drift.",
          },
        ] as Result;
      }

      return [] as Result;
    };
    const adapter = createConvexPublicDataReadAdapter(query);

    const libraryRecords = await adapter.getRawSubstances();
    expect(libraryRecords).toEqual([
      expect.objectContaining({ title: "LSD", slug: "lsd", priority: "high" }),
    ]);
    await expect(adapter.getPublicSubstanceLookup()).resolves.toEqual([
      { slug: "lsd", name: "LSD", priority: "high" },
    ]);
    await expect(adapter.getPublicEffects()).resolves.toEqual([
      {
        name: "Visual drifting",
        slug: "visual-drifting",
        summary: "Objects appear to drift.",
        featured: true,
        tags: ["visual"],
      },
    ]);

    expect(libraryRecords[0]).not.toHaveProperty("editorial_review");
    expect(queryCalls).toEqual([
      ["substanceIndex:getPublicLibraryInput", {}],
      ["substanceIndex:getAll", {}],
      ["substanceIndex:getPublicLookup", {}],
      ["substanceIndex:getAll", {}],
      ["subjectiveEffects:getPublicPreviews", {}],
      ["subjectiveEffects:getAll", {}],
    ]);
  });

  it("does not use stale-deployment fallbacks for ordinary Convex query failures", async () => {
    const queryCalls: Array<[string, Record<string, unknown>]> = [];
    const query = async <Result, Args extends Record<string, unknown>>(name: string, args: Args): Promise<Result> => {
      queryCalls.push([name, args]);
      throw new Error(`[CONVEX Q(${name})] Validation failed`);
    };
    const adapter = createConvexPublicDataReadAdapter(query);

    await expect(adapter.getPublicSubstanceLookup()).rejects.toThrow("Validation failed");
    expect(queryCalls).toEqual([["substanceIndex:getPublicLookup", {}]]);
  });

  it("falls back for stale public article projection reads without exposing raw fields", async () => {
    const stalePublicFunctions = new Set([
      "substanceIndex:getPublicPreviews",
      "substanceIndex:getPublicBySlug",
      "subjectiveEffects:getPublicBySlug",
      "subjectiveEffects:getPublicArticles",
      "subjectiveEffects:getPublicByCategory",
    ]);
    const legacySubstance = {
      ...fullArticleWithDosage,
      slug: "lsd",
      priority: "high",
      editorial_review: {
        status: "completed",
        notes: "internal",
      },
    };
    const legacyEffect = {
      name: "Respiratory depression",
      slug: "respiratory-depression",
      summary: "Breathing becomes slower or shallower.",
      featured: false,
      tags: ["physical"],
      description_raw: "Breathing becomes slower or shallower.",
      internal_notes: "raw field",
    };
    const query = async <Result, Args extends Record<string, unknown>>(name: string, args: Args): Promise<Result> => {
      if (stalePublicFunctions.has(name)) {
        throw new Error(`[CONVEX Q(${name})] Server Error`);
      }

      if (name === "substanceIndex:getAll") {
        return [legacySubstance] as Result;
      }

      if (name === "substanceIndex:getBySlug") {
        expect(args).toEqual({ slug: "lsd" });
        return legacySubstance as Result;
      }

      if (name === "subjectiveEffects:getBySlug") {
        expect(args).toEqual({ slug: "respiratory-depression" });
        return legacyEffect as Result;
      }

      if (name === "subjectiveEffects:getAll" || name === "subjectiveEffects:getByCategory") {
        return [legacyEffect] as Result;
      }

      return [] as Result;
    };
    const adapter = createConvexPublicDataReadAdapter(query);

    await expect(adapter.getPublicSubstancePreviews()).resolves.toEqual([
      expect.objectContaining({
        title: "LSD",
        slug: "lsd",
        priority: "high",
        indexCategories: ["Psychedelics", "Research Chemicals"],
      }),
    ]);

    const substance = await adapter.getPublicSubstanceBySlug("lsd");
    expect(substance).toMatchObject({ title: "LSD", slug: "lsd", priority: "high" });
    expect(substance).not.toHaveProperty("editorial_review");

    const effect = await adapter.getPublicEffectBySlug("respiratory-depression");
    expect(effect).toMatchObject({
      name: "Respiratory depression",
      slug: "respiratory-depression",
    });
    expect(effect).not.toHaveProperty("internal_notes");

    const effectArticles = await adapter.getPublicEffectArticles();
    expect(effectArticles[0]).not.toHaveProperty("internal_notes");

    await expect(adapter.getPublicEffectsByCategory("physical")).resolves.toEqual([
      {
        name: "Respiratory depression",
        slug: "respiratory-depression",
        summary: "Breathing becomes slower or shallower.",
        featured: false,
        tags: ["physical"],
      },
    ]);
  });
});
