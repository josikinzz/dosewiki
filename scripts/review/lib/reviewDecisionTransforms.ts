/**
 * Transforms a reviewed proposal from the REVIEW model into the STORAGE model.
 *
 * The substance-article review run emits patches in a shape convenient for
 * human reading, not for writing to Postgres:
 *
 *   review model                      storage model
 *   --------------------------------  ------------------------------------------
 *   "30-45 minutes"                   { min: 30, max: 45, unit: "minutes" }
 *   { paragraphs: [{ text,            "para one[cite:id]\n\npara two[cite:id]"
 *       source_ids: ["S1"] }] }
 *   source_ids: ["S1"]                references[].id, resolved + merged
 *   { target, assay, EC50, Emax }     { target, tag, affinity, efficacy }
 *   "pharmacology.bindingSites"       "pharmacology.binding_sites"
 *
 * Postgres does not validate article content: every content section is `v.any()`
 * (server/lib/contentSchemaValidators.ts:26-44). A misspelled path is therefore
 * written successfully and silently, producing an orphan key no renderer reads.
 * Every function here refuses rather than guesses, and callers must run
 * `validateArticle` before any write.
 */
import {
  substanceArticleSchema,
  type SubstanceArticle,
} from "../../../src/schema/substance/article";
import { referenceSchema, type Reference } from "../../../src/schema/substance/shared";
import { deterministicReferenceId } from "../../../src/lib/citations/referenceModel";
import { CITE_TOKEN_PATTERN } from "../../../src/lib/citations/citationTokens";
import { parseDurationRange } from "../../parsers/base/duration";

export type Range = { min: number | null; max: number | null; unit: string };


/** Thrown whenever a transform cannot proceed without guessing. */
export class RefusalError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RefusalError";
  }
}

/** Single throw site so every refusal carries the same type and prefix. */
function refuse(message: string): never {
  throw new RefusalError(message);
}

/* ------------------------------------------------------------------ paths - */

/**
 * Dead and misspelled path segments observed in the review data, mapped to the
 * one spelling the renderer actually reads. `receptor_profile` is asserted
 * absent from the field contract (src/schema/substanceContract.test.ts:64) and
 * `bindingSites` exists nowhere; both carry binding-site payloads in practice.
 * `mechanism_of_action` is legacy and writes through to binding_sites
 * (src/utils/data/tagRegistry.shared.ts:214).
 */
const SEGMENT_ALIASES: Record<string, string> = {
  bindingSites: "binding_sites",
  receptor_profile: "binding_sites",
  mechanism_of_action: "binding_sites",
  afterEffects: "after_effects",
  comeUp: "come_up",
  totalDuration: "total_duration",
  halfTolerance: "half_tolerance",
  baselineTolerance: "baseline_tolerance",
  crossTolerance: "cross_tolerance",
  halfLife: "half_life",
};

/** Legality and reference fields are genuinely camelCase; never rewrite these. */
const CAMEL_PRESERVE: Record<string, true> = {
  canonicalStatus: true,
  usStates: true,
  usStatesNote: true,
  citationNeeded: true,
  containerTitle: true,
  siteName: true,
};

/**
 * Canonicalizes a proposal path into dotted storage form.
 * Accepts JSON-pointer style (`/pharmacology/pharmacokinetics`) and dotted
 * style, and rewrites known-dead segments. Route lookups are NOT resolved here
 * because they require the live document - see `resolveRouteIndex`.
 */
