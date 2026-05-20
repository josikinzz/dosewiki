import { describe, expect, it, vi } from "vitest";
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
      if (name === "substanceIndex:getBySlug") {
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

    expect(queryCalls[0]).toEqual(["substanceIndex:getBySlug", { slug: "lsd" }]);
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
});
