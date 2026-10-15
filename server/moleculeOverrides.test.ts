import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("./lib/auth", () => ({ requireRole: vi.fn() }));
vi.mock("./lib/indexedMutation", () => ({ mutation: (definition: unknown) => definition }));

import { save } from "./moleculeOverrides";

type StoredDepiction = {
  _id: string;
  slug: string;
  svg: string;
  molblock: string;
  updatedAt: string;
  source: string;
};
type TestMutation = { handler: (ctx: unknown, args: Record<string, unknown>) => Promise<unknown> };
const invoke = (mutation: unknown, ctx: unknown, args: Record<string, unknown>) =>
  (mutation as TestMutation).handler(ctx, args);

function storage(updatedAt: string) {
  let row: StoredDepiction = {
    _id: "molecule",
    slug: "lsd",
    svg: '<svg id="old"/>',
    molblock: "MOL",
    updatedAt,
    source: "seeded",
  };
  return {
    current: () => row,
    ctx: {
      db: {
        query: () => ({ withIndex: () => ({ first: async () => row }) }),
        patch: async (_id: string, patch: Partial<StoredDepiction>) => { row = { ...row, ...patch }; },
      },
    },
  };
}

afterEach(() => vi.useRealTimers());

describe("editor save revision check", () => {
  it("writes nothing and reports the stored revision when the expected revision is stale", async () => {
    const state = storage("2026-09-07T12:00:00.000Z");
    const result = await invoke(save, state.ctx, {
      slug: "lsd",
      svg: '<svg id="new"/>',
      molblock: "NEW",
      expectedUpdatedAt: "2026-09-01T00:00:00.000Z",
    });
    expect(result).toEqual({
      status: "conflict",
      server: { updatedAt: "2026-09-07T12:00:00.000Z", updatedBy: null },
    });
    expect(state.current().molblock).toBe("MOL");
  });

  it("saves and returns the new revision when the expected revision matches", async () => {
    const state = storage("2026-09-07T12:00:00.000Z");
    const result = await invoke(save, state.ctx, {
      slug: "lsd",
      svg: '<svg id="new"/>',
      molblock: "NEW",
      expectedUpdatedAt: "2026-09-07T12:00:00.000Z",
    });
    expect(result).toMatchObject({ status: "ok", updatedAt: state.current().updatedAt });
    expect(state.current().molblock).toBe("NEW");
  });

  it("refuses a create-only save when a depiction already exists", async () => {
    const state = storage("2026-09-07T12:00:00.000Z");
    const result = await invoke(save, state.ctx, {
      slug: "lsd",
      svg: '<svg id="new"/>',
      molblock: "NEW",
      expectedUpdatedAt: null,
    });
    expect(result).toMatchObject({ status: "conflict" });
  });
});
