import { beforeEach, describe, expect, it, vi } from "vitest";
import type * as ChangeLogModule from "../../src/data/changelog/changeLog";

// Dynamic imports deliberately reload the server module after resetModules so
// each case exercises a fresh request/cache boundary with its Convex fixture.

vi.mock("server-only", () => ({}));
vi.mock("react", () => ({
  cache: <T extends (...args: never[]) => unknown>(fn: T) => fn,
}));
vi.mock("next/cache", () => ({
  unstable_cache: <T extends (...args: never[]) => unknown>(fn: T) => fn,
}));

const mocks = vi.hoisted(() => ({
  queryConvex: vi.fn(),
}));

vi.mock("./serverClient", () => ({
  queryConvex: mocks.queryConvex,
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

const row = (overrides: Record<string, unknown> = {}) => ({
  entryId: "20260101-000000-abcdef00",
  createdAt: "2026-01-01T00:00:00.000Z",
  message: "Dev editor update",
  markdown: "+ small change",
  submittedBy: "TESTKEY",
  articles: [{ id: 1, title: "LSD", slug: "lsd" }],
  ...overrides,
});

describe("public profile history diff cap", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.queryConvex.mockReset();
  });

  it("keeps a diff under the cap byte-for-byte", async () => {
    mocks.queryConvex.mockResolvedValueOnce([row()]);

    const { getPublicProfileHistory } = await import("./publicData.changelog");
    const [entry] = await getPublicProfileHistory({ key: "TESTKEY", aliases: [] });

    expect(entry.markdown).toBe("+ small change");
  });

  it("cuts an oversized bulk-save diff at a line boundary and marks the cut", async () => {
    // ~200 KB of diff lines: the shape of a Dev-editor bulk save, whose stored
    // diffs (500 KB × 20 rows) once pushed one contributor's cached history to
    // 5.2 MB — past Next's 2 MB unstable_cache entry limit, so every ISR
    // render refetched from Convex.
    const huge = Array.from(
      { length: 2000 },
      (_, index) => `+ line ${index} ${"x".repeat(90)}`,
    ).join("\n");
    mocks.queryConvex.mockResolvedValueOnce([row({ markdown: huge })]);

    const { getPublicProfileHistory, PUBLIC_PROFILE_DIFF_CHAR_LIMIT } = await import(
      "./publicData.changelog"
    );
    const [entry] = await getPublicProfileHistory({ key: "TESTKEY", aliases: [] });

    // Bounded: the cap plus one marker line, never the raw 200 KB.
    expect(entry.markdown.length).toBeLessThanOrEqual(PUBLIC_PROFILE_DIFF_CHAR_LIMIT + 64);
    expect(entry.markdown).toMatch(/\n@@ diff truncated: \d+ more lines @@$/);

    // The kept text is a whole-line prefix of the original diff, so the viewer
    // never renders a line sheared mid-character.
    const kept = entry.markdown.slice(0, entry.markdown.lastIndexOf("\n"));
    expect(huge.startsWith(kept)).toBe(true);
    expect(huge[kept.length]).toBe("\n");

    // The marker accounts for every dropped line.
    const omitted = Number(/@@ diff truncated: (\d+) more lines @@$/.exec(entry.markdown)?.[1]);
    expect(kept.split("\n").length + omitted).toBe(2000);
  });
});

describe("public history email privacy", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.queryConvex.mockReset();
  });

  const privateRow = () => row({
    message: "Clarify duration (proposed by writer@example.test, approved by reviewer@example.test)",
    markdown: "- old duration\n+ corrected duration\nReverted by reviewer@example.test",
    submittedBy: "writer@example.test",
  });

  it("sanitizes a live profile history even against an older Convex deployment", async () => {
    mocks.queryConvex.mockResolvedValueOnce([privateRow()]);
    const { getPublicProfileHistory } = await import("./publicData.changelog");
    const entries = await getPublicProfileHistory({ key: "TESTKEY", aliases: [] });

    expect(entries.map((entry) => entry.id)).toEqual([row().entryId]);
    expect(JSON.stringify(entries)).not.toContain("@example.test");
    expect(entries[0].markdown).toContain("- old duration\n+ corrected duration");
    expect(entries[0].submittedBy).toBe("TESTKEY");
  });

  it("sanitizes the static profile backfill as well as live rows", async () => {
    mocks.queryConvex.mockResolvedValueOnce([]);
    const { getPublicProfileHistory } = await import("./publicData.changelog");
    const entries = await getPublicProfileHistory({ key: "STATIC_PRIVACY", aliases: [] });

    expect(entries.map((entry) => entry.id)).toEqual(["static-private-history"]);
    expect(JSON.stringify(entries)).not.toContain("@example.test");
    expect(entries[0].markdown).toContain("- old duration\n+ corrected duration");
  });

  it("keeps historical article and site-wide changes without leaking actor metadata", async () => {
    mocks.queryConvex.mockResolvedValue([privateRow()]);
    const { getPublicArticleHistory, getPublicRecentChanges } = await import("./publicData.changelog");
    const histories = [
      await getPublicArticleHistory("lsd", []),
      await getPublicRecentChanges([]),
    ];

    for (const entries of histories) {
      expect(entries.map((entry) => entry.id)).toEqual([row().entryId]);
      expect(JSON.stringify(entries)).not.toContain("@example.test");
      expect(entries[0].diff).toContain("- old duration\n+ corrected duration");
      expect(entries[0].detail).toContain("Clarify duration");
    }
  });

  it("uses a public profile name or a neutral label, never an unresolved login stamp", async () => {
    mocks.queryConvex.mockResolvedValue([row({ submittedBy: "PRIVATE_LOGIN" })]);
    const { getPublicRecentChanges } = await import("./publicData.changelog");
    const [unknown] = await getPublicRecentChanges([]);
    expect(unknown.contributor).toEqual({ name: "Contributor", href: null, avatarUrl: null });
    const [known] = await getPublicRecentChanges([
      { key: "PUBLIC_NAME", displayName: "Public Name", aliases: ["private_login"] },
    ]);
    expect(known.contributor).toEqual({
      name: "Public Name", href: "/contributors/public_name", avatarUrl: null,
    });
    const [unsafe] = await getPublicRecentChanges([
      { key: "PRIVATE_LOGIN", displayName: "writer@example.test", aliases: [] },
    ]);
    expect(unsafe.contributor).toEqual({ name: "Contributor", href: null, avatarUrl: null });
  });
});
