#!/usr/bin/env node
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const packageCommands = Object.keys(JSON.parse(readFileSync(path.join(repoRoot, "package.json"), "utf8")).scripts);
const readme = readFileSync(path.join(repoRoot, "scripts", "README.md"), "utf8");
const section = readme.split(/^## /m).find((part) => part.startsWith("Command catalog\n"));

if (!section) {
  console.error("scripts/README.md has no \"## Command catalog\" section.");
  process.exit(1);
}

const rows = section.split("\n").filter((line) => line.startsWith("|") && !/^\|\s*-/.test(line)).slice(1);
const listed = rows.flatMap((row) => [...(row.split("|")[2] ?? "").matchAll(/`([^`]+)`/g)].map((match) => match[1]));
const counts = new Map();
for (const name of listed) counts.set(name, (counts.get(name) ?? 0) + 1);

const known = new Set(packageCommands);
const problems = [
  ...[...counts].filter(([, count]) => count > 1).map(([name, count]) => `${name} is listed ${count} times.`),
  ...[...counts.keys()].filter((name) => !known.has(name)).map((name) => `${name} is listed but package.json has no such script.`),
  ...packageCommands.filter((name) => !counts.has(name)).map((name) => `${name} is in package.json but missing from the catalog.`),
];

if (problems.length > 0) {
  for (const problem of problems) console.error(problem);
  console.error(`Command catalog: ${problems.length} problem(s). Update the "Command catalog" table in scripts/README.md.`);
  process.exit(1);
}

console.log(`Command catalog: all ${packageCommands.length} package commands listed once in scripts/README.md.`);
