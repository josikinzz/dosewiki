import { createHash } from "node:crypto";
import { readFileSync, statSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GET } from "../../src/app/open-data/SubstanceIndex.json/route";
import { getMoleculePackDownloadStats } from "./downloadStats";
import { getOpenDataDownloadStats } from "../../src/lib/openDataDownloadStats";

const documents = [
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
  { _id: "cx4", _creationTime: 4, id: 2, title: "Draft", slug: "draft", priority: "low" },
];

const corpus = vi.hoisted(() => ({
  substances: vi.fn(),
  effects: vi.fn(),
  reports: vi.fn(),
}));

vi.mock("../data/publicData", () => ({
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

    const response = await GET();
    const stats = getOpenDataDownloadStats(response.headers);
    const served = gunzipSync(Buffer.from(await response.arrayBuffer()));

    // Two published articles; the low-priority draft is not in the file.
    expect(stats?.count).toBe(2);
    expect(stats?.count).toBe(JSON.parse(served.toString("utf8")).count);
    // Size is the saved file (browsers decode the gzip transparently), not the transfer.
    expect(stats?.bytes).toBe(served.byteLength);
    expect(stats?.revision).toBe(createHash("sha256").update(served).digest("hex"));
  });

  it("omits captions when the artifact lacks revision-matched metadata", () => {
    expect(getOpenDataDownloadStats(new Headers())).toBeNull();
    expect(getOpenDataDownloadStats(new Headers({
      "X-Open-Data-Count": "2",
      "X-Open-Data-Bytes": "1024",
    }))).toBeNull();
  });

  it("rejects invalid byte measurements rather than displaying an estimate", () => {
    expect(getOpenDataDownloadStats(new Headers({
      "X-Open-Data-Count": "2",
      "X-Open-Data-Bytes": "-1",
      "X-Open-Data-Revision": "a".repeat(64),
    }))).toBeNull();
  });

  it("describes the committed molecule pack from its own manifest and zip", () => {
    const stats = getMoleculePackDownloadStats();

    expect(stats.bytes).toBe(statSync("public/dosewiki-molecules.zip").size);
    expect(stats.count).toBe(JSON.parse(readFileSync("public/dosewiki-molecules.json", "utf8")).count);
  });
});
