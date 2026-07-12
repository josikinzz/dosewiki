import { describe, expect, it, vi } from "vitest";

import {
  createProductionWriteCommand,
  executeProductionWrite,
} from "./production-write-command.mjs";

const TARGET = "https://glad-minnow-656.convex.cloud";

function createCommand(argv, env = {}) {
  return createProductionWriteCommand({
    operation: "migrate-pharmacology-schema",
    argv,
    env,
    loadsEnvLocal: false,
  });
}

describe("production write command boundary", () => {
  it("defaults to a harmless dry-run and never invokes the mutation", async () => {
    const mutation = vi.fn();
    const command = createCommand([], { TARGET_CONVEX_URL: TARGET });

    const result = await executeProductionWrite(command, mutation);

    expect(command.dryRun).toBe(true);
    expect(result).toEqual({ status: "dry-run", wrote: false });
    expect(mutation).not.toHaveBeenCalled();
  });

  it.each([
    {
      label: "write flag only",
      argv: ["--write"],
      message: /--confirm-write=migrate-pharmacology-schema/,
    },
    {
      label: "confirmation without a fingerprint",
      argv: ["--write", "--confirm-write=migrate-pharmacology-schema"],
      message: /--expected-deployment=glad-minnow-656/,
    },
    {
      label: "wrong operation phrase",
      argv: [
        "--write",
        "--confirm-write=some-other-operation",
        "--expected-deployment=glad-minnow-656",
      ],
      message: /--confirm-write=migrate-pharmacology-schema/,
    },
    {
      label: "wrong deployment fingerprint",
      argv: [
        "--write",
        "--confirm-write=migrate-pharmacology-schema",
        "--expected-deployment=enchanted-echidna-791",
      ],
      message: /does not match target deployment glad-minnow-656/,
    },
  ])("blocks $label before invoking the mutation", async ({ argv, message }) => {
    const mutation = vi.fn();
    const command = createCommand(argv, { TARGET_CONVEX_URL: TARGET });

    await expect(executeProductionWrite(command, mutation)).rejects.toThrow(message);
    expect(mutation).not.toHaveBeenCalled();
  });

  it("rejects browser-derived and compatibility write targets", async () => {
    const mutation = vi.fn();
    const command = createCommand(
      [
        "--write",
        "--confirm-write=migrate-pharmacology-schema",
        "--expected-deployment=enchanted-echidna-791",
      ],
      { VITE_CONVEX_URL: "https://enchanted-echidna-791.convex.cloud" },
    );

    await expect(executeProductionWrite(command, mutation)).rejects.toThrow(
      /TARGET_CONVEX_URL or --target-url/,
    );
    expect(mutation).not.toHaveBeenCalled();
  });

  it("allows the exact operation, target, and deployment ceremony", async () => {
    const mutation = vi.fn().mockResolvedValue({ updated: 3 });
    const command = createCommand(
      [
        "--write",
        "--confirm-write=migrate-pharmacology-schema",
        "--expected-deployment=glad-minnow-656",
      ],
      { TARGET_CONVEX_URL: TARGET },
    );

    await expect(executeProductionWrite(command, mutation)).resolves.toEqual({ updated: 3 });
    expect(mutation).toHaveBeenCalledOnce();
  });

  it("accepts an explicit CLI target and records only its public fingerprint", () => {
    const command = createCommand([
      "--target-url=https://glad-minnow-656.convex.cloud",
    ]);

    expect(command.targetUrl).toBe(TARGET);
    expect(command.targetSource).toBe("--target-url");
    expect(command.deploymentFingerprint).toBe("glad-minnow-656");
    expect(JSON.stringify(command)).not.toContain("CONVEX_ADMIN");
  });
});
