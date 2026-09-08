import { statSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GET } from "../../src/app/open-data/SubstanceIndex.json/route";
import { getMoleculePackDownloadStats, getOpenDataDownloadStats } from "./downloadStats";

const documents = [
  {
    _id: "cx2",
    _creationTime: 2,
    id: 7,
    title: "Zeta",
    slug: "zeta",
    editorial_review: { reviewed_by: "witchy@local.dose.wiki", status: "reviewed" },
    section_gaps: { dosage: "missing" },
  },
  { _id: "cx1", _creationTime: 1, id: 3, title: "Alpha", slug: "alpha" },
  { _id: "cx4", _creationTime: 4, id: 2, title: "Draft", slug: "draft", priority: "low" },
];

const corpus = vi.hoisted(() => ({
  substances: vi.fn(),
  effects: vi.fn(),
  reports: vi.fn(),
}));

vi.mock("../convex/publicData", () => ({
  getPublicFullSubstanceDocuments: corpus.substances,
  getPublicEffectArticles: corpus.effects,
  getPublicReportDetails: corpus.reports,
}));

afterEach(() => {
  corpus.substances.mockReset();
  corpus.effects.mockReset();
  corpus.reports.mockReset();
  vi.unstubAllEnvs();
});

describe("open-data download stats", () => {
  it("reports the entry count and decoded byte length of the file the route serves", async () => {
    corpus.substances.mockResolvedValue(documents);

    const stats = await getOpenDataDownloadStats("SubstanceIndex");
    const served = gunzipSync(Buffer.from(await (await GET()).arrayBuffer()));

    // Two published articles; the low-priority draft is not in the file.
    expect(stats.count).toBe(2);
    expect(stats.count).toBe(JSON.parse(served.toString("utf8")).count);
    // Size is the saved file (browsers decode the gzip transparently), not the transfer.
    expect(stats.bytes).toBe(served.byteLength);
  });

  it("describes the committed molecule pack from its own manifest and zip", () => {
    const stats = getMoleculePackDownloadStats();

    expect(stats.bytes).toBe(statSync("public/dosewiki-molecules.zip").size);
    expect(stats.count).toBeGreaterThan(0);
    expect(Number.isInteger(stats.count)).toBe(true);
  });
});
