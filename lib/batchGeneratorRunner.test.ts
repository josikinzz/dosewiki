import { describe, expect, it, vi } from "vitest";

import {
  printBatchBanner,
  printBatchSummary,
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
});
