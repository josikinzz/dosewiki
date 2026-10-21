import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";

const EM_DASH = "\u2014";
const SCANNED_ROOTS = Object.freeze(["content", "src", "lib", "server", "docs", "README.md", "ARCHITECTURE.md", "CONTRIBUTING.md", "data/README.md"]);
const BINARY_FILE = /\.(?:png|jpe?g|gif|webp|avif|ico|svg|woff2?|ttf|otf|zip|gz|pdf|mp[34]|webm|wasm)$/i;

function occurrences(text) {
  const offsets = [];
  for (let index = text.indexOf(EM_DASH); index !== -1; index = text.indexOf(EM_DASH, index + 1)) offsets.push(index);
  return offsets;
}

function lineOf(text, offset) {
  let line = 1;
  for (let index = text.indexOf("\n"); index !== -1 && index < offset; index = text.indexOf("\n", index + 1)) line += 1;
  return line;
}

export function isScannedFile(file) {
  return !BINARY_FILE.test(file) && SCANNED_ROOTS.some((root) => file === root || file.startsWith(`${root}/`));
}

export function listScannedFiles(repoRoot) {
  return execFileSync("git", ["ls-files", "-z", "--cached", "--others", "--exclude-standard", "--", ...SCANNED_ROOTS], {
    cwd: repoRoot,
    encoding: "utf8",
  })
    .split("\0")
    .filter((file) => file && isScannedFile(file));
}

export function findEmDashes(repoRoot, files) {
  const violations = [];
  for (const file of files) {
    let text;
    try {
      text = readFileSync(path.join(repoRoot, file), "utf8");
    } catch {
      continue;
    }
    for (const offset of occurrences(text)) violations.push({ file, line: lineOf(text, offset) });
  }
  return violations;
}
