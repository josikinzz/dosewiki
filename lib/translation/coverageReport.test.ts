import { describe, expect, it } from "vitest";
import { combineTranslationCoverage, parseRenderedCoverageEvidence } from "./coverageReport";
import type { TranslationCoverageResponse } from "./translationCoverageTypes";
const coverage = { locale: "zh-Hans", generatedAt: 100, summary: { units: 3, current: 0, missing: 3 }, queue: { completed: 99 }, exclusions: ["Identifiers stay canonical"], publication: { status: "unverified" }, ui: { approvedSnapshotCurrent: false } } as TranslationCoverageResponse;
describe("combined translation coverage", () => {
    it("keeps missing content and unvisited routes visible despite a completed queue and passing sample", () => {
        const report = combineTranslationCoverage(coverage, { locale: "zh-Hans", checkedAt: new Date(100).toISOString(), expectedDigest: "abc", pages: [{ path: "/", url: "http://localhost:3100/", status: 200, observedDigest: "abc", checks: [{ id: "label", passed: true }] }] }, ["/", "/reports"], "abc");
        expect(report.source).toBe(coverage);
        expect(report.rendered.routes.map((r) => r.status)).toEqual(["verified", "unverified"]);
        expect(report.releaseReady).toBe(false);
    });
});
it("rejects mismatched locales and malformed observations and keeps stale artifacts failed", () => {
    expect(() => parseRenderedCoverageEvidence({})).toThrow();
    const evidence = { locale: "fr", checkedAt: new Date().toISOString(), expectedDigest: "old", pages: [] };
    expect(() => combineTranslationCoverage(coverage, evidence, [], "now")).toThrow("different locale");
    const report = combineTranslationCoverage(coverage, { ...evidence, locale: "zh-Hans", pages: [{ path: "/", url: "http://localhost:3100/", status: 200, observedDigest: "old", checks: [{ id: "label", passed: true }] }] }, ["/"], "now");
    expect(report.rendered.routes[0].status).toBe("failed");
});

it("refuses malformed observed targets before rendering imported evidence", () => {
 const report={locale:"zh-Hans",checkedAt:new Date().toISOString(),expectedDigest:"digest",pages:[{path:"/",url:{unexpected:true}}]};
 expect(()=>parseRenderedCoverageEvidence(report)).toThrow("URL");
 expect(()=>parseRenderedCoverageEvidence({...report,pages:[{path:"/",url:"javascript:alert(1)"}]})).toThrow("HTTP");
});
