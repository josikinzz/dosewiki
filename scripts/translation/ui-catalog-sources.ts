import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { Glob } from "bun";

import { DRUG_CLASS_CONTENT } from "../../src/data/drugClassContent";
import { PSYCHOACTIVE_SUMMARY_DEFINITIONS } from "../../src/features/psychoactive-summaries/summaryDefinitions";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

const CALL = /\b(?:t|msg)\(\s*(?:"((?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*)'|`((?:[^`\\$]|\\.)*)`)/g;

function unescape(literal: string): string {
  return literal.replace(/\\(.)/g, (_, ch: string) => (ch === "n" ? "\n" : ch));
}

export async function collectKeys(): Promise<Map<string, Set<string>>> {
  const keys = new Map<string, Set<string>>();
  const glob = new Glob("{src,lib}/**/*.{ts,tsx}");
  for await (const relative of glob.scan({ cwd: repoRoot })) {
    if (relative.startsWith("src/i18n/") || /\.(test|spec)\.tsx?$/.test(relative)) continue;
    const text = await readFile(path.join(repoRoot, relative), "utf8");
    for (const match of text.matchAll(CALL)) {
      const key = unescape(match[1] ?? match[2] ?? match[3] ?? "");
      if (!key.trim()) continue;
      let files = keys.get(key);
      if (!files) keys.set(key, (files = new Set()));
      files.add(relative);
    }
  }
  return keys;
}

export async function loadIndexLabelKeys(): Promise<Set<string>> {
  const out = new Set<string>();
  const file = path.join(repoRoot, "data/substances/psychoactiveIndexManual.json");
  if (!existsSync(file)) return out;
  const document = JSON.parse(await readFile(file, "utf8")) as {
    categories?: Array<{
      label?: string;
      definition?: string;
      warning?: string;
      sections?: Array<{ label?: string }>;
    }>;
  };
  for (const category of document.categories ?? []) {
    for (const text of [category.label, category.definition, category.warning]) {
      if (text?.trim()) out.add(text);
    }
    for (const section of category.sections ?? []) {
      if (section.label?.trim()) out.add(section.label);
    }
  }
  return out;
}

export async function loadChemicalClassKeys(): Promise<Set<string>> {
  const out = new Set<string>();
  const file = path.join(repoRoot, "data/substances/chemicalIndexManual.json");
  if (!existsSync(file)) return out;
  const document = JSON.parse(await readFile(file, "utf8")) as {
    classes?: Array<{ label?: string; aliases?: string[]; description?: string }>;
  };
  for (const chemicalClass of document.classes ?? []) {
    for (const text of [
      chemicalClass.label,
      ...(chemicalClass.aliases ?? []),
      chemicalClass.description,
    ]) {
      if (text?.trim()) out.add(text);
    }
  }
  return out;
}

export function loadDrugClassContentKeys(): Set<string> {
  const out = new Set<string>();
  for (const content of DRUG_CLASS_CONTENT) {
    for (const text of [content.title, content.applicableSubstances]) {
      if (text.trim()) out.add(text.trim());
    }
    for (const match of content.introHtml.matchAll(/<p>(.*?)<\/p>/gs)) {
      const paragraph = match[1]?.trim();
      if (paragraph) out.add(paragraph);
    }
    for (const section of content.sections ?? []) {
      for (const text of [section.title, section.description]) {
        if (text.trim()) out.add(text.trim());
      }
    }
  }
  return out;
}

export function loadPsychoactiveSummaryKeys(): Set<string> {
  const out = new Set<string>();
  const add = (text: string) => {
    if (text.trim()) out.add(text);
  };
  for (const definition of PSYCHOACTIVE_SUMMARY_DEFINITIONS) {
    add(definition.title);
    add(definition.metadataTitle);
    add(definition.metadataDescription);
    for (const paragraph of definition.intro) add(paragraph.html);
    for (const section of definition.sections) {
      add(section.title);
      add(section.definitionHtml);
    }
    for (const link of definition.seeAlso) add(link.label);
  }
  return out;
}

export async function loadSubstanceClassificationKeys(): Promise<Set<string>> {
  const out = new Set<string>();
  const file = path.join(repoRoot, "public/SubstanceIndex.json");
  if (!existsSync(file)) return out;
  const documents = JSON.parse(await readFile(file, "utf8")) as Array<{
    classification?: {
      chemical_class?: string[];
      psychoactive_class?: string[];
    };
  }>;
  for (const document of documents) {
    for (const label of [
      ...(document.classification?.psychoactive_class ?? []),
      ...(document.classification?.chemical_class ?? []),
    ]) {
      if (label.trim()) out.add(label.trim());
    }
  }
  return out;
}

export async function loadFieldLabelKeys(): Promise<Set<string>> {
  const { FIELD_PATHS } = await import("../../src/data/schema/fieldRegistry.generated");
  const out = new Set<string>();
  for (const fieldPath of FIELD_PATHS) {
    for (const segment of fieldPath.split(".")) {
      const bare = segment.replace(/\[\d*\]$/, "").replace(/_/g, " ");
      if (bare.length > 0) out.add(bare.charAt(0).toUpperCase() + bare.slice(1));
    }
  }
  return out;
}
