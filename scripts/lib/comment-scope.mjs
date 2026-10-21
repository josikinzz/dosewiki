import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { matchesGlob } from "node:path";

export const codeCommentFiles = ["**/*.{js,jsx,mjs,cjs,ts,tsx,mts,cts}"];
export const commentExclusions = [
  "vendor/**", "public/**", "**/*.generated.*", "**/*.generated/**",
  "lib/postgres/runtime/dataModel.ts", "lib/postgres/migrations/**", "next-env.d.ts",
];

export function generatedCommentPaths(repoRoot) {
  const lineage = JSON.parse(readFileSync(path.join(repoRoot, "data/lineage.json"), "utf8"));
  return lineage.artifacts.map(({ path: artifactPath }) => artifactPath);
}

export function commentScope(repoRoot, extension) {
  const exclusions = [...commentExclusions, ...generatedCommentPaths(repoRoot)];
  return (file) => extension.test(file) && !exclusions.some((pattern) => matchesGlob(file, pattern));
}

export function trackedCommentFiles(repoRoot, extension) {
  return execFileSync("git", ["ls-files", "-z"], { cwd: repoRoot, encoding: "utf8" })
    .split("\0")
    .filter(commentScope(repoRoot, extension));
}
