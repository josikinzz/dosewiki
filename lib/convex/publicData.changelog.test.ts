import { beforeEach, describe, expect, it, vi } from "vitest";

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
