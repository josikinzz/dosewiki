import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { markRetranslationRequested } from "./glossary";
import { claimTranslationJobs, readTranslationCoverageRows, scopeStaleTranslations, translationQueueCoverage } from "./segmentStore";
const sql = vi.hoisted(() => vi.fn());
vi.mock("@server/postgres/runtime/backend", () => ({ getPostgresClient: () => ({ sql }) }));
beforeEach(() => { sql.mockReset(); vi.stubEnv("DATA_WRITES_FROZEN", "0"); });
afterEach(() => vi.unstubAllEnvs());

describe("coverage storage boundaries", () => {
  it("never blesses unrelated old prompt digests during a scoped replay", async () => {
    sql.mockResolvedValue([{ hash: "affected" }]);
    expect(await scopeStaleTranslations("zh-Hans", ["affected"], "new")).toEqual({ marked: 1, restamped: 0 });
    expect(sql).toHaveBeenCalledTimes(1);
    expect(sql.mock.calls[0][1]).toEqual(["zh-Hans", ["affected"], "stale"]);
    expect(sql.mock.calls[0][0]).toContain('"hash" = ANY($2::text[])');
  });
  it("bounds a request stamp to the glossary revision snapshot and never updates completion", async () => {
    sql.mockResolvedValue([{ term: "Replication" }]);
    await markRetranslationRequested("zh-Hans", ["Replication"], 123);
    expect(sql.mock.calls[0][0]).toContain('"reviewed_at" < $2');
    expect(sql.mock.calls[0][0]).not.toContain('"retranslated_at"');
    expect(sql.mock.calls[0][1]).toEqual(["zh-Hans", 123, ["Replication"]]);
  });
  it("preserves write freeze for scoped marks and request stamps", async () => {
    vi.stubEnv("DATA_WRITES_FROZEN", "1");
    await expect(scopeStaleTranslations("zh-Hans", ["x"], "v")).rejects.toThrow();
    await expect(markRetranslationRequested("zh-Hans", ["x"], 1)).rejects.toThrow();
    expect(sql).not.toHaveBeenCalled();
  });
  it("allows coverage reads while frozen and returns queue counts without deriving coverage", async () => {
    vi.stubEnv("DATA_WRITES_FROZEN", "1");
    sql.mockResolvedValue([{ queued: "2", running: "1", failed: "3", completed: "100", retrying: "1" }]);
    expect(await translationQueueCoverage("zh-Hans")).toEqual({ queued: 2, running: 1, failed: 3, completed: 100, retrying: 1 });
    expect(sql.mock.calls[0][1][0]).toBe("zh-Hans");
    expect(sql.mock.calls[0][0]).not.toContain("UPDATE");
    sql.mockReset();
    expect(await readTranslationCoverageRows("zh-Hans", [])).toEqual([]);
    expect(sql).not.toHaveBeenCalled();
  });
});


describe("translation queue request generations", () => {
  it("claims only the requested locale and queue lane", async () => {
    sql.mockResolvedValue([]);
    await claimTranslationJobs(3, "incremental", "zh-Hans");
    expect(sql.mock.calls[0][1].slice(2)).toEqual([5, 600_000, "incremental", "zh-Hans"]);
    expect(sql.mock.calls[0][0]).toContain('($6::text IS NULL OR "locale" = $6::text)');
  });
});
