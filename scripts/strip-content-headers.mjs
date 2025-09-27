#!/usr/bin/env node
/**
 * Removes markdown heading wrappers from article `content` fields when
 * the body copy matches `drug_info.notes` (or the heading is otherwise empty).
 *
 * Usage: node scripts/strip-content-headers.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const articlesPath = join(__dirname, "../src/data/articles.json");

const raw = readFileSync(articlesPath, "utf8");
const articles = JSON.parse(raw);

function extractBody(value = "") {
  let remaining = value.trimStart();

  if (remaining.startsWith("#")) {
    const firstBreak = remaining.indexOf("\n");
    if (firstBreak >= 0) {
      remaining = remaining.slice(firstBreak + 1);
    } else {
      const secondHeading = remaining.indexOf("##");
      if (secondHeading >= 0) {
        remaining = remaining.slice(secondHeading);
      } else {
        return "";
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

let updated = 0;
let headerOnly = 0;

for (const article of articles) {
  const content = article.content;
  const notes = article?.drug_info?.notes ?? "";

  if (typeof content !== "string" || !content.trim()) {
    continue;
  }

  const body = extractBody(content);
  const trimmedNotes = notes.trim();

  if (!trimmedNotes) {
    continue;
  }

  if (body && body === trimmedNotes) {
    article.content = trimmedNotes;
    updated += 1;
    continue;
  }

  if (!body && content.trimStart().startsWith("#")) {
    article.content = trimmedNotes;
    headerOnly += 1;
  }
}

writeFileSync(articlesPath, JSON.stringify(articles, null, 2) + "\n", "utf8");

console.log(
  JSON.stringify(
    {
      updated,
      headerOnly,
      total: articles.length,
    },
    null,
    2,
  ),
);
