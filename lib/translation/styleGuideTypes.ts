/**
 * Browser-safe contracts for a locale's style guide: short rules its
 * translators write, and example corrections (before, after, why), most of
 * them promoted from Fluency corrections in the article reader. The guide is
 * one document per locale in the review tables under scope `style-guide`,
 * with Save draft, Approve, and Restore history like the glossary. Only the
 * approved document reaches prompts (scripts/translation/style-guide.mjs),
 * and its revision joins the prompt version digest.
 */
import type { ReviewHistoryEntry } from "./reviewTypes";

/** The review-table source id of a locale's single style guide document. */
export const STYLE_GUIDE_SOURCE_ID = "style-guide";

export const STYLE_GUIDE_LIMITS = {
  rules: 40,
  ruleChars: 500,
  examples: 200,
  exampleChars: 2000,
  whyChars: 500,
} as const;

/** Where a promoted example came from: one saved Fluency correction in narrative review history. */
export type StyleExampleOrigin = { kind: "article"; slug: string; segment: string; revision: number };

export type StyleGuideExample = {
  id: string;
  /** The English the corrected wording translates; example selection measures overlap on it. */
  source?: string;
  before: string;
  after: string;
  why: string;
  /** Milliseconds; ties on overlap go to the most recent. */
  addedAt: number;
  origin?: StyleExampleOrigin;
};

/** What the review snapshot stores, as JSON in its target. */
export type StyleGuideDocument = { rules: string[]; examples: StyleGuideExample[] };

/**
 * The approved guide a prompt reads. `revision` is a digest of the approved
 * document, empty when nothing is approved; a draft never changes it.
 */
export type StyleGuide = StyleGuideDocument & { revision: string };

export type StyleGuidePacket = {
  locale: string;
  /** The review entry revision a write must name. */
  revision: number;
  draft: StyleGuideDocument | null;
  approved: StyleGuideDocument | null;
  /** The approved guide's prompt revision; empty when none is approved. */
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

/**
 * A style guide document from a request body or a stored snapshot. Trims
 * every field, drops blank rules, and throws `StyleGuideFormatError` on
 * anything malformed or over the limits. An example without an id or time
 * gets them from `stamp`, so a new example can arrive without either.
 */
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

/** The document a stored snapshot holds; null when it is missing or unreadable. */
export function readStyleGuideSnapshot(target: string | null | undefined): StyleGuideDocument | null {
  if (!target) return null;
  try {
    return parseStyleGuideDocument(JSON.parse(target));
  } catch {
    return null;
  }
}
