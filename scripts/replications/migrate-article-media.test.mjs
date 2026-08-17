import { describe, expect, it } from "vitest";
import {
  buildCreditLine,
  isNamedCreator,
  mediaTypeFromContentType,
  normalizeArtist,
  parseAttribution,
} from "./article-media-evidence.mjs";
import { DECISIONS } from "./article-media-test-fixtures.mjs";

describe("normalizeArtist", () => {
  it("collapses every spelling of absence onto the corpus marker", () => {
    const options = { marker: "Unknown", aliases: DECISIONS.ownerRulings.unknownArtistAliases };
    expect(normalizeArtist("Anonymous", options)).toBe("Unknown");
    expect(normalizeArtist("anonymous 420chan user", options)).toBe("Unknown");
    expect(normalizeArtist("   ", options)).toBe("Unknown");
    expect(normalizeArtist(null, options)).toBe("Unknown");
    expect(normalizeArtist("Unknown", options)).toBe("Unknown");
  });

  it("leaves a real credit alone, trimmed", () => {
    expect(normalizeArtist("  Chelsea Morgan ")).toBe("Chelsea Morgan");
  });
});
describe("isNamedCreator", () => {
  it("reads the marker as nobody, matching hasKnownCreator", () => {
    expect(isNamedCreator("Unknown")).toBe(false);
    expect(isNamedCreator("unknown")).toBe(false);
    expect(isNamedCreator("Chelsea Morgan")).toBe(true);
  });
});
describe("buildCreditLine", () => {
  it("uses the table's two existing spellings", () => {
    expect(buildCreditLine("Grass", "Chelsea Morgan")).toBe("Grass by Chelsea Morgan");
    expect(buildCreditLine("Watch", "Unknown")).toBe("Watch (creator unknown)");
  });
});
describe("mediaTypeFromContentType", () => {
  it("stores an animated GIF as an image, like the six gif rows already do", () => {
    expect(mediaTypeFromContentType("image/gif")).toEqual({ type: "image", format: "gif" });
  });

  it("spells jpeg as jpg, the table's majority spelling", () => {
    expect(mediaTypeFromContentType("image/jpeg; charset=binary")).toEqual({
      type: "image",
      format: "jpg",
    });
  });

  it("returns null for a type it has no mapping for", () => {
    expect(mediaTypeFromContentType("application/pdf")).toBeNull();
    expect(mediaTypeFromContentType(undefined)).toBeNull();
  });
});
describe("parseAttribution", () => {
  it("splits a source URL and a rightsholder out of the prose", () => {
    expect(parseAttribution("https://example.test/a.jpg (rightsholder Luke Brown)")).toEqual({
      source_url: "https://example.test/a.jpg",
      rightsholder: "Luke Brown",
    });
  });

  it("asserts public domain only when the text says so", () => {
    expect(parseAttribution("John Tenniel, 1865 — public domain").rights_status).toBe("public-domain");
    expect(parseAttribution("Rightsholder somebody").rights_status).toBeUndefined();
  });

  it("keeps the leftover prose as a note", () => {
    const parsed = parseAttribution(
      "https://example.test/a.jpg (rightsholder H. R. Giger) — copyrighted fine art",
    );
    expect(parsed.permission_notes).toBe("copyrighted fine art");
  });

  it("returns nothing for an empty attribution", () => {
    expect(parseAttribution("")).toEqual({});
    expect(parseAttribution(null)).toEqual({});
  });
});
