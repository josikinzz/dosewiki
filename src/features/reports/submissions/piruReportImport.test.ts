import { describe, expect, it } from "vitest";
import {
  MAX_PIRU_FRAGMENT_LENGTH,
  decodePiruReport,
  mapPiruRoa,
  normalizePiruTime,
  readPiruFragment,
} from "./piruReportImport";

function encode(payload: unknown): string {
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
}

const session = {
  v: 1,
  source: "piru",
  title: "Saturday at home",
  substances: [{ name: "MDMA", slug: "mdma", dose: "120 mg", roa: "oral" }],
  introduction: "Quiet evening with a friend.",
  timeline: {
    onset: [{ time: "T+0:30", description: "Warmth in the chest." }],
    peak: [{ time: "T+1:45", description: "Talkative, music felt close." }],
    offset: [],
  },
  conclusion: "Slept well.",
  tags: "entactogen, at home",
};

describe("readPiruFragment", () => {
  it("finds the piru value in a hash", () => {
    expect(readPiruFragment("#piru=abc")).toBe("abc");
    expect(readPiruFragment("#top&piru=abc==")).toBe("abc==");
    expect(readPiruFragment("#section")).toBeNull();
    expect(readPiruFragment("")).toBeNull();
  });
});

describe("decodePiruReport", () => {
  it("reads a v1 session report", () => {
    expect(decodePiruReport(encode(session))).toEqual({
      title: "Saturday at home",
      substances: [{ name: "MDMA", dose: "120 mg", roa: "oral" }],
      introduction: "Quiet evening with a friend.",
      timeline: {
        onset: [{ time: "T+00:30", description: "Warmth in the chest." }],
        peak: [
          { time: "T+01:45", description: "Talkative, music felt close." },
        ],
        offset: [],
      },
      conclusion: "Slept well.",
      tags: "entactogen, at home",
    });
  });

  it("keeps non-Latin text intact through base64url and UTF-8", () => {
    const report = decodePiruReport(
      encode({ v: 1, title: "周六 · déjà vu 🌙" }),
    );
    expect(report?.title).toBe("周六 · déjà vu 🌙");
  });

  it("accepts padded base64url", () => {
    const padded = Buffer.from(JSON.stringify({ v: 1, title: "x" }))
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_");
    expect(decodePiruReport(padded)?.title).toBe("x");
  });

  it("rejects an oversized fragment before decoding it", () => {
    expect(
      decodePiruReport("A".repeat(MAX_PIRU_FRAGMENT_LENGTH + 1)),
    ).toBeNull();
  });

  it("rejects malformed input of every kind", () => {
    expect(decodePiruReport("")).toBeNull();
    expect(decodePiruReport("not base64!")).toBeNull();
    expect(
      decodePiruReport(Buffer.from([0xff, 0xfe, 0xfd]).toString("base64url")),
    ).toBeNull();
    expect(
      decodePiruReport(Buffer.from("{not json").toString("base64url")),
    ).toBeNull();
    expect(decodePiruReport(encode([1, 2, 3]))).toBeNull();
    expect(decodePiruReport(encode({ title: "no version" }))).toBeNull();
    expect(decodePiruReport(encode({ v: 2, title: "future" }))).toBeNull();
  });

  it("treats markup as plain text and strips control characters", () => {
    const report = decodePiruReport(
      encode({
        v: 1,
        title: '<img src=x onerror="alert(1)">',
        introduction: "<script>alert(1)</script>\u0000line\r\nnext",
      }),
    );
    expect(report?.title).toBe('<img src=x onerror="alert(1)">');
    expect(report?.introduction).toBe("<script>alert(1)</script>line\nnext");
  });

  it("strips bidi overrides and invisible characters so text cannot be reordered", () => {
    const report = decodePiruReport(
      encode({
        v: 1,
        // A right-to-left override would display "MDMA 120 mg" as "gm 021 AMDM".
        title: "\u202EMDMA 120 mg\u202C",
        introduction:
          "a\u2066b\u2069c\u200Bd\uFEFFe\u200Ff\u0085g\u00ADh\u2028i",
        substances: [
          { name: "\u2067LSD\u2069", dose: "100\u2060 µg", roa: "\u202Doral" },
        ],
        conclusion: "family 👨\u200D👩\u200D👧 and می\u200Cخوام",
      }),
    );
    expect(report?.title).toBe("MDMA 120 mg");
    expect(report?.introduction).toBe("abcdefgh\ni");
    expect(report?.substances).toEqual([
      { name: "LSD", dose: "100 µg", roa: "oral" },
    ]);
    // Zero-width joiner and non-joiner are kept for emoji sequences and scripts that need them.
    expect(report?.conclusion).toBe(
      "family 👨\u200D👩\u200D👧 and می\u200Cخوام",
    );
  });

  it("ignores unknown and wrongly typed fields, including subject and consent keys", () => {
    const report = decodePiruReport(
      encode({
        v: 1,
        title: 42,
        substances: [{ name: "LSD", dose: 100 }, "MDMA", { dose: "no name" }],
        timeline: { onset: "soon" },
        publish_consent: true,
        age_confirmed: true,
        contact_email: "x@example.com",
        subject: { name: "Someone" },
      }),
    );
    expect(report).toEqual({
      title: "",
      substances: [{ name: "LSD", dose: "", roa: "" }],
      introduction: "",
      timeline: { onset: [], peak: [], offset: [] },
      conclusion: "",
      tags: "",
    });
  });

  it("caps string lengths and list sizes", () => {
    const report = decodePiruReport(
      encode({
        v: 1,
        title: "t".repeat(1_000),
        substances: Array.from({ length: 50 }, (_, index) => ({
          name: `S${index}`,
        })),
      }),
    );
    expect(report?.title).toHaveLength(200);
    expect(report?.substances).toHaveLength(20);
  });

  it("joins an array of tags with commas", () => {
    expect(
      decodePiruReport(encode({ v: 1, tags: ["euphoria", "empathy", 3] }))
        ?.tags,
    ).toBe("euphoria, empathy");
  });
});

describe("Piru field mapping", () => {
  it("maps Piru route names onto article route names", () => {
    expect(mapPiruRoa("Oral")).toBe("oral");
    expect(mapPiruRoa("insufflation")).toBe("insufflated");
    expect(mapPiruRoa("inhalation")).toBe("inhaled");
    expect(mapPiruRoa("subcutaneous")).toBe("subcutaneous");
    expect(mapPiruRoa("other")).toBe("");
    expect(mapPiruRoa("boofed")).toBe("boofed");
    expect(mapPiruRoa(7)).toBe("");
  });

  it("pads session-relative times to the form's T+HH:MM", () => {
    expect(normalizePiruTime("T+0:30")).toBe("T+00:30");
    expect(normalizePiruTime("T+12:05")).toBe("T+12:05");
    expect(normalizePiruTime("T-0:15")).toBe("T-00:15");
    expect(normalizePiruTime("after dinner")).toBe("after dinner");
    expect(normalizePiruTime("T+0:75")).toBe("T+0:75");
  });
});
