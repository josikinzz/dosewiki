import { describe, expect, it, vi } from "vitest";

import {
  batchAndApplyMutations,
  createDataOpsRunContext,
} from "./data-ops-run-context.mjs";

describe("batchAndApplyMutations", () => {
  it("respects dry-run mode from run context", async () => {
    const items = [{ id: 1 }, { id: 2 }];
    const mockClient = { mutation: vi.fn() };
    const logger = { log: vi.fn() };

    const runContext = createDataOpsRunContext({
      operation: "test",
      intent: "test",
      argv: ["--dry-run"],
      loadsEnvLocal: false,
      env: { DATA_BACKEND: "postgres" },
    });

    const result = await batchAndApplyMutations({
      items,
      batchSize: 10,
      mutation: {},
      client: mockClient,
      runContext,
      logger,
    });

    expect(result.dryRun).toBe(true);
    expect(result.totalCreated).toBe(0);
    expect(mockClient.mutation).not.toHaveBeenCalled();
  });

  it("blocks writes when writeEnabled is false", async () => {
    const items = [{ id: 1 }];
    const mockClient = { mutation: vi.fn() };
    const logger = { log: vi.fn() };

    const runContext = createDataOpsRunContext({
      operation: "test",
      intent: "test",
      argv: [],
      loadsEnvLocal: false,
      env: { DATA_BACKEND: "postgres" },
      requiresExecute: true,
      executeFlag: "--execute",
    });

    const result = await batchAndApplyMutations({
      items,
      batchSize: 10,
      mutation: {},
      client: mockClient,
      runContext,
      logger,
    });

    expect(result.failed).toBe(true);
    expect(result.allErrors).toContain("Writes not enabled");
    expect(mockClient.mutation).not.toHaveBeenCalled();
  });

});
