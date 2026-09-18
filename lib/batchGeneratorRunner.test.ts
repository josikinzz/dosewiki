import { describe, expect, it, vi } from "vitest";

import {
  printBatchBanner,
  printBatchSummary,
  runBatchLifecycle,
  runBatchGenerator,
} from "../scripts/batch/lib/generator-runner.mjs";

describe("batch generator runner", () => {
  it("prints shared banner fields in a stable order", () => {
    const log = vi.fn();

    printBatchBanner({
      title: "Batch Example",
      config: {
        model: "anthropic/test-model",
        reasoningEffort: "high",
      },
      options: {
        concurrency: 4,
      },
      details: [{ label: "Mode", value: "Dry run" }],
      log,
    });

    expect(log.mock.calls.map(([line]) => line)).toEqual([
      "\nBatch Example",
      "=".repeat(50),
      "Model: anthropic/test-model",
      "Reasoning Effort: high",
      "Concurrency: 4",
      "Mode: Dry run",
    ]);
  });

  it("prints shared summary sections including artifacts and failures", () => {
    const log = vi.fn();

    printBatchSummary({
      results: {
        completed: 3,
        failed: 1,
        skipped: 2,
        totalPromptTokens: 1200,
        totalCompletionTokens: 450,
      },
      durationSeconds: 12.34,
      artifacts: [{ label: "Progress", path: "/tmp/progress.json" }],
      failedItems: [{ title: "LSD", error: "Bad YAML" }],
      log,
    });

    const output = log.mock.calls.map(([line]) => line).join("\n");
    expect(output).toContain("Results:");
    expect(output).toContain("Successful: 3");
    expect(output).toContain("Artifacts:");
    expect(output).toContain("Progress: /tmp/progress.json");
    expect(output).toContain("Failed articles:");
    expect(output).toContain("LSD: Bad YAML");
  });

  it("routes help and fatal handling through the shared wrapper", async () => {
    const printHelp = vi.fn();
    const execute = vi.fn();
    const handleFatal = vi.fn();
    const errorLog = vi.fn();
    const exit = vi.fn();

    await runBatchGenerator({
      parseOptions: () => ({ help: true }),
      printHelp,
      execute,
      exit,
    });

    expect(printHelp).toHaveBeenCalledOnce();
    expect(execute).not.toHaveBeenCalled();
    expect(exit).toHaveBeenCalledWith(0);

    await runBatchGenerator({
      parseOptions: () => ({ help: false }),
      printHelp,
      execute: async () => {
        throw new Error("boom");
      },
      handleFatal,
      errorLog,
      exit,
    });

    expect(handleFatal).toHaveBeenCalledOnce();
    expect(errorLog).toHaveBeenCalledWith("Fatal error:", expect.any(Error));
    expect(exit).toHaveBeenLastCalledWith(1);
  });

  it("runs lifecycle batches in stable concurrency windows and aggregates results", async () => {
    const order: string[] = [];
    const stdout = { write: vi.fn() };
    const progress = vi.fn();

    const results = await runBatchLifecycle({
      items: [
        { slug: "a", title: "A" },
        { slug: "b", title: "B" },
        { slug: "c", title: "C" },
      ],
      options: { concurrency: 2 },
      processItem: async (item) => {
        order.push(item.slug);
        if (item.slug === "b") {
          return { slug: item.slug, title: item.title, status: "skipped", reason: "No source" };
        }
        return {
          slug: item.slug,
          title: item.title,
          status: "success",
          promptTokens: 10,
          completionTokens: 5,
        };
      },
      persistSuccessfulResult: vi.fn(),
      onBatchStart: ({ batchLabels }) => order.push(`batch:${batchLabels.join(",")}`),
      onProgress: progress,
      stdout,
      log: vi.fn(),
    });

    expect(order).toEqual(["batch:A,B", "a", "b", "batch:C", "c"]);
    expect(results).toMatchObject({
      completed: 2,
      skipped: 1,
      failed: 0,
      totalPromptTokens: 20,
      totalCompletionTokens: 10,
    });
    expect(stdout.write).toHaveBeenLastCalledWith("\rProgress: 3/3 (2 ok, 0 failed, 1 skipped)");
    expect(progress.mock.calls[progress.mock.calls.length - 1]?.[0]).toMatchObject({
      status: "completed",
      current: 3,
      total: 3,
    });
  });

  it("uses dry-run adapters without processing or persisting", async () => {
    const processItem = vi.fn();
    const persistSuccessfulResult = vi.fn();

    const results = await runBatchLifecycle({
      items: [{ slug: "lsd", title: "LSD" }],
      options: { concurrency: 1, dryRun: true },
      createDryRunResult: async () => ({ status: "dry-run" }),
      processItem,
      persistSuccessfulResult,
      stdout: { write: vi.fn() },
      log: vi.fn(),
    });

    expect(results.completed).toBe(1);
    expect(processItem).not.toHaveBeenCalled();
    expect(persistSuccessfulResult).not.toHaveBeenCalled();
  });

  it("normalizes failed and persist-failed items", async () => {
    const onResult = vi.fn();

    const results = await runBatchLifecycle({
      items: [
        { slug: "bad-process", title: "Bad Process" },
        { slug: "bad-persist", title: "Bad Persist" },
      ],
      options: { concurrency: 2 },
      processItem: async (item) => {
        if (item.slug === "bad-process") throw new Error("model failed");
        return { slug: item.slug, title: item.title, status: "success" };
      },
      persistSuccessfulResult: async (result) => {
        if (result.slug === "bad-persist") throw new Error("write failed");
      },
      onResult,
      stdout: { write: vi.fn() },
      log: vi.fn(),
      errorLog: vi.fn(),
    });

    expect(results).toMatchObject({
      completed: 0,
      failed: 2,
      skipped: 0,
      failedItems: [
        { slug: "bad-process", title: "Bad Process", error: "model failed" },
        { slug: "bad-persist", title: "Bad Persist", error: "write failed" },
      ],
    });
    expect(onResult).toHaveBeenCalledWith(
      expect.objectContaining({ slug: "bad-persist", status: "persist_failed" }),
      { persisted: false },
    );
  });

  it("writes fatal progress before rethrowing lifecycle errors", async () => {
    const onFatalProgress = vi.fn();
    const onProgress = vi.fn(() => {
      throw new Error("progress disk full");
    });

    await expect(
      runBatchLifecycle({
        items: [{ slug: "lsd", title: "LSD" }],
        options: { concurrency: 1 },
        processItem: vi.fn(),
        onProgress,
        onFatalProgress,
        stdout: { write: vi.fn() },
        log: vi.fn(),
      }),
    ).rejects.toThrow("progress disk full");

    expect(onFatalProgress).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "failed",
        fatalError: "progress disk full",
      }),
      expect.any(Error),
    );
  });
});
