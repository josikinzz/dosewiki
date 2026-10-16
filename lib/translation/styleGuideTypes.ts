import type { ReviewHistoryEntry } from "./reviewTypes";

export const STYLE_GUIDE_SOURCE_ID = "style-guide";

export const STYLE_GUIDE_LIMITS = {
  rules: 40,
  ruleChars: 500,
  examples: 200,
  exampleChars: 2000,
  whyChars: 500,
} as const;

export type StyleExampleOrigin = { kind: "article"; slug: string; segment: string; revision: number };

export type StyleGuideExample = {
  id: string;
  source?: string;
  before: string;
  after: string;
  why: string;
  addedAt: number;
  origin?: StyleExampleOrigin;
};

export type StyleGuideDocument = { rules: string[]; examples: StyleGuideExample[] };

export type StyleGuide = StyleGuideDocument & { revision: string };

export type StyleGuidePacket = {
  locale: string;
  revision: number;
  draft: StyleGuideDocument | null;
  approved: StyleGuideDocument | null;
  approvedRevision: string;
  history?: ReviewHistoryEntry[];
};

export const EMPTY_STYLE_GUIDE: StyleGuideDocument = { rules: [], examples: [] };

export class StyleGuideFormatError extends Error {}

function text(value: unknown, label: string, max: number, required = true): string {
  if (value === undefined && !required) return "";
  if (typeof value !== "string") throw new StyleGuideFormatError(`${label} must be text.`);
  const trimmed = value.trim();
  if (required && !trimmed) throw new StyleGuideFormatError(`${label} is empty.`);
  if (trimmed.length > max) throw new StyleGuideFormatError(`${label} is longer than ${max} characters.`);
  return trimmed;
}

function origin(value: unknown): StyleExampleOrigin | undefined {
  if (value === undefined || value === null) return undefined;
  const raw = value as Record<string, unknown>;
  if (raw.kind !== "article" || typeof raw.slug !== "string" || typeof raw.segment !== "string" || !Number.isSafeInteger(raw.revision))
    throw new StyleGuideFormatError("An example origin names an article correction.");
  return { kind: "article", slug: raw.slug, segment: raw.segment, revision: Number(raw.revision) };
}

export function parseStyleGuideDocument(raw: unknown, stamp: (example: Omit<StyleGuideExample, "id" | "addedAt">) => { id: string; addedAt: number } = () => {
  throw new StyleGuideFormatError("Every example needs an id and a time.");
}): StyleGuideDocument {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new StyleGuideFormatError("A style guide has rules and examples.");
  const { rules = [], examples = [] } = raw as { rules?: unknown; examples?: unknown };
  if (!Array.isArray(rules) || !Array.isArray(examples)) throw new StyleGuideFormatError("A style guide has rules and examples.");
  const parsedRules = rules.map((rule, index) => text(rule, `Rule ${index + 1}`, STYLE_GUIDE_LIMITS.ruleChars, false)).filter(Boolean);
  if (parsedRules.length > STYLE_GUIDE_LIMITS.rules) throw new StyleGuideFormatError(`A style guide holds at most ${STYLE_GUIDE_LIMITS.rules} rules.`);
  if (examples.length > STYLE_GUIDE_LIMITS.examples) throw new StyleGuideFormatError(`A style guide holds at most ${STYLE_GUIDE_LIMITS.examples} examples.`);
  const ids = new Set<string>();
  const parsedExamples = examples.map((value, index): StyleGuideExample => {
    if (!value || typeof value !== "object") throw new StyleGuideFormatError(`Example ${index + 1} is malformed.`);
    const item = value as Record<string, unknown>;
    const label = `Example ${index + 1}`;
    const body = {
      source: text(item.source, `${label} English`, STYLE_GUIDE_LIMITS.exampleChars, false) || undefined,
      before: text(item.before, `${label} before`, STYLE_GUIDE_LIMITS.exampleChars),
      after: text(item.after, `${label} after`, STYLE_GUIDE_LIMITS.exampleChars),
      why: text(item.why, `${label} why`, STYLE_GUIDE_LIMITS.whyChars),
      origin: origin(item.origin),
    };
    if (body.before === body.after) throw new StyleGuideFormatError(`${label} does not change anything.`);
    const hasId = typeof item.id === "string" && item.id.trim().length > 0 && item.id.length <= 200;
    const hasTime = Number.isSafeInteger(item.addedAt) && Number(item.addedAt) >= 0;
    const stamped = hasId && hasTime ? { id: String(item.id).trim(), addedAt: Number(item.addedAt) } : stamp(body);
    const id = hasId ? String(item.id).trim() : stamped.id;
    if (ids.has(id)) throw new StyleGuideFormatError(`${label} repeats another example.`);
    ids.add(id);
    const example: StyleGuideExample = { id, before: body.before, after: body.after, why: body.why, addedAt: hasTime ? Number(item.addedAt) : stamped.addedAt };
    if (body.source) example.source = body.source;
    if (body.origin) example.origin = body.origin;
    return example;
  });
  return { rules: parsedRules, examples: parsedExamples };
}

export function readStyleGuideSnapshot(target: string | null | undefined): StyleGuideDocument | null {
  if (!target) return null;
  try {
    return parseStyleGuideDocument(JSON.parse(target));
  } catch {
    return null;
  }
}
