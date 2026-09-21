import { describe, expect, it, vi } from "vitest";

import { createTranslationRequestPool } from "./requestPool";

describe("translation request pool", () => {
  it("never runs more than the configured maximum concurrently", async () => {
    const pool = createTranslationRequestPool(100);
    let active = 0;
    let peak = 0;
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });

    const work = Array.from({ length: 140 }, () => pool.run(async () => {
      active += 1;
      peak = Math.max(peak, active);
      await gate;
      active -= 1;
    }));

    await vi.waitFor(() => expect(peak).toBe(100));
    expect(pool.inFlight).toBe(100);
    expect(pool.pending).toBe(40);
    release();
    await Promise.all(work);
    expect(pool.inFlight).toBe(0);
    expect(peak).toBe(100);
  });

  it("refuses limits above the production ceiling", () => {
    expect(() => createTranslationRequestPool(101)).toThrow(/between 1 and 100/);
  });
});
