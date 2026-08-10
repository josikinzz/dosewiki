import fs from "node:fs";
import { describe, expect, it } from "vitest";

import {
  buildTrackerHtml,
  DEFAULT_TRACKER_DATA,
  DEFAULT_TRACKER_HTML,
  extractTrackerRows,
  validateTrackerData,
  validateTrackerFiles,
} from "./build-citation-metadata-repair-tracker.mjs";

function trackedData() {
  return JSON.parse(fs.readFileSync(DEFAULT_TRACKER_DATA, "utf8"));
}

describe("citation metadata repair tracker generator", () => {
  it("validates exact tracked rows, article coverage, title-first previews, and embedded output", () => {
    expect(validateTrackerFiles()).toMatchObject({ valid: true, rows: 187, articles: 97 });
    const html = fs.readFileSync(DEFAULT_TRACKER_HTML, "utf8");
    expect(extractTrackerRows(html)).toEqual(trackedData().rows);
    expect(buildTrackerHtml({ data: trackedData(), currentHtml: html })).toBe(html);
    expect(html).toContain("const KEY='dosewiki-citation-repair-decisions-v1'");
  });

  it("fails closed on stale digests, duplicate keys, or non-title-first previews", () => {
    const stale = trackedData();
    stale.rows[0].rendered = "(2025) Wrong ordering";
    expect(() => validateTrackerData(stale)).toThrow(/digest mismatch/);

    const duplicate = trackedData();
    duplicate.datasetDigest = "0".repeat(64);
    duplicate.rows[1] = structuredClone(duplicate.rows[0]);
    expect(() => validateTrackerData(duplicate)).toThrow(/digest mismatch/);
  });
});
