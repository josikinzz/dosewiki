import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";

export const EM_DASH = "\u2014";
export const SCANNED_ROOTS = Object.freeze(["content", "src", "lib", "server", "docs", "README.md", "ARCHITECTURE.md", "CONTRIBUTING.md", "data/README.md"]);
const BINARY_FILE = /\.(?:png|jpe?g|gif|webp|avif|ico|svg|woff2?|ttf|otf|zip|gz|pdf|mp[34]|webm|wasm)$/i;
function occurrences(text, from = 0, to = text.length) {
  const offsets = [];
  for (let index = text.indexOf(EM_DASH, from); index !== -1 && index < to; index = text.indexOf(EM_DASH, index + 1)) {
    offsets.push(index);
  }
  return offsets;
}

function lineOf(text, offset) {
  let line = 1;
  for (let index = text.indexOf("\n"); index !== -1 && index < offset; index = text.indexOf("\n", index + 1)) line += 1;
  return line;
}

export function scanEmDashes(file, text) {
  return { violations: occurrences(text).map((offset) => ({ file, line: lineOf(text, offset) })) };
}

export function listScannedFiles(repoRoot) {
  return execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "--", ...SCANNED_ROOTS], {
    cwd: repoRoot,
    encoding: "utf8",
  })
    .split("\n")
    .filter((file) => file && !BINARY_FILE.test(file));
}

export function checkRepository(repoRoot) {
  const violations = [];
  for (const file of listScannedFiles(repoRoot)) {
    let text;
    try {
      text = readFileSync(path.join(repoRoot, file), "utf8");
    } catch {
      continue;
    }
    const scan = scanEmDashes(file, text);
    violations.push(...scan.violations);
  }
  return { violations };
}
