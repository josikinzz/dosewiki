import { describe, expect, it, vi } from "vitest";

import {
  batchAndApplyMutations,
  createDataOpsRunContext,
} from "./data-ops-run-context.mjs";

describe("batchAndApplyMutations", () => {
  it("processes items in batches and aggregates results", async () => {
    const items = Array.from({ length: 75 }, (_, i) => ({ id: i, name: `item-${i}` }));

    const mockMutation = { name: "bulkImport" };
    const mockClient = {
      mutation: vi.fn()
        .mockResolvedValueOnce({ created: 50, updated: 0, errors: [] })
        .mockResolvedValueOnce({ created: 25, updated: 0, errors: [] }),
    };

    const onBatchResult = vi.fn();

    const result = await batchAndApplyMutations({
      items,
      batchSize: 50,
      mutation: mockMutation,
      client: mockClient,
      onBatchResult,
    });

    expect(result.totalCreated).toBe(75);
    expect(result.totalUpdated).toBe(0);
    expect(result.allErrors).toHaveLength(0);
    expect(result.failed).toBe(false);
    expect(result.dryRun).toBe(false);

    expect(mockClient.mutation).toHaveBeenCalledTimes(2);
    expect(onBatchResult).toHaveBeenCalledTimes(2);
  });

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
    expect(logger.log).toHaveBeenCalledWith(expect.stringContaining("[DRY RUN]"));
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

  it("uses transformBatch to customize mutation args", async () => {
    const items = [{ id: 1 }, { id: 2 }];
    const mockMutation = { name: "bulkImport" };
    const mockClient = {
      mutation: vi.fn().mockResolvedValue({ created: 2, updated: 0, errors: [] }),
    };

    const transformBatch = (batch, batchIndex) => ({
      reports: batch,
      batchNumber: batchIndex,
    });

    await batchAndApplyMutations({
      items,
      batchSize: 10,
      mutation: mockMutation,
      transformBatch,
      client: mockClient,
    });

    expect(mockClient.mutation).toHaveBeenCalledWith(mockMutation, {
      reports: items,
      batchNumber: 0,
    });
  });

  it("calls onBatchError when a batch fails", async () => {
    const items = [{ id: 1 }];
    const mockClient = {
      mutation: vi.fn().mockRejectedValue(new Error("Network error")),
    };

    const onBatchError = vi.fn();

    const result = await batchAndApplyMutations({
      items,
      batchSize: 10,
      mutation: {},
      client: mockClient,
      onBatchError,
    });

    expect(result.failed).toBe(true);
    expect(result.allErrors).toHaveLength(1);
    expect(result.allErrors[0]).toContain("Network error");
    expect(onBatchError).toHaveBeenCalledWith(
      expect.any(Error),
      0,
      items
    );
  });

  it("aggregates errors from mutation results", async () => {
    const items = [{ id: 1 }, { id: 2 }];
    const mockClient = {
      mutation: vi.fn().mockResolvedValue({
        created: 1,
        updated: 0,
        errors: ["Item 2 failed validation"],
      }),
    };

    const result = await batchAndApplyMutations({
      items,
      batchSize: 10,
      mutation: {},
      client: mockClient,
    });

    expect(result.totalCreated).toBe(1);
    expect(result.allErrors).toContain("Item 2 failed validation");
    expect(result.failed).toBe(true);
  });

  it("throws when required parameters are missing", async () => {
    await expect(batchAndApplyMutations({})).rejects.toThrow(/items array is required/);
    await expect(batchAndApplyMutations({ items: [] })).rejects.toThrow(/mutation is required/);
    await expect(batchAndApplyMutations({ items: [], mutation: {} })).rejects.toThrow(/client is required/);
  });
});
