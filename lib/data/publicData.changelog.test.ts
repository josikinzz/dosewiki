import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type * as ChangeLogModule from "../../src/data/changelog/changeLog";
import type { PublicChangelogSummaryInput } from "../changelog/publicChangelogSummary";

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
vi.mock("next/cache", () => ({
  unstable_cache: <T extends (...args: never[]) => unknown>(fn: T) => fn,
}));

const mocks = vi.hoisted(() => ({
  queryData: vi.fn(),
}));

vi.mock("./serverClient", () => ({
  queryData: mocks.queryData,
}));

vi.mock("../../src/data/changelog/changeLog", async (importOriginal) => {
  const actual = await importOriginal<typeof ChangeLogModule>();
  return {
    ...actual,
    initialChangeLogEntries: [{
      id: "static-private-history",
      createdAt: "2025-01-01T00:00:00.000Z",
      commit: { sha: "", url: "", message: "Clarify duration (approved by reviewer@example.test)" },
      markdown: "- old duration\n+ corrected duration\nReviewed by reviewer@example.test",
      submittedBy: "STATIC_PRIVACY",
      articles: [{ id: 1, title: "LSD", slug: "lsd" }],
    }],
  };
});

const row = (overrides: Partial<PublicChangelogSummaryInput> = {}): PublicChangelogSummaryInput => ({
  entryId: "20260101-000000-abcdef00",
  createdAt: "2026-01-01T00:00:00.000Z",
  message: "Dev editor update",
  markdown: "+ small change",
  submittedBy: "TESTKEY",
  articles: [{ id: 1, title: "LSD", slug: "lsd" }],
  ...overrides,
});

describe("public history email privacy", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.queryData.mockReset();
  });

  const privateRow = () => row({
    message: "Clarify duration (proposed by writer@example.test, approved by reviewer@example.test)",
    markdown: "- old duration\n+ corrected duration\nReverted by reviewer@example.test",
    submittedBy: "writer@example.test",
  });

  it("sanitizes a live profile history even against an older Postgres deployment", async () => {
    mocks.queryData.mockResolvedValueOnce([privateRow()]);
    const { getPublicProfileHistory } = await import("./publicData.changelog");
    const entries = await getPublicProfileHistory({ key: "TESTKEY", aliases: [] });

    expect(entries.map((entry) => entry.id)).toEqual([row().entryId]);
    expect(JSON.stringify(entries)).not.toContain("@example.test");
    expect(entries[0]).not.toHaveProperty("markdown");
    expect(entries[0].submittedBy).toBe("TESTKEY");
  });

  it("sanitizes the static profile backfill as well as live rows", async () => {
    mocks.queryData.mockResolvedValueOnce([]);
    const { getPublicProfileHistory } = await import("./publicData.changelog");
    const entries = await getPublicProfileHistory({ key: "STATIC_PRIVACY", aliases: [] });

    expect(entries.map((entry) => entry.id)).toEqual(["static-private-history"]);
    expect(JSON.stringify(entries)).not.toContain("@example.test");
    expect(entries[0]).not.toHaveProperty("markdown");
  });

  it("redacts the expanded diff and rejects a mismatched article scope", async () => {
    mocks.queryData.mockResolvedValue(privateRow());
    const { getPublicHistoryDiff } = await import("./publicData.changelog");
    const diff = await getPublicHistoryDiff(row().entryId, "lsd");
    expect(diff).toContain("- old duration\n+ corrected duration");
    expect(diff).not.toContain("@example.test");
    expect(await getPublicHistoryDiff(row().entryId, "ketamine")).toBeNull();
  });
});
