#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFileSync, realpathSync, statSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const ARCHIVE_PATH = resolve(ROOT, "public/SubstanceIndex.json");

// Delete syntax ranges rather than serializing: all surviving bytes stay intact.
export function sanitizePublicSubstanceArchive(source) {
  const before = JSON.parse(source);
  assert(Array.isArray(before), "Public substance archive must be an array.");
  const tree = ts.parseJsonText("SubstanceIndex.json", source);
  assert.equal(tree.parseDiagnostics.length, 0, "Archive must be valid JSON syntax.");
  const array = tree.statements[0]?.expression;
  assert(array && ts.isArrayLiteralExpression(array), "Archive must contain a JSON array.");
  const cuts = [];
  for (const record of array.elements) {
    assert(ts.isObjectLiteralExpression(record), "Every archive record must be an object.");
    for (const [index, property] of record.properties.entries()) {
      if (property.name?.text !== "editorial_review") continue;
      const next = record.properties[index + 1];
      if (next) {
        const comma = source.indexOf(",", property.end);
        assert(comma >= property.end && comma < next.getStart(tree));
        cuts.push([property.pos, comma + 1]);
      } else if (index > 0) {
        const previous = record.properties[index - 1];
        const comma = source.indexOf(",", previous.end);
        assert(comma >= previous.end && comma < property.getStart(tree));
        cuts.push([comma, property.end]);
      } else {
        cuts.push([property.pos, property.end]);
      }
    }
  }
  const chunks = [];
  let cursor = 0;
  for (const [start, end] of cuts) {
    chunks.push(source.slice(cursor, start));
    cursor = end;
  }
  chunks.push(source.slice(cursor));
  const result = chunks.join("");
  const expected = before.map(({ editorial_review: _review, ...record }) => record);
  const after = JSON.parse(result);
  assert.deepEqual(after, expected, "Sanitation must preserve every other value.");
  assert.equal(JSON.stringify(after), JSON.stringify(expected), "Sanitation must preserve record and key order.");
  return { content: result, records: before.length, removed: cuts.length };
}

export function sanitizeArchiveFile(recoveryPath) {
  const source = readFileSync(ARCHIVE_PATH, "utf8");
  const result = sanitizePublicSubstanceArchive(source);
  if (result.removed === 0) return { records: result.records, removed: 0 };
  assert(recoveryPath, "Provide --recovery-copy <private-path> before changing the archive.");
  const recovery = resolve(recoveryPath);
  const parent = realpathSync(dirname(recovery));
  const fromRepo = relative(realpathSync(ROOT), parent);
  assert(fromRepo === ".." || fromRepo.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`) || isAbsolute(fromRepo), "Recovery copy must be outside the repository.");
  assert.equal(statSync(parent).mode & 0o077, 0, "Recovery directory must be private (mode 0700).");
  writeFileSync(recovery, source, { flag: "wx", mode: 0o600 });
  assert.equal(readFileSync(recovery, "utf8"), source, "Recovery copy must match the original bytes.");
  writeFileSync(ARCHIVE_PATH, result.content);
  return { records: result.records, removed: result.removed, recovery };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  if (args.includes("--help")) {
    console.log("Usage: node scripts/data/sanitize-public-substance-archive.mjs --recovery-copy <private-path>");
    console.log("Removes only editorial_review from the retained public archive. Requires an existing private directory outside the repository and never overwrites a recovery copy. No database reads or live export.");
  } else {
    const index = args.indexOf("--recovery-copy");
    console.log(JSON.stringify(sanitizeArchiveFile(index < 0 ? null : args[index + 1])));
  }
}