export function normalizeFieldPath(rawPath: string): string {
  const trimmed = String(rawPath ?? "").trim();
  if (!trimmed) refuse("empty field path");
  if (trimmed.includes("|")) {
    refuse(`path names multiple targets and must be split first: ${trimmed}`);
  }
  const dotted = trimmed.replace(/^\/+/, "").replace(/\//g, ".");
  const segments: string[] = [];
  for (const segment of dotted.split(".")) {
    if (!segment) continue;
    if (CAMEL_PRESERVE[segment]) {
      segments.push(segment);
      continue;
    }
    const bracket = segment.match(/^([A-Za-z_][A-Za-z0-9_]*)\[(.+)\]$/);
    if (bracket) {
      segments.push(`${SEGMENT_ALIASES[bracket[1]] ?? bracket[1]}[${bracket[2]}]`);
      continue;
    }
    segments.push(SEGMENT_ALIASES[segment] ?? segment);
  }
  if (!segments.length) refuse(`path normalizes to nothing: ${trimmed}`);
  return segments.join(".");
}

/**
 * Resolves a route name to its array index. Dosage and duration are arrays of
 * route objects whose name is a VALUE (`routes[N].route`), so `duration.oral`
 * and `duration.routes[oral]` address nothing. Rendered tab order does not
 * match array order either (DosageDurationSection.tsx:44-49), so the match is
 * always on the name string.
 */
export function resolveRouteIndex(routes: unknown, routeName: string): number {
  if (!Array.isArray(routes)) refuse(`no routes array present for route "${routeName}"`);
  const wanted = routeName.trim().toLowerCase();
  const names = routes.map((route) =>
    typeof route === "object" && route !== null
      ? String(Reflect.get(route, "route") ?? "").trim().toLowerCase()
      : "",
  );
  const index = names.indexOf(wanted);
  if (index < 0) {
    refuse(`route "${routeName}" not found; available routes: ${names.join(", ") || "(none)"}`);
  }
  return index;
}

/* ----------------------------------------------------------------- ranges - */

/**
 * Parses a human range string into the stored triple. All three keys are always
 * present: emptiness is present-but-null, never an absent key
 * (src/schema/substance/dosageDurationPresence.ts:1-19).
 */
export function parseRangeText(text: string): Range {
  const raw = String(text ?? "").trim();
  if (!raw) refuse("empty range text");
  // The parser understands "30-45 minutes" and its dash variants but not a
  // trailing qualifier, so strip a parenthetical before parsing.
  const cleaned = raw.replace(/\s*\([^)]*\)\s*$/, "").trim();
  const parsed = parseDurationRange(cleaned);
  if (!parsed) refuse(`unparseable range text: ${JSON.stringify(raw)}`);
  const min = parsed.min ?? null;
  const max = parsed.max ?? null;
  if (min === null && max === null) refuse(`range has no bound: ${JSON.stringify(raw)}`);
  if (min !== null && max !== null && min > max) {
    refuse(`range is inverted: ${JSON.stringify(raw)}`);
  }
  return { min, max, unit: parsed.unit ?? "" };
}

/* ------------------------------------------------------------- references - */

export type ReviewSource = {
  id: string;
  bibliography?: string;
  url?: string;
  source_type?: string;
  doi?: string;
  pmid?: string;
};

