#!/usr/bin/env node
/**
 * Normalizes divergent `content` entries by removing heading lines
 * and prepending their body text to the corresponding `drug_info.notes`.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const articlesPath = join(__dirname, "../src/data/articles.json");

const articles = JSON.parse(readFileSync(articlesPath, "utf8"));

function stripHeadings(value = "") {
  let remaining = value.trimStart();

  if (remaining.startsWith("#")) {
    const firstBreak = remaining.indexOf("\n");
    if (firstBreak >= 0) {
      remaining = remaining.slice(firstBreak + 1);
    } else {
      const doubleHash = remaining.indexOf("##");
      if (doubleHash >= 0) {
        remaining = remaining.slice(doubleHash);
      } else {
        return remaining.trim();
      }
    }
  }

  remaining = remaining.trimStart();

  if (remaining.startsWith("##")) {
    const secondBreak = remaining.indexOf("\n");
    if (secondBreak >= 0) {
      remaining = remaining.slice(secondBreak + 1);
    } else {
      const whitespaceRun = remaining.search(/\s{2,}/);
      if (whitespaceRun >= 0) {
        remaining = remaining.slice(whitespaceRun);
      } else {
        return "";
      }
    }
  }

  return remaining.trim();
}

let updatedCount = 0;

articles.forEach((article) => {
  const rawContent = (article.content ?? "").trim();
  const rawNotes = (article?.drug_info?.notes ?? "").trim();

  if (!rawContent || !rawNotes || rawContent === rawNotes) {
    return;
  }

  const body = stripHeadings(article.content ?? "");

  if (!body) {
    return;
  }

  article.content = body;

  if (!rawNotes.startsWith(body)) {
    const separator = rawNotes.startsWith("\n") ? "" : "\n\n";
    article.drug_info.notes = `${body}${separator}${rawNotes}`;
  }

  updatedCount += 1;
});

writeFileSync(articlesPath, JSON.stringify(articles, null, 2) + "\n", "utf8");

console.log(
  JSON.stringify(
    {
      updated: updatedCount,
      total: articles.length,
    },
    null,
    2,
  ),
);
