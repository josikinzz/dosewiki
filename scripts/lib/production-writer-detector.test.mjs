import { describe, expect, it } from "vitest";

import { detectProductionWriteSignals } from "./production-writer-detector.mjs";

describe("production writer detector", () => {
  it.each([
    ["arbitrary mutation receiver", "await db.mutation(api.items.save, payload)"],
    ["aliased client receiver", "const alias = client; await alias.mutation(fn, args)"],
    ["element-access mutation", "await transport['mutation'](fn, args)"],
    ["aliased mutation method", "const mutate = db.mutation; await mutate(fn, args)"],
  ])("detects %s", (_label, source) => {
    expect(detectProductionWriteSignals(source, "fixture.mjs").kinds).toContain(
      "data-mutation",
    );
  });

  it.each(["POST", "PUT", "PATCH", "DELETE"])("detects HTTP %s", (method) => {
    const source = `await request(url, { method: "${method}", body: payload })`;
    expect(detectProductionWriteSignals(source, "fixture.mjs").kinds).toContain(
      "http-write",
    );
  });

  it("detects constructed HTTP methods", () => {
    const source = `
      const prefix = "PA";
      const method = prefix + "TCH";
      await fetch(url, { method, body: payload });
    `;
    expect(detectProductionWriteSignals(source, "fixture.mjs").kinds).toContain(
      "http-write",
    );
  });

  it("does not classify read-only HTTP requests", () => {
    const source = `await fetch(url, { method: "GET" })`;
    expect(detectProductionWriteSignals(source, "fixture.mjs").kinds).toEqual([]);
  });
});