const DOI_PATTERN = /\b10\.\d{4,9}\/[^\s"'<>,;)]+/i;
const PMID_PATTERN = /\bPMID:?\s*(\d{4,9})\b/i;
const PMC_URL_PATTERN = /pmc\.ncbi\.nlm\.nih\.gov\/articles\/PMC\d+/i;

/** Pulls a persistent identifier out of a review bibliography string. */
function identifiersFromBibliography(source: ReviewSource): {
  doi?: string;
  pmid?: string;
} {
  const haystack = `${source.bibliography ?? ""} ${source.url ?? ""}`;
  const found: { doi?: string; pmid?: string } = {};
  if (source.doi) {
    found.doi = source.doi;
  } else {
    const doi = haystack.match(DOI_PATTERN);
    if (doi) found.doi = doi[0].replace(/[.,;]+$/, "");
  }
  if (source.pmid) {
    found.pmid = source.pmid;
  } else {
    const pmid = haystack.match(PMID_PATTERN);
    if (pmid) found.pmid = pmid[1];
  }
  return found;
}

/**
 * Picks the title out of a review bibliography entry, skipping the leading
 * author list. Author lists are short, comma-heavy, and end in initials or
 * "et al.", so the first long segment that looks unlike one is the title.
 */
function titleFromBibliography(bibliography: string): string {
  const parts = String(bibliography ?? "")
    .split(/(?<=\.)\s+/)
    .map((part) => part.trim())
    .filter(Boolean);
  const candidate = parts.find(
    (part) => part.length > 24 && !/et al\.$/i.test(part) && !/^[A-Z][a-z]+ [A-Z]{1,3},/.test(part),
  );
  return (candidate ?? parts[0] ?? "").replace(/\.$/, "").trim();
}

/**
 * Maps every review-local source id (`S1`) onto a real `references[].id`,
 * reusing an existing reference when the identifier or URL already appears in
 * the article, and otherwise minting a deterministic id with the repository's
 * own builder.
 *
 * Existing entries are never rewritten or reordered - dropping or renaming one
 * silently renumbers the whole bibliography, which is derived from first
 * appearance in render order (src/lib/citations/referenceModel.ts:219-238).
 */
export function mergeReferences(
  existingReferences: Reference[] | undefined,
  sources: ReviewSource[],
  usedSourceIds: string[],
): { references: Reference[]; idMap: Map<string, string> } {
  const references = Array.isArray(existingReferences) ? [...existingReferences] : [];
  const idMap = new Map<string, string>();

  const idByDoi = new Map<string, string>();
  const idByPmid = new Map<string, string>();
  const idByUrl = new Map<string, string>();
  for (const reference of references) {
    if (reference.doi) idByDoi.set(reference.doi.toLowerCase(), reference.id);
    if (reference.pmid) idByPmid.set(String(reference.pmid), reference.id);
    if (reference.url) idByUrl.set(reference.url.replace(/\/+$/, ""), reference.id);
  }

  const wanted = new Set(usedSourceIds);
  for (const source of sources) {
    if (!wanted.has(source.id)) continue;
    const identifiers = identifiersFromBibliography(source);
    const url = source.url ?? "";
    const normalizedUrl = url.replace(/\/+$/, "");

    const reused =
      (identifiers.doi ? idByDoi.get(identifiers.doi.toLowerCase()) : undefined) ??
      (identifiers.pmid ? idByPmid.get(identifiers.pmid) : undefined) ??
      (normalizedUrl ? idByUrl.get(normalizedUrl) : undefined);
    if (reused) {
      idMap.set(source.id, reused);
      continue;
    }

    let siteName = "";
    if (url) {
      try {
        siteName = new URL(url).hostname.replace(/^www\./, "");
      } catch {
        siteName = "";
      }
    }
    const title = titleFromBibliography(source.bibliography ?? "") || url || source.id;
    const minted = deterministicReferenceId({
      doi: identifiers.doi ?? null,
      pmid: identifiers.pmid ?? null,
      isbn: null,
      url: url || null,
      siteName: siteName || null,
      title,
    });
    if (!minted) refuse(`could not mint a reference id for source ${source.id}`);

    // A collision can only mean the same work already carries this identifier,
    // because the identifier lookups above already ran. Reuse it.
    if (references.some((reference) => reference.id === minted)) {
      idMap.set(source.id, minted);
      continue;
    }

    const isJournal = Boolean(identifiers.doi || identifiers.pmid || PMC_URL_PATTERN.test(url));
    references.push(
      // Parsed, not cast: `sourceType` and `quality` carry schema defaults that
      // a hand-built literal would omit (src/schema/substance/shared.ts:81-82).
      referenceSchema.parse({
        id: minted,
        type: isJournal ? "journal_article" : "webpage",
        template: isJournal ? "cite_journal" : "cite_web",
        title,
        authors: [],
        ...(url ? { url } : {}),
        ...(identifiers.doi ? { doi: identifiers.doi } : {}),
        ...(identifiers.pmid ? { pmid: identifiers.pmid } : {}),
        ...(siteName ? { siteName, publisher: siteName } : {}),
      }),
    );
    idMap.set(source.id, minted);
  }

  for (const sourceId of wanted) {
    if (!idMap.has(sourceId)) {
      refuse(`source ${sourceId} is cited by the patch but absent from the record's sources[]`);
    }
  }
  return { references, idMap };
}

/* ------------------------------------------------------------------ prose - */

export type ReviewParagraph = { text: string; source_ids?: string[] };

/**
 * Renders review paragraphs into one stored prose string.
 *
 * Storage is plain text split on blank lines (PharmacologySection.tsx:199-203),
 * NOT Markdown, and citations are inline `[cite:<id>]` markers appended after
 * the sentence's terminal punctuation (src/lib/citations/citationTokens.ts:1).
 */
export function renderProse(paragraphs: ReviewParagraph[], idMap: Map<string, string>): string {
  if (!Array.isArray(paragraphs) || paragraphs.length === 0) refuse("no paragraphs to render");
  const rendered = paragraphs.map((paragraph, index) => {
    const text = String(paragraph?.text ?? "").trim();
    if (!text) refuse(`paragraph ${index} has no text`);
    CITE_TOKEN_PATTERN.lastIndex = 0;
    const alreadyMarked = CITE_TOKEN_PATTERN.test(text);
    CITE_TOKEN_PATTERN.lastIndex = 0;
    // Already-marked text keeps its markers rather than gaining duplicates, but
    // the review model sometimes embeds its OWN local ids ("S1") inline, so any
    // marker naming a review-local source is rewritten to the resolved id.
    if (alreadyMarked) {
      return text.replace(CITE_TOKEN_PATTERN, (match, id: string) => {
        const resolved = idMap.get(id);
        return resolved ? `[cite:${resolved}]` : match;
      });
    }
    const sourceIds = Array.isArray(paragraph.source_ids) ? paragraph.source_ids : [];
    const markers = sourceIds
      .map((sourceId) => {
        const resolved = idMap.get(sourceId);
        if (!resolved) refuse(`paragraph ${index} cites unmapped source ${sourceId}`);
        return `[cite:${resolved}]`;
      })
      .join("");
    return `${text}${markers}`;
  });
  return rendered.join("\n\n");
}

/* ---------------------------------------------------------- binding sites - */

export type StoredBindingSite = {
  target: string;
  tag?: string;
  affinity?: string;
  efficacy?: string;
};

/**
 * Collapses a review binding-site entry into the stored four-key shape
 * (src/schema/substance/pharmacology.ts:10-14). The review model spreads the
 * same information across `assay`, `EC50`, `Emax`, `functional_activity`, and
 * `interpretation`; storage has only `affinity` and `efficacy` free-text slots
 * plus a short `tag`, so extra measurements are joined rather than dropped.
 */
export function mapBindingSite(entry: Record<string, unknown>): StoredBindingSite {
  const text = (value: unknown): string => (value == null ? "" : String(value).trim());
  const target = text(entry.target ?? entry.site ?? entry.receptor);
  if (!target) refuse(`binding site entry has no target: ${JSON.stringify(entry)}`);

  // A `finding` is the review model's single free-text measurement slot. It
  // belongs in `affinity` when it reports a binding constant and in `efficacy`
  // otherwise, so the rendered row keeps the measurement in the right column.
  const finding = text(entry.finding);
  const findingIsAffinity = /\bK[id]\b/.test(finding);
  const affinityParts = [entry.affinity, entry.Ki, entry.ki, entry.Kd, entry.kd]
    .map(text)
    .concat(findingIsAffinity ? [finding] : [])
    .filter(Boolean);
  const efficacyParts = [
    text(entry.efficacy),
    text(entry.functional_activity),
    text(entry.functional_context),
    findingIsAffinity ? "" : finding,
    entry.EC50 || entry.ec50 ? `EC50 ${text(entry.EC50 ?? entry.ec50)}` : "",
    entry.Emax || entry.emax ? `Emax ${text(entry.Emax ?? entry.emax)}` : "",
    entry.assay ? `(${text(entry.assay)})` : "",
  ].filter(Boolean);

  const mapped: StoredBindingSite = { target };
  const tag = text(entry.tag ?? entry.interpretation ?? entry.role);
  if (tag) mapped.tag = tag;
  if (affinityParts.length) mapped.affinity = affinityParts.join("; ");
  if (efficacyParts.length) mapped.efficacy = efficacyParts.join("; ");
  if (!mapped.affinity && !mapped.efficacy) {
    refuse(`binding site "${target}" carries no affinity or efficacy measurement`);
  }
  return mapped;
}

/* ----------------------------------------------------------------- guards - */

/**
 * Unsigned on purpose. A leading `-?` made "30-45 minutes" tokenize as `30` and
 * `-45`, so the upper bound of every ASCII-hyphen range fell outside the allowed
 * set and any faithful value was refused. No measurement in dose, duration, or
 * receptor data is negative, so the sign is not needed.
 */
const NUMBER_PATTERN = /\d+(?:[.,]\d+)?/g;

function numbersIn(value: unknown): string[] {
  const raw = typeof value === "string" ? value : JSON.stringify(value ?? "");
  // Citation ids carry DOI and PMID digits that are identifiers, not
  // measurements, so they must not count as numbers on either side.
  const text = raw.replace(CITE_TOKEN_PATTERN, " ");
  const matches = text.match(NUMBER_PATTERN) ?? [];
  return matches.map((number) => number.replace(",", "."));
}

/**
 * Refuses any produced value containing a number absent from the reviewed
 * payload. This is the deterministic hallucination gate: a transform may
 * reword, join, or reorder evidence, but it may never introduce a measurement.
 */
export function assertNoInventedNumbers(produced: unknown, reviewedPayload: unknown): void {
  const allowed = new Set(numbersIn(reviewedPayload));
  const offenders = [...new Set(numbersIn(produced))].filter((number) => !allowed.has(number));
  if (offenders.length) {
    refuse(`produced value introduces unreviewed numbers: ${offenders.join(", ")}`);
  }
}

/** Collects every `[cite:id]` marker reachable from a value. */
function citationIdsIn(value: unknown): string[] {
  if (typeof value === "string") {
    return [...value.matchAll(CITE_TOKEN_PATTERN)].map((match) => match[1]);
  }
  if (Array.isArray(value)) return value.flatMap(citationIdsIn);
  if (typeof value === "object" && value !== null) {
    return Object.values(value).flatMap(citationIdsIn);
  }
  return [];
}

/** Refuses when prose cites an id with no matching `references[]` entry. */
export function assertCitationsResolve(article: unknown, where: string): void {
  const known = new Set<string>();
  const references = typeof article === "object" && article !== null
    ? Reflect.get(article, "references")
    : undefined;
  if (Array.isArray(references)) {
    for (const reference of references) {
      if (typeof reference !== "object" || reference === null) continue;
      const id = Reflect.get(reference, "id");
      if (typeof id === "string") known.add(id);
    }
  }
  const orphans = [...new Set(citationIdsIn(article))].filter((id) => !known.has(id));
  if (orphans.length) {
    refuse(`${where}: citation markers resolve to no reference: ${orphans.join(", ")}`);
  }
}

/**
 * Validates a whole article against the real Zod contract. Postgres accepts any
 * shape, so this is the only thing standing between a bad transform and silent
 * corruption.
 */
export function validateArticle(article: unknown, where: string): SubstanceArticle {
  const result = substanceArticleSchema.safeParse(article);
  if (!result.success) {
    const issues = result.error.issues
      .slice(0, 8)
      .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`)
      .join("; ");
    refuse(`${where}: article fails the substance contract -> ${issues}`);
  }
  return result.data;
}

/* -------------------------------------------------------- path read/write - */

function parseSegment(segment: string): { key: string; index?: number | string } {
  const bracket = segment.match(/^(.+?)\[(.+)\]$/);
  if (!bracket) return { key: segment };
  const inner = bracket[2];
  return { key: bracket[1], index: /^\d+$/.test(inner) ? Number(inner) : inner };
}

/** Reads a dotted/indexed storage path. Returns undefined for a missing leaf. */
export function getByPath(root: unknown, path: string): unknown {
  let cursor: unknown = root;
  for (const segment of path.split(".")) {
    if (typeof cursor !== "object" || cursor === null) return undefined;
    const { key, index } = parseSegment(segment);
    cursor = Reflect.get(cursor, key);
    if (index !== undefined) {
      if (typeof cursor !== "object" || cursor === null) return undefined;
      cursor = Reflect.get(cursor, String(index));
    }
  }
  return cursor;
}

/**
 * Writes a dotted/indexed storage path, refusing to create a missing container.
 * Auto-vivifying is how a misspelled path becomes an orphan key that no
 * renderer reads, so an absent parent is an error, not something to build.
 */
export function setByPath(root: unknown, path: string, value: unknown): void {
  const segments = path.split(".");
  let cursor: unknown = root;
  for (let position = 0; position < segments.length - 1; position += 1) {
    const { key, index } = parseSegment(segments[position]);
    if (typeof cursor !== "object" || cursor === null) {
      refuse(`path "${path}" cannot be written: "${key}" has no container`);
    }
    if (!(key in cursor)) {
      refuse(`path "${path}" cannot be written: "${key}" does not exist on the stored document`);
    }
    cursor = Reflect.get(cursor, key);
    if (index !== undefined) {
      if (typeof cursor !== "object" || cursor === null) {
        refuse(`path "${path}" cannot be written: "${key}" is empty`);
      }
      if (!(String(index) in cursor)) {
        refuse(`path "${path}" cannot be written: index [${index}] is absent`);
      }
      cursor = Reflect.get(cursor, String(index));
    }
  }
  const last = parseSegment(segments[segments.length - 1]);
  if (typeof cursor !== "object" || cursor === null) {
    refuse(`path "${path}" cannot be written: no container for the leaf`);
  }
  if (last.index === undefined) {
    Reflect.set(cursor, last.key, value);
    return;
  }
  const indexed = Reflect.get(cursor, last.key);
  if (typeof indexed !== "object" || indexed === null) {
    refuse(`path "${path}" cannot be written: "${last.key}" is empty`);
  }
  Reflect.set(indexed, String(last.index), value);
}

/* ------------------------------------------------------------- visibility - */

const HIDDEN_INDEX_CATEGORY = "hidden";

/**
 * Returns the visibility fields for the requested outcome.
 *
 * `hidden` adds the index category that removes the article from listings
 * entirely; `direct_url_only` only lowers priority, leaving the page reachable
 * by direct URL but unlisted. Hidden takes precedence over priority
 * (src/schema/substance/substanceVisibilityPolicy.ts:8, :39-41, :45-55).
 */
export function visibilityFields(
  article: { index_categories?: string[]; priority?: string | null },
  outcome: "hidden" | "direct_url_only",
): { index_categories: string[]; priority: string } {
  const categories = Array.isArray(article.index_categories) ? [...article.index_categories] : [];
  if (outcome === "hidden") {
    const alreadyHidden = categories.some(
      (category) => String(category).trim().toLowerCase() === HIDDEN_INDEX_CATEGORY,
    );
    if (!alreadyHidden) categories.push(HIDDEN_INDEX_CATEGORY);
  }
  return { index_categories: categories, priority: "hide_for_now" };
}
