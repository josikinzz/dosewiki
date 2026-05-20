import { describe, expect, it } from "vitest";

import {
  buildReagentLookupCandidates,
  normalizeProtestKitResponse,
  reagentDataToDisplayEntries,
  reagentDataToStaticRecords,
  validateProtestKitResponse,
} from "./reagentTesting";

const validPayload = {
  substance: {
    name: "MDMA",
    aliases: ["Ecstasy"],
  },
  reagents: [
    {
      reagent: "marq_desc",
      colors: [{ id: 24, name: "purple", simple: true, simpleColorId: 24 }],
      hint: "",
      isReacting: true,
    },
    {
      reagent: "meck_desc",
      colors: [],
      hint: "",
      isReacting: false,
    },
  ],
};

describe("reagentTesting adapter module", () => {
  it("builds normalized lookup candidates from common name, title, and aliases", () => {
    expect(
      buildReagentLookupCandidates({
        title: "3,4-Methylenedioxymethamphetamine",
        commonName: "MDMA",
        aliases: ["Ecstasy", "MDMA", "Molly!"],
      }),
    ).toEqual(["mdma", "34-methylenedioxymethamphetamine", "ecstasy", "molly"]);
  });

  it("validates expected ProtestKit payloads", () => {
    expect(validateProtestKitResponse(validPayload)).toEqual({
      ok: true,
      data: validPayload,
    });
  });

  it("rejects missing fields and malformed colors", () => {
    expect(validateProtestKitResponse({ substance: validPayload.substance })).toMatchObject({
      ok: false,
    });
    expect(
      validateProtestKitResponse({
        ...validPayload,
        reagents: [{ ...validPayload.reagents[0], colors: [{ id: "purple" }] }],
      }),
    ).toMatchObject({ ok: false });
  });

  it("normalizes known and unknown reagent keys into sorted display entries", () => {
    const validation = validateProtestKitResponse({
      ...validPayload,
      reagents: [
        {
          reagent: "zzzz_desc",
          colors: [{ id: 11, name: "yellow", simple: true, simpleColorId: 11 }],
          hint: "",
          isReacting: true,
        },
        ...validPayload.reagents,
      ],
    });

    expect(validation.ok).toBe(true);
    if (!validation.ok) return;

    const normalized = normalizeProtestKitResponse(validation.data);

    expect(reagentDataToDisplayEntries(normalized).map((entry) => [entry.reagent, entry.description])).toEqual([
      ["marquis", "purple"],
      ["zzzz", "yellow"],
      ["mecke", "No reaction"],
    ]);
  });

  it("converts normalized data into static article records", () => {
    const validation = validateProtestKitResponse(validPayload);
    expect(validation.ok).toBe(true);
    if (!validation.ok) return;

    expect(reagentDataToStaticRecords(normalizeProtestKitResponse(validation.data))).toEqual({
      marquis: "purple",
      mecke: "No reaction",
    });
  });
});
