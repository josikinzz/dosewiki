import { describe, expect, it } from "vitest";
import { parsePublicSubstanceLibraryInputRecords } from "../../../lib/data/publicData.substanceContract";
import { projectLibraryInput } from "../projections/substanceReadProjections";
import type { SubstanceArticle } from "@/schema";
import { minimalArticle } from "@/test/fixtures/articles";
import { buildLibrary } from "./libraryBuilder";
import { parseManualConfig } from "./manualIndexLoader";
import { buildSearchIndexFromLibrary } from "./search";
import { buildSearchManifestIndex, createSearchManifest } from "./searchManifest";

const emptyConfig = parseManualConfig({
  version: 1,
  categories: [{ key: "miscellaneous", label: "Miscellaneous", iconKey: "sparkles", drugs: [], sections: [] }],
});

const article = (name: string, casNumber: string): SubstanceArticle => ({
  ...structuredClone(minimalArticle),
  title: name,
  identification: {
    ...structuredClone(minimalArticle.identification),
    common_name: name,
    cas_number: casNumber,
  },
});

const searchSurfaces = (articles: SubstanceArticle[]) => {
  const publicArticles = parsePublicSubstanceLibraryInputRecords(articles.map(projectLibraryInput));
  const library = buildLibrary(publicArticles, {
    psychoactive: emptyConfig,
    chemical: emptyConfig,
    mechanism: emptyConfig,
  });
  const server = buildSearchIndexFromLibrary(library);
  const payload = createSearchManifest(server);
  const browser = buildSearchManifestIndex(JSON.parse(JSON.stringify(payload)));
  return { server, browser, payload };
};

describe("CAS substance lookup", () => {
  it("returns every eligible duplicate without exposing hidden or direct-URL-only records", () => {
    const casNumber = "52237-19-1";
    const hidden = { ...article("Hidden fixture", casNumber), index_categories: ["hidden"] };
    const low = { ...article("Low fixture", casNumber), priority: "low" as const };
    const hideForNow = { ...article("Hide for now fixture", casNumber), priority: "hide_for_now" as const };
    const { server, browser, payload } = searchSurfaces([
      article("Fluorophenibut", casNumber),
      article("F-Phenibut", casNumber),
      hidden,
      low,
      hideForNow,
    ]);

    expect(server.query(casNumber).map(({ slug }) => slug)).toEqual(["f-phenibut", "fluorophenibut"]);
    expect(browser.query(casNumber).map(({ slug }) => slug)).toEqual(["f-phenibut", "fluorophenibut"]);
    expect(browser.query(casNumber, { limit: 1 }).map(({ slug }) => slug)).toEqual(["f-phenibut"]);
    expect(payload.entries.filter(({ type }) => type === "substance").map(({ slug }) => slug))
      .toEqual(["fluorophenibut", "f-phenibut"]);
  });
});
