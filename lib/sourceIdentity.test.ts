import { describe, expect, it } from "vitest";

import {
  canonicalizeSourceId,
  describeSource,
  describeSourceCoverage,
  getParser,
  resolveParserSource,
  resolveSourceIdentity,
  TRIPSIT_COMBOS_SOURCE_ID,
} from "../scripts/parsers/index";

describe("parser source identity contract", () => {
  it("canonicalizes aliases and case-normalized source ids", () => {
    expect(canonicalizeSourceId("TripSit")).toBe("tripsit-factsheets");
    expect(canonicalizeSourceId(" psychonaut-wiki ")).toBe("psychonautwiki");
    expect(canonicalizeSourceId("DEIS")).toBe("disregardeverythingisay");
    expect(canonicalizeSourceId("missing-source")).toBeUndefined();
  });

  it("describes canonical coverage metadata from the identity module", () => {
    expect(describeSourceCoverage("TripSit", "Legacy Name")).toEqual({
      sourceId: "tripsit-factsheets",
      displayName: "TripSit Factsheets",
    });
    expect(describeSourceCoverage("unknown-source", "Unknown Display")).toEqual({
      sourceId: "unknown-source",
      displayName: "Unknown Display",
    });
  });

  it("distinguishes parseable, known unsupported, unknown, and synthetic sources", () => {
    expect(resolveSourceIdentity("drugbank")).toMatchObject({
      kind: "parseable",
      descriptor: { id: "drugbank", displayName: "DrugBank" },
    });
    expect(resolveSourceIdentity("bluelight")).toMatchObject({
      kind: "unsupported",
      descriptor: { id: "bluelight", displayName: "Bluelight" },
    });
    expect(resolveSourceIdentity("not-a-real-source")).toEqual({
      kind: "unknown",
      requestedId: "not-a-real-source",
    });
    expect(describeSource(TRIPSIT_COMBOS_SOURCE_ID)).toMatchObject({
      id: TRIPSIT_COMBOS_SOURCE_ID,
      displayName: "TripSit Combination Guide",
      capability: "synthetic",
    });
  });

  it("resolves parser adapters only for parseable source identities", () => {
    expect(getParser("TripSit")?.sourceId).toBe("tripsit-factsheets");
    expect(resolveParserSource("TripSit")).toMatchObject({
      kind: "parseable",
      descriptor: { id: "tripsit-factsheets" },
      parser: expect.objectContaining({ sourceId: "tripsit-factsheets" }),
    });
    expect(resolveParserSource("bluelight")).toMatchObject({
      kind: "unsupported",
      parser: undefined,
    });
    expect(resolveParserSource(TRIPSIT_COMBOS_SOURCE_ID)).toMatchObject({
      kind: "synthetic",
      parser: undefined,
    });
  });
});
