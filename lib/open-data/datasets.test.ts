import { beforeEach, describe, expect, it, vi } from "vitest";

const reads = vi.hoisted(() => ({
  getPublicFullSubstanceDocuments: vi.fn(),
  getPublicEffectArticles: vi.fn(),
  getPublicReportDetails: vi.fn(),
}));

vi.mock("../data/publicData", () => reads);

import {
  OPEN_DATA_DATASETS,
  OPEN_DATA_EFFECT_INDEX_LICENSE,
  OPEN_DATA_LICENSE_URL,
  OPEN_DATA_SOURCE,
  OPEN_DATA_SUBSTANCE_INDEX_LICENSE,
  OPEN_DATA_TRIP_REPORT_LICENSE,
  buildOpenDataDocument,
  type OpenDataDatasetName,
} from "./datasets";

const substances = [
  {
    _id: "cx2",
    _creationTime: 2,
    id: 7,
    title: "Zeta",
    slug: "zeta",
    editorial_review: { reviewed_by: "oldhandle@local.dose.wiki", status: "reviewed" },
    section_gaps: { dosage: "missing" },
  },
  { _id: "cx1", _creationTime: 1, id: 3, title: "Alpha", slug: "alpha" },
  { _id: "cx3", _creationTime: 3, id: null, title: "Legacy", slug: "legacy" },
  { _id: "cx4", _creationTime: 4, id: 2, title: "Draft", slug: "draft", priority: "low" },
  { _id: "cx5", _creationTime: 5, id: 5, title: "Unlisted", slug: "unlisted", priority: "hide_for_now" },
];

const effects = [
  { _id: "fx2", _creationTime: 2, slug: "visual-drifting", name: "Visual drifting", body: "Full article" },
  { _id: "fx1", _creationTime: 1, slug: "analysis-enhancement", name: "Analysis enhancement", body: "Full article" },
];

const reports = [
  {
    _id: "tr2",
    _creationTime: 2,
    slug: "the-void",
    title: "The Void",
    peak: [{ time: "T+0:10", description: "Full narrative" }],
    attribution_review: { reviewed_by: "editor", reviewed_at: "2026-01-01", decision: "declined" },
  },
  { _id: "tr1", _creationTime: 1, slug: "first-light", title: "First Light", peak: [] },
];

type Row = Record<string, unknown>;

async function itemsOf(name: OpenDataDatasetName): Promise<Row[]> {
  const { json } = await buildOpenDataDocument(OPEN_DATA_DATASETS[name]);
  // The builder emits the envelope it documents; the test reads it back as untyped JSON.
  const payload: { items: Row[] } = JSON.parse(json);
  return payload.items;
}

describe("open-data datasets", () => {
  beforeEach(() => {
    reads.getPublicFullSubstanceDocuments.mockReset().mockResolvedValue(substances);
    reads.getPublicEffectArticles.mockReset().mockResolvedValue(effects);
    reads.getPublicReportDetails.mockReset().mockResolvedValue(reports);
  });

  it.each([
    ["SubstanceIndex", OPEN_DATA_SUBSTANCE_INDEX_LICENSE, 3],
    ["EffectIndex", OPEN_DATA_EFFECT_INDEX_LICENSE, 2],
    ["TripReports", OPEN_DATA_TRIP_REPORT_LICENSE, 2],
  ] as const)("wraps %s in the shared envelope with its own licence", async (name, license, count) => {
    const { count: reported, json } = await buildOpenDataDocument(OPEN_DATA_DATASETS[name]);
    const payload = JSON.parse(json);

    expect(reported).toBe(count);
    expect(payload).toMatchObject({
      dataset: name,
      count,
      license,
      licenseUrl: OPEN_DATA_LICENSE_URL,
      source: OPEN_DATA_SOURCE,
    });
    expect(payload.items).toHaveLength(count);
    expect(Date.parse(payload.generatedAt)).not.toBeNaN();
  });

  it.each(["SubstanceIndex", "EffectIndex", "TripReports"] as const)(
    "strips Postgres bookkeeping and the dataset's internal fields from every %s item",
    async (name) => {
      const items = await itemsOf(name);
      const forbidden = ["_id", "_creationTime", ...OPEN_DATA_DATASETS[name].stripFields];

      expect(items.length).toBeGreaterThan(0);
      for (const item of items) {
        for (const field of forbidden) {
          expect(item).not.toHaveProperty(field);
        }
      }
    },
  );

  it("sorts substances by article id with null ids last, mirroring the committed export", async () => {
    expect((await itemsOf("SubstanceIndex")).map((item) => item.title)).toEqual(["Alpha", "Zeta", "Legacy"]);
  });

  it("excludes unfinished low-priority and hide_for_now substances", async () => {
    const titles = (await itemsOf("SubstanceIndex")).map((item) => item.title);
    expect(titles).not.toContain("Draft");
    expect(titles).not.toContain("Unlisted");
  });

  it("never leaks the reviewing editor or section gaps into the substance document", async () => {
    const { json } = await buildOpenDataDocument(OPEN_DATA_DATASETS.SubstanceIndex);
    expect(json).not.toMatch(/editorial_review|section_gaps|reviewed_by|oldhandle/);
  });

  it("sorts effects by slug and keeps the full body", async () => {
    const items = await itemsOf("EffectIndex");
    expect(items.map((item) => item.slug)).toEqual(["analysis-enhancement", "visual-drifting"]);
    for (const item of items) expect(item.body).toBe("Full article");
  });

  it("sorts trip reports by slug, drops the attribution review stamp, and keeps the narrative", async () => {
    const items = await itemsOf("TripReports");
    expect(items.map((item) => item.slug)).toEqual(["first-light", "the-void"]);
    expect(items[1].peak).toEqual([{ time: "T+0:10", description: "Full narrative" }]);
    expect(JSON.stringify(items)).not.toMatch(/attribution_review|reviewed_by/);
  });
});
