import { createHash } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { VCODE_TAG_NAMES } from "../../src/features/effects/vcode/normalize.ts";
import { isBlocking } from "./validate.mjs";

const stable = (value) => Array.isArray(value) ? value.map(stable)
  : value && typeof value === "object" ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, stable(item)])) : value;
/** Include all prompt inputs, approval snapshots and implementation identity. */
export function catalogCheckpointKey(input) {
  return createHash("sha256").update(JSON.stringify(stable(input))).digest("hex");
}
/** Markdown is deliberately false: it requires the validator's link-target gate. */
export function catalogUsesVCode(source) {
  return [...source.matchAll(/\[\/?([a-z][\w-]*)[^\]]*\]/gi)]
    .some((match) => VCODE_TAG_NAMES.has(match[1].toLowerCase()));
}
export async function readCatalogCheckpoint(filename) {
  try {
    const parsed = JSON.parse(await readFile(filename, "utf8"));
    if (parsed.schema !== 1 || !parsed.entries || typeof parsed.entries !== "object" || Array.isArray(parsed.entries)) return {};
    return Object.fromEntries(Object.entries(parsed.entries).filter(([key, value]) => /^[a-f0-9]{64}$/.test(key) && typeof value === "string"));
  } catch (error) {
    if (error.code === "ENOENT") return {};
    throw error;
  }
}
/** Atomic scratch checkpoint; never writes a published catalog. */
export async function writeCatalogCheckpoint(filename, entries) {
  await mkdir(path.dirname(filename), { recursive: true });
  const temporary = `${filename}.${process.pid}.tmp`;
  await writeFile(temporary, JSON.stringify({ schema: 1, entries }), { mode: 0o600 });
  await rename(temporary, filename);
}
/** Cached output is only a candidate and always passes today's structural gate. */
export function acceptedCheckpointTarget(entries, key, validate) {
  const target = entries[key];
  return typeof target === "string" && target.trim() && !isBlocking(validate(target).defects) ? target : null;
}
