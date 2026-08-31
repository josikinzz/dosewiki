import { describe, expect, it } from "vitest";
import { normalizeIncomingReference } from "../../../convex/lib/articleReferenceWrites";

const validReference = {
  id: "doi-10-2147-sar-s36761",
  type: "journal_article" as const,
  title: "Antitussives and substance abuse",
  authors: ["Edward Boyer", "Jarrett Burns"],
  doi: "10.2147/sar.s36761",
  url: "https://doi.org/10.2147/sar.s36761",
  sourceType: "primary_literature" as const,
  quality: "high" as const,
};

describe("article reference writes", () => {
  it("rejects raw MediaWiki markup in public bibliographic fields", () => {
    expect(normalizeIncomingReference({
      ...validReference,
      title: '<ref name="pmid24648790" /> [[NMDA receptor]]',
    })).toEqual({
      ok: false,
      reason: "Source titles and citation text cannot contain raw MediaWiki or <ref> markup.",
    });

    expect(normalizeIncomingReference({
      ...validReference,
      apaText: "{{cite journal|title=Antitussives and substance abuse}}",
    })).toEqual({
      ok: false,
      reason: "Source titles and citation text cannot contain raw MediaWiki or <ref> markup.",
    });
  });
});
