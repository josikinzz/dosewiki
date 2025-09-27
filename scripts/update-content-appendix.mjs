#!/usr/bin/env node
/**
 * Appends or refreshes the appendix in `notes and plans/content-vs-notes-audit.md`
 * with the raw `content` fields whose text differs from `drug_info.notes`.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const articlesPath = join(__dirname, "../src/data/articles.json");
const auditPath = join(__dirname, "../notes and plans/content-vs-notes-audit.md");

const articles = JSON.parse(readFileSync(articlesPath, "utf8"));

const divergentEntries = articles.filter((article) => {
  const content = (article.content ?? "").trim();
  const notes = (article?.drug_info?.notes ?? "").trim();
  return content.length > 0 && notes.length > 0 && content !== notes;
});

const appendixLines = ["## Appendix: Unique `content` Entries", ""];

divergentEntries.forEach((entry) => {
  appendixLines.push(`### ${entry.title ?? "Untitled"}`);
  appendixLines.push("");
  appendixLines.push("**Content (`content`)**");
  appendixLines.push("");
  appendixLines.push("```");
  appendixLines.push((entry.content ?? "").trim());
  appendixLines.push("```");
  appendixLines.push("");
  appendixLines.push("**Notes (`drug_info.notes`)**");
  appendixLines.push("");
  appendixLines.push("```");
  appendixLines.push((entry?.drug_info?.notes ?? "").trim());
  appendixLines.push("```");
  appendixLines.push("");
});

const appendixBlock = appendixLines.join("\n").trimEnd() + "\n";

const currentAudit = readFileSync(auditPath, "utf8");
const marker = "## Appendix: Unique `content` Entries";

let updatedAudit;

if (currentAudit.includes(marker)) {
  const prefix = currentAudit.slice(0, currentAudit.indexOf(marker)).trimEnd();
  updatedAudit = `${prefix}\n\n${appendixBlock}`;
} else {
  updatedAudit = `${currentAudit.trimEnd()}\n\n${appendixBlock}`;
}

writeFileSync(auditPath, updatedAudit + "\n", "utf8");

console.log(
  JSON.stringify(
    {
      divergentCount: divergentEntries.length,
      auditUpdated: true,
    },
    null,
    2,
  ),
);
