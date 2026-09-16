import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));


vi.mock("@server/postgres/runtime/api", () => ({
  makeFunctionReference: (name: string) => ({ name }),
}));

import {
  DataArticleFeedbackStore,
} from "./articleFeedbackStore.server";

describe("DataArticleFeedbackStore", () => {
  it("names the signed-in actor on a triage transition and never on reads", async () => {
    const calls: Array<{ kind: "mutation" | "query"; name: string; args: Record<string, unknown> }> = [];
    const store = new DataArticleFeedbackStore({
      apiKey: "test-key",
      client: {
        mutation: vi.fn(async (reference: { name: string }, args: Record<string, unknown>) => {
          calls.push({ kind: "mutation", name: reference.name, args });
          return { id: "feedback-1", status: args.status };
        }),
        mutationAsService: vi.fn(),
        query: vi.fn(async (reference: { name: string }, args: Record<string, unknown>) => {
          calls.push({ kind: "query", name: reference.name, args });
          return reference.name === "articleFeedback:countByStatus" ? 3 : [];
        }),
      },
    });

    await store.count({ statuses: ["new"] });
    await expect(
      store.transition("feedback-1", {
        status: "resolved",
        reviewer: "admin@example.com",
        actorEmail: "admin@example.com",
      }),
    ).resolves.toEqual({ id: "feedback-1", status: "resolved" });

    expect(calls).toEqual([
      { kind: "query", name: "articleFeedback:countByStatus", args: { apiKey: "test-key", statuses: ["new"] } },
      {
        kind: "mutation",
        name: "articleFeedback:transition",
        args: {
          apiKey: "test-key",
          actorEmail: "admin@example.com",
          id: "feedback-1",
          status: "resolved",
          reviewer: "admin@example.com",
        },
      },
    ]);
  });

  it("uses the explicit server-service path for unauthenticated public intake", async () => {
    const mutation = vi.fn();
    const mutationAsService = vi.fn(
      async (_reference: { name: string }, args: Record<string, unknown>) => args.feedback,
    );
    const store = new DataArticleFeedbackStore({
      apiKey: "test-key",
      idFactory: () => "feedback-1",
      now: () => new Date("2026-09-04T12:00:00.000Z"),
      client: {
        mutation,
        mutationAsService,
        query: vi.fn(),
      },
    });

    await expect(
      store.create({
        substance_slug: "mescaline",
        substance_title: "Mescaline",
        category: "other",
        importance: "low",
        details: "Diagnostic feedback.",
      }),
    ).resolves.toMatchObject({ id: "feedback-1", status: "new" });

    expect(mutation).not.toHaveBeenCalled();
    expect(mutationAsService).toHaveBeenCalledWith(
      expect.objectContaining({ name: "articleFeedback:create" }),
      {
        apiKey: "test-key",
        feedback: expect.objectContaining({
          id: "feedback-1",
          details: "Diagnostic feedback.",
        }),
      },
    );
  });
});
