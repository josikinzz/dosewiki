import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import postcss from "postcss";
import { trackedCommentFiles } from "../lib/comment-scope.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const fix = process.argv.includes("--fix");
let count = 0;
for (const file of trackedCommentFiles(repoRoot, /\.css$/)) {
  const filename = path.join(repoRoot, file);
  const text = readFileSync(filename, "utf8");
  const sheet = postcss.parse(text, { from: file });
  const edits = [];
  sheet.walkComments((comment) => {
    const body = (comment.raws.left ?? "") + comment.text;
    if (/^!|@license\b|@preserve\b|SPDX-License-Identifier:/.test(body)) return;
    count += 1;
    if (!fix) console.error(`${file}:${comment.source.start.line}: Remove this CSS comment.`);
    edits.push([comment.source.start.offset, comment.source.end.offset + 1]);
  });
  if (!fix || edits.length === 0) continue;
  let output = text;
  for (const [start, end] of edits.reverse()) {
    const removed = text.slice(start, end);
    output = output.slice(0, start) + (removed.includes("\n") ? "\n" : " ") + output.slice(end);
  }
  output = output.replace(/[\t ]+$/gm, "").replace(/\n{3,}/g, "\n\n").trimEnd() + "\n";
  writeFileSync(filename, output);
}
console.log(`${count} CSS comment(s) ${fix ? "removed" : "found"}.`);
if (count && !fix) process.exitCode = 1;
