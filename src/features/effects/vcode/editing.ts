import { HASH_ATTRIBUTE_PATTERN, HASH_DIRECTIVE_ALIASES, normalizeVCodeContent, parseRawVCodeContent, VCODE_TAG_NAMES } from "./normalize";
import type { VCodeContent } from "./types";

const VOID_TAGS: Record<string, true> = { br: true, hr: true, ref: true, toc: true };

/** Editing is strict; the public reader remains tolerant of historic source. */
export function prepareVCode(raw: string, previous?: { raw?: string; ast?: unknown }): VCodeContent {
  if (raw.length > 400_000) throw new Error("VCode must be 400,000 characters or fewer.");
  if (previous?.raw === raw) return normalizeVCodeContent(previous.ast, raw) ?? "";
  const stack: string[] = [];
  for (const token of raw.matchAll(/\[(\/?)([a-z][\w-]*)([^\]]*)\]/gi)) {
    const [, closing, originalName, attributes] = token;
    const name = originalName.toLowerCase();
    if (!VCODE_TAG_NAMES.has(name)) {
      if (closing || attributes.trim().endsWith("/")) throw new Error(`Unknown VCode tag [${name}].`);
      continue; // Standalone bracketed prose is not markup.
    }
    if (closing) {
      if (stack.pop() !== name) throw new Error(`Unmatched closing VCode tag [/${name}].`);
    } else if (!VOID_TAGS[name] && !attributes.trim().endsWith("/")) {
      stack.push(name);
    }
    if (stack.length > 100) throw new Error("VCode nesting must not exceed 100 levels.");
    const remainder = attributes.replace(/\/?\s*$/, "").replace(/([\w-]+)\s*=\s*(?:"[^"]*"|'[^']*'|[^\s/"']+)/g, "");
    if (remainder.trim()) throw new Error(`Invalid attributes on [${name}].`);
  }
  if (stack.length) throw new Error(`Close the [${stack[stack.length - 1]}] VCode tag before publishing.`);
  // Hash directives use balanced braced bodies, including nested directives.
  for (const match of raw.matchAll(/##([a-z][\w-]*)/gi)) {
    const name = match[1].toLowerCase();
    if (!VCODE_TAG_NAMES.has(HASH_DIRECTIVE_ALIASES[name] ?? name)) throw new Error(`Unknown VCode directive ##${name}.`);
    let cursor = match.index! + match[0].length;
    while (raw[cursor] === "|") {
      const attribute = HASH_ATTRIBUTE_PATTERN.exec(raw.slice(cursor));
      if (!attribute) throw new Error(`Invalid attributes on ##${name}.`);
      if (attribute[4]?.startsWith("\"") || attribute[4]?.startsWith("'")) throw new Error(`Close the quoted attribute on ##${name}.`);
      cursor += attribute[0].length;
    }
    if (raw[cursor] !== "{") continue;
    let depth = 1;
    for (let index = cursor + 1; index < raw.length && depth; index++) {
      if (raw[index] === "\\") { index++; continue; }
      if (raw[index] === "{") depth++;
      if (depth > 100) throw new Error("VCode nesting must not exceed 100 levels.");
      if (raw[index] === "}") depth--;
    }
    if (depth) throw new Error("Close the VCode directive's braced body before publishing.");
  }
  const incomplete = raw.match(/\[(?:\/?)([a-z][\w-]*)(?:\s[^\]]*)?$/i);
  if (incomplete && VCODE_TAG_NAMES.has(incomplete[1].toLowerCase())) throw new Error("Finish the VCode tag before publishing.");
  return parseRawVCodeContent(raw);
}
