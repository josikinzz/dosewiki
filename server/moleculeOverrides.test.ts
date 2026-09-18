import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("./lib/auth", () => ({ requireRole: vi.fn() }));
vi.mock("./lib/indexedMutation", () => ({ mutation: (definition: unknown) => definition }));

import { applyTemplateDepiction, replicate, rerenderSvg, save } from "./moleculeOverrides";

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

describe("published molecule revision identity", () => {
  it.each([
    ["editor save", save, { molblock: "MOL" }],
    ["template application", applyTemplateDepiction, { molblock: "MOL" }],
    ["rerender", rerenderSvg, { expectedMolblock: "MOL" }],
  ] as const)("%s advances same-millisecond changes and preserves unchanged SVG revisions", async (_label, mutation, extra) => {
    const timestamp = "2026-09-07T12:34:56.789Z";
    vi.useFakeTimers();
    vi.setSystemTime(new Date(timestamp));
    const state = storage(timestamp);
    const args = { slug: "lsd", svg: '<svg id="new"/>', ...extra };
    await invoke(mutation, state.ctx, args);
    expect(state.current().svg).toBe(args.svg);
    expect(state.current().updatedAt).toBe("2026-09-07T12:34:56.790Z");
    vi.setSystemTime(new Date("2026-09-08T00:00:00.000Z"));
    await invoke(mutation, state.ctx, args);
    expect(state.current().updatedAt).toBe("2026-09-07T12:34:56.790Z");
  });

  it("replication advances past a reused or older revision without changing idempotent URLs", async () => {
    const timestamp = "2026-09-07T12:34:56.789Z";
    const state = storage(timestamp);
    const args = { slug: "lsd", svg: '<svg id="new"/>', molblock: "MOL", updatedAt: timestamp };
    await invoke(replicate, state.ctx, args);
    expect(state.current().updatedAt).toBe("2026-09-07T12:34:56.790Z");
    await invoke(replicate, state.ctx, args);
    expect(state.current().updatedAt).toBe("2026-09-07T12:34:56.790Z");
    await invoke(replicate, state.ctx, { ...args, svg: '<svg id="third"/>', updatedAt: "2026-01-01T00:00:00.000Z" });
    expect(state.current().svg).toBe('<svg id="third"/>');
    expect(state.current().updatedAt).toBe("2026-09-07T12:34:56.791Z");
  });
});
