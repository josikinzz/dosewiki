#!/usr/bin/env node
/**
 * Update Drug Users Bible citations with proper URLs
 * - 7 substances get their specific sample page URLs
 * - All others get the Internet Archive link
 *
 * Usage: node scripts/update-drugusersbible-urls.mjs --input <local-substance-export.json>
 */

import fs from "fs";
import path from "path";
const inputIndex = process.argv.indexOf("--input");
if (inputIndex < 0 || !process.argv[inputIndex + 1]) {
  throw new Error("Pass --input <path> naming the local substance export to update.");
}
const articlesPath = path.resolve(process.argv[inputIndex + 1]);
const articles = JSON.parse(fs.readFileSync(articlesPath, "utf-8"));

// Specific sample page URLs
const SAMPLE_PAGE_URLS = {
  "Amphetamine": "https://www.drugusersbible.com/2019/03/sample-page-amphetamine-speed.html",
  "Ayahuasca": "https://www.drugusersbible.com/2019/03/sample-page-ayahuasca.html",
  "BK-2C-B": "https://www.drugusersbible.com/2019/03/sample-page-bk-2c-b.html",
  "Changa": "https://www.drugusersbible.com/2019/03/sample-page-changa.html",
  "Ethylphenidate": "https://www.drugusersbible.com/2019/03/sample-page-ethylphenidate-eph.html",
  "MDA": "https://www.drugusersbible.com/2019/03/sample-page-mda.html",
  "White Sage": "https://www.drugusersbible.com/2019/03/sample-page-white-sage.html",
};

// Default URL for all other substances
const ARCHIVE_URL = "https://archive.org/details/the-drug-users-bible-harm-reduction-dominic-milton-trott";

let updatedCount = 0;
let samplePageCount = 0;

const modifiedArticles = articles.map(article => {
  if (!article.source_citations) return article;

  const updatedSourceCitations = article.source_citations.map(citation => {
    if (citation.name === "Drug Users Bible by Dominic Milton Trott") {
      updatedCount++;

      // Check if this substance has a sample page
      const sampleUrl = SAMPLE_PAGE_URLS[article.title];
      if (sampleUrl) {
        samplePageCount++;
        console.log(`  ${article.title}: Using sample page URL`);
        return { ...citation, url: sampleUrl };
      } else {
        return { ...citation, url: ARCHIVE_URL };
      }
    }
    return citation;
  });

  return { ...article, source_citations: updatedSourceCitations };
});

console.log("\n" + "=".repeat(50));
console.log("DRUG USERS BIBLE URL UPDATE");
console.log("=".repeat(50));
console.log(`\nTotal Drug Users Bible entries: ${updatedCount}`);
console.log(`With sample page URLs: ${samplePageCount}`);
console.log(`With Archive.org URL: ${updatedCount - samplePageCount}`);

fs.writeFileSync(articlesPath, JSON.stringify(modifiedArticles, null, 2) + "\n");
console.log(`\n✅ Changes written to ${articlesPath}`);
