import { describe, expect, it } from "vitest";

import { extractQuoteCorpusEntries } from "./formal-citations-quote-documents.mjs";

describe("formal citation quote documents", () => {
  it("extracts quote corpus entries behind the quote document seam", () => {
    const entries = extractQuoteCorpusEntries(`
# Example Quotes

## Source: TripSit Factsheet

---
Dosage evidence.

## Source: Drug User's Bible

Duration evidence.

## Source: Empty Source
`);

    expect(entries).toEqual([
      expect.objectContaining({
        sourceName: "TripSit Factsheet",
        sourceId: "tripsit-factsheets",
        content: "Dosage evidence.",
        provenance: { kind: "quote_corpus", sourceName: "TripSit Factsheet" },
      }),
      expect.objectContaining({
        sourceName: "Drug User's Bible",
        sourceId: "drugusersbible",
        content: "Duration evidence.",
      }),
    ]);
  });
});
