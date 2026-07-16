import { afterEach, describe, expect, it, vi } from "vitest";
import { buildZodJitlessBootstrapScript } from "./zodBrowserPolicy";

type GlobalWithZodConfig = typeof globalThis & {
  __zod_globalConfig?: Record<string, unknown>;
};

const globalWithZodConfig = globalThis as GlobalWithZodConfig;
const originalConfig = globalWithZodConfig.__zod_globalConfig
  ? { ...globalWithZodConfig.__zod_globalConfig }
  : undefined;

afterEach(() => {
  if (originalConfig === undefined) {
    delete globalWithZodConfig.__zod_globalConfig;
  } else {
    globalWithZodConfig.__zod_globalConfig = { ...originalConfig };
  }
});

describe("Zod browser policy bootstrap", () => {
  it("enables jitless validation before application chunks execute", async () => {
    delete globalWithZodConfig.__zod_globalConfig;

    Function(buildZodJitlessBootstrapScript())();

    expect(globalWithZodConfig.__zod_globalConfig).toEqual({ jitless: true });

    const originalFunction = globalThis.Function;
    let probeAttempted = false;
    globalThis.Function = function blockedFunctionProbe(): never {
      probeAttempted = true;
      throw new Error("Zod attempted dynamic JavaScript execution");
    } as unknown as FunctionConstructor;

    try {
      vi.resetModules();
      const zodCore = await import("zod/v4/core");
      expect(zodCore.util.allowsEval.value).toBe(false);
      expect(probeAttempted).toBe(false);
    } finally {
      globalThis.Function = originalFunction;
    }
  });

  it("preserves configuration installed by another Zod bundle", () => {
    globalWithZodConfig.__zod_globalConfig = { customSetting: "keep" };

    Function(buildZodJitlessBootstrapScript())();

    expect(globalWithZodConfig.__zod_globalConfig).toEqual({
      customSetting: "keep",
      jitless: true,
    });
  });
});
