import { describe, expect, it } from "vitest";
import { getFaviconForUrl } from "./sourceFavicons";

describe("source favicon lookup", () => {
  it("uses the PsychonautWiki favicon for historical archive URLs", () => {
    expect(getFaviconForUrl("https://psychonautwiki.rip/wiki/2C-B/")).toBe(
      "/favicons/psychonautwiki.png",
    );
  });

  it("covers further-reading URLs that are not source-page domains", () => {
    expect(getFaviconForUrl("https://doi.org/10.3389/fphar.2018.00206")).toBe("/favicons/doi-org.png");
    expect(getFaviconForUrl("Front Pharmacol. 2023;14:1120419. https://doi.org/10.3389/fphar.2023.1120419")).toBe("/favicons/doi-org.png");
    expect(getFaviconForUrl("Drug Test Anal. 2019;11(8):1122-1133. doi:10.1002/dta.2613")).toBe("/favicons/doi-org.png");
    expect(getFaviconForUrl("J Pharm Pharmacol 2009;61:877-82. PMID 19589229")).toBe("/favicons/pubmed.png");
    expect(getFaviconForUrl("PubMed ID 32871174 (Forensic Toxicol. 2020)")).toBe("/favicons/pubmed.png");
    expect(getFaviconForUrl("https://www.frontiersin.org/articles/10.3389/fphar.2018.00206/full")).toBe("/favicons/frontiersin-org.png");
    expect(getFaviconForUrl("https://knowdrugs.app/substances/2c-b/")).toBe("/favicons/knowdrugs-app.png");
    expect(getFaviconForUrl("https://substance.uvic.ca/files/resources/2C-B_onesheet.pdf")).toBe("/favicons/substance-uvic-ca.png");
  });

  it("prefers specific generated subdomain favicons before broader parent domains", () => {
    expect(getFaviconForUrl("https://assets.publishing.service.gov.uk/example.pdf")).toBe("/favicons/assets-publishing-service-gov-uk.png");
    expect(getFaviconForUrl("https://www.gov.uk/government/publications")).toBe("/favicons/gov-uk.png");
    expect(getFaviconForUrl("https://bpspubs.onlinelibrary.wiley.com/doi/full/10.1111/example")).toBe("/favicons/bpspubs-onlinelibrary-wiley-com.png");
    expect(getFaviconForUrl("https://onlinelibrary.wiley.com/doi/full/10.1002/example")).toBe("/favicons/onlinelibrary-wiley-com.png");
  });
});
