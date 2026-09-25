import { describe, expect, it, vi } from "vitest";

vi.mock("./auth", () => ({ requireRole: vi.fn() }));

import { bulkUpdateEditorialFieldsHandler } from "./replicationStudio";

type StoredRow = {
  _id: string;
  slug: string;
  title: string;
  artist: string;
  role?: "replication" | "figure";
  effect_slug?: string;
  credit_line?: string;
  effect_tags?: string[];
};

function storage(rows: StoredRow[]) {
  const byId = new Map(rows.map((row) => [row._id, { ...row }]));
  const patches: { id: string; patch: Partial<StoredRow> }[] = [];
  const ctx = {
    db: {
      get: async (id: string) => byId.get(id) ?? null,
      patch: async (id: string, patch: Partial<StoredRow>) => {
        patches.push({ id, patch });
        byId.set(id, { ...byId.get(id)!, ...patch });
      },
      query: () => ({
        withIndex: () => ({ first: async () => ({ slug: "geometry" }) }),
      }),
    },
  };
  return { ctx, patches, row: (id: string) => byId.get(id) };
}

const ROW_A: StoredRow = { _id: "a", slug: "work-a", title: "Work A", artist: "Ann" };
const ROW_B: StoredRow = { _id: "b", slug: "work-b", title: "Work B", artist: "Bo", role: "figure" };

function expectedOf(row: StoredRow) {
  return {
    title: row.title,
    artist: row.artist,
    role: row.role ?? "replication",
    effect_slug: row.effect_slug ?? null,
    credit_line: row.credit_line ?? null,
    effect_tags: row.effect_tags ?? [],
  };
}

const invoke = (ctx: unknown, args: Record<string, unknown>) =>
  bulkUpdateEditorialFieldsHandler(ctx as never, args as never);

describe("bulk replication edits", () => {
  it("writes the fresh items and reports a stale one as a conflict without writing it", async () => {
    const state = storage([ROW_A, { ...ROW_B, artist: "Renamed by a colleague" }]);

    const result = await invoke(state.ctx, {
      items: [
        { id: "a", expected: expectedOf(ROW_A) },
        { id: "b", expected: expectedOf(ROW_B) },
      ],
      artist: "New Artist",
    });

    expect(result).toMatchObject({
      updated: 1,
      slugs: ["work-a"],
      conflicts: [{ id: "b", slug: "work-b" }],
    });
    expect(state.row("a")?.artist).toBe("New Artist");
    expect(state.row("b")?.artist).toBe("Renamed by a colleague");
    expect(state.patches.map((entry) => entry.id)).toEqual(["a"]);
  });

  it("reports a row deleted since it was opened as a conflict", async () => {
    const state = storage([ROW_A]);

    const result = await invoke(state.ctx, {
      items: [
        { id: "a", expected: expectedOf(ROW_A) },
        { id: "gone", expected: expectedOf(ROW_B) },
      ],
      role: "figure",
    });

    expect(result).toMatchObject({ updated: 1, conflicts: [{ id: "gone", slug: null }] });
  });

  it("refuses an editorial change that names rows without their expected values", async () => {
    const state = storage([ROW_A]);

    await expect(invoke(state.ctx, { ids: ["a"], artist: "New Artist" })).rejects.toThrow(
      /expected/,
    );
    expect(state.patches).toEqual([]);
  });

  it("still lets the corpus-wide showcase toggle name rows by id alone", async () => {
    const state = storage([ROW_A]);

    const result = await invoke(state.ctx, { ids: ["a"], showcase_excluded: true });

    expect(result).toMatchObject({ updated: 1, conflicts: [] });
    expect(state.patches).toEqual([{ id: "a", patch: { showcase_excluded: true } }]);
  });
});
