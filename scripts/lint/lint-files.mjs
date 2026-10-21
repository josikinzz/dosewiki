#!/usr/bin/env node

import { execFile } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { commentScope } from "../lib/comment-scope.mjs";
import { isScannedFile } from "./em-dash-policy.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const files = process.argv
  .slice(2)
  .filter((arg) => arg !== "--")
  .map((file) => path.relative(repoRoot, path.resolve(file)));

const checks = [
  {
    name: "ESLint",
    command: [path.join(repoRoot, "node_modules", ".bin", "eslint"), "--no-warn-ignored", "--"],
    accepts: (file) => /\.(?:[cm]?[jt]s|[jt]sx)$/.test(file),
  },
  {
    name: "CSS comment check",
    command: [process.execPath, path.join(repoRoot, "scripts", "lint", "check-css-comments.mjs")],
    accepts: commentScope(repoRoot, /\.css$/),
  },
  {
    name: "Em dash check",
    command: [process.execPath, path.join(repoRoot, "scripts", "lint", "check-em-dashes.mjs")],
    accepts: isScannedFile,
  },
];

const run = promisify(execFile);
const results = await Promise.all(
  checks
    .map((check) => ({ ...check, selected: files.filter(check.accepts) }))
    .filter(({ selected }) => selected.length > 0)
    .map(({ name, command: [executable, ...args], selected }) =>
      run(executable, [...args, ...selected], { cwd: repoRoot, maxBuffer: 64 * 1024 * 1024 }).then(
        ({ stdout, stderr }) => ({ name, selected, ok: true, output: stdout + stderr }),
        (error) => ({ name, selected, ok: false, output: error.stdout + error.stderr || `${error.message}\n` }),
      ),
    ),
);

for (const { name, selected, ok, output } of results) {
  process.stdout.write(output);
  if (!ok) console.error(`${name} failed on ${selected.length} file(s).`);
}
if (results.some(({ ok }) => !ok)) process.exitCode = 1;
