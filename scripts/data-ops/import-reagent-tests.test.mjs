import { describe, expect, it } from "vitest";
import {
  buildReagentTestImportPlan,
  isProtestKitResponse,
} from "./import-reagent-tests.mjs";

const response = {
  substance: { name: "MDMA", aliases: ["Ecstasy"] },
  reagents: [
    {
      reagent: "marq_desc",
      colors: [{ id: 24, name: "purple", simple: true, simpleColorId: 24 }],
      hint: "purple",
      isReacting: true,
    },
  ],
};

describe("reagent test import plan", () => {
  it("preserves matched and explicit no-match records in substance order", () => {
    const plan = buildReagentTestImportPlan({
      snapshot: { unknown: null, mdma: response },
      expectedSlugs: ["mdma", "unknown"],
      snapshotHash: "abc123",
    });

    expect(plan).toMatchObject({
      snapshotHash: "abc123",
      matched: 1,
      unmatched: 1,
      entries: [
        { slug: "mdma", data: response },
        { slug: "unknown", data: null },
      ],
    });
  });

  it("rejects missing, unexpected, or malformed records before writing", () => {
    expect(() =>
      buildReagentTestImportPlan({
        snapshot: { mdma: response },
        expectedSlugs: ["mdma", "lsd"],
        snapshotHash: "hash",
      }),
    ).toThrow("1 missing, 0 unexpected");

    expect(() =>
      buildReagentTestImportPlan({
        snapshot: { mdma: response, extra: null },
        expectedSlugs: ["mdma"],
        snapshotHash: "hash",
      }),
    ).toThrow("0 missing, 1 unexpected");

    expect(() =>
      buildReagentTestImportPlan({
        snapshot: { mdma: { substance: { name: "MDMA", aliases: [] } } },
        expectedSlugs: ["mdma"],
        snapshotHash: "hash",
      }),
    ).toThrow("Invalid reagent payloads: mdma");
  });

  it("validates the complete raw response shape", () => {
    expect(isProtestKitResponse(response)).toBe(true);
    expect(isProtestKitResponse({ ...response, reagents: [{ ...response.reagents[0], colors: [{}] }] })).toBe(false);
  });
});
