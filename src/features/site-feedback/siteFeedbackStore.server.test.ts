import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

vi.mock("convex/server", () => ({
  makeFunctionReference: (name: string) => ({ name }),
}));

import { ConvexSiteFeedbackStore } from "./siteFeedbackStore.server";

describe("ConvexSiteFeedbackStore", () => {
  it("names the signed-in actor on a triage transition and never on reads", async () => {
    const calls: Array<{ kind: "mutation" | "query"; name: string; args: Record<string, unknown> }> = [];
    const store = new ConvexSiteFeedbackStore({
      apiKey: "test-key",
      client: {
        mutation: vi.fn(async (reference: { name: string }, args: Record<string, unknown>) => {
          calls.push({ kind: "mutation", name: reference.name, args });
          return { id: "feedback-1", status: args.status };
        }),
        query: vi.fn(async (reference: { name: string }, args: Record<string, unknown>) => {
          calls.push({ kind: "query", name: reference.name, args });
          return reference.name === "siteFeedback:countByStatus" ? 3 : [];
        }),
      },
    });

    await store.count({ statuses: ["new"] });
    await expect(
      store.transition("feedback-1", {
        status: "resolved",
        reviewer: "admin@example.com",
        actorEmail: "admin@example.com",
        note: "Fixed.",
      }),
    ).resolves.toEqual({ id: "feedback-1", status: "resolved" });

    expect(calls).toEqual([
      { kind: "query", name: "siteFeedback:countByStatus", args: { apiKey: "test-key", statuses: ["new"] } },
      {
        kind: "mutation",
        name: "siteFeedback:transition",
        args: {
          apiKey: "test-key",
          actorEmail: "admin@example.com",
          id: "feedback-1",
          status: "resolved",
          reviewer: "admin@example.com",
          note: "Fixed.",
        },
      },
    ]);
  });
});
