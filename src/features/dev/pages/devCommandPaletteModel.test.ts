import { describe, expect, it } from "vitest";
import { matchPalette, paletteToolsFor, recordTerms, type PaletteRecord } from "./devCommandPaletteModel";

function record(tab: PaletteRecord["tab"], title: string, slug: string): PaletteRecord {
  return { key: `${tab}:${slug}`, tab, title, detail: slug, href: `/dev/${tab}/${slug}`, terms: recordTerms(title, slug) };
}

const RECORDS = [
  record("articles", "MDMA", "mdma"),
  record("articles", "MDA", "mda"),
  record("banners", "MDMA", "mdma"),
  record("writing", "About", "about"),
  record("people", "sam", "sam@example.com"),
];

describe("matchPalette", () => {
  it("lists every tool the role may open, and nothing above it", () => {
    const admin = paletteToolsFor("admin").map((tool) => tool.tab);
    const editor = paletteToolsFor("editor").map((tool) => tool.tab);
    expect(admin).toContain("people");
    expect(editor).not.toContain("people");
    expect(editor).not.toContain("banners");
    expect(paletteToolsFor(null)).toEqual([]);
  });

  it("finds the Glossary by the translation words a translator would type", () => {
    for (const query of ["translation", "translations", "i18n", "workbench"]) {
      const { tools } = matchPalette(query, paletteToolsFor("translator"), RECORDS);
      expect(tools.map((tool) => tool.tab), query).toContain("glossary");
    }
  });

  it("puts the named tool first", () => {
    const { tools } = matchPalette("people", paletteToolsFor("admin"), RECORDS);
    expect(tools[0].tab).toBe("people");
  });

  it("matches a tool by its keywords and route aliases", () => {
    // Members folded into People: its old name and route still find it.
    expect(matchPalette("members", paletteToolsFor("admin"), []).tools[0].tab).toBe("people");
    expect(matchPalette("warnings", paletteToolsFor("admin"), []).tools.map((tool) => tool.tab)).toEqual(["banners"]);
  });

  it("scopes the rest of the query to the tool the first word names", () => {
    const { records } = matchPalette("banners mdma", paletteToolsFor("admin"), RECORDS);
    expect(records.map((entry) => entry.key)).toEqual(["banners:mdma"]);
    expect(matchPalette("writing about", paletteToolsFor("admin"), RECORDS).records[0].key).toBe("writing:about");
  });

  it("searches every record when no tool is named, exact matches first", () => {
    const { records } = matchPalette("mda", paletteToolsFor("admin"), RECORDS);
    expect(records[0].key).toBe("articles:mda");
  });

  it("drops records whose tool the role cannot open", () => {
    const { records } = matchPalette("sam", paletteToolsFor("editor"), RECORDS);
    expect(records).toEqual([]);
  });
});
