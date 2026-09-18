import { PostgresError } from "../../lib/postgres/runtime/values"
import type { Doc } from "../../lib/postgres/runtime/dataModel"
import type { SubstanceArticle } from "../../src/schema";
import { substanceArticleStorageSchema } from "../../src/schema/substance/contract";
import { dosageRouteSchema, dosageSchema } from "../../src/schema/substance/dosage";
import { durationRouteSchema, durationSchema } from "../../src/schema/substance/duration";
import { legalitySchema, usStateLegalitySchema } from "../../src/schema/substance/legality";
import { countryLegalitySchema, referenceSchema, type CountryLegality, type Reference } from "../../src/schema/substance/shared";
import { contentHash } from "../../lib/proposals/contentHash";
import { extractCitationTokens } from "../../lib/citations/citationPlacement.mjs";
import { haveCompatibleReferenceIdentity, referenceIdentitiesOverlap } from "../../lib/citations/referenceIdentity.mjs";
import { MAX_ARTICLE_REFERENCES, normalizeIncomingReference } from "./articleReferenceWrites";
import { isProjectionRecord as isRecord } from "../../src/data/projections/substanceProjectionCore";

export type ArticleDocument = Omit<Doc<"substanceIndex">, "_id" | "_creationTime">;
export function articleDocument(row: Doc<"substanceIndex">): ArticleDocument {
  const { _id: _id, _creationTime: _time, ...article } = row;
  return article;
}
function same(left: unknown, right: unknown): boolean {
  return left === right || contentHash({ value: left }) === contentHash({ value: right });
}
/** Publish only changed article units, never rewrite unrelated sections. */
export function articleChangePatch(before: ArticleDocument, after: ArticleDocument): Partial<ArticleDocument> {
  const patch: Partial<ArticleDocument> = {};
  for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
    if (!same(before[key], after[key])) patch[key] = after[key];
  }
  return patch;
}
export function articleConflict(message = "Published content changed. Your draft is preserved; reload and reconcile before trying again."): never {
  throw new PostgresError({ code: "ARTICLE_CONFLICT", message });
}
function invalid(path: string, message: string): never {
  throw new PostgresError({ code: "ARTICLE_INVALID", message: `${path}: ${message}`, path });
}
type FieldSchema = { safeParse: (value: unknown) => { success: boolean; data?: unknown; error?: { issues: { path: PropertyKey[]; message: string }[] } } };
function parseChanged(schema: FieldSchema, before: unknown, value: unknown, path: string): unknown {
  if (same(before, value)) return before;
  const parsed = schema.safeParse(value);
  if (!parsed.success) invalid(path, parsed.error!.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; "));
  const old = schema.safeParse(before);
  return old.success && same(old.data, parsed.data) ? before : parsed.data;
}
function changedRecord(before: unknown, value: unknown, schema: FieldSchema, path: string): Record<string, unknown> {
  if (!isRecord(value)) invalid(path, "Use keyed entries with stable identities.");
  const old = isRecord(before) ? before : {};
  const next: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (!key.trim()) invalid(path, "Entry identity is required.");
    next[key] = parseChanged(schema, old[key], entry, `${path}.${key}`);
  }
  return next;
}
function parseSection(key: string, before: unknown, value: unknown, schema: FieldSchema): unknown {
  if (same(before, value)) return before;
  if (key === "references" && Array.isArray(value)) {
    const old = Array.isArray(before) ? before : [];
    return value.map((reference, index) => parseChanged(referenceSchema, old.find((entry) => entry?.id === reference?.id), reference, `references[${index}]`));
  }
  if ((key === "dosage" || key === "duration") && isRecord(value) && Array.isArray(value.routes)) {
    const old = isRecord(before) ? before : {};
    const oldRoutes = Array.isArray(old.routes) ? old.routes : [];
    const routeSchema = key === "dosage" ? dosageRouteSchema : durationRouteSchema;
    const next: Record<string, unknown> = {
      routes: value.routes.map((route, index) => parseChanged(routeSchema, oldRoutes.find((entry) => entry?.route === route?.route), route, `${key}.routes[${index}]`)),
    };
    const fields = key === "dosage" ? dosageSchema.shape : durationSchema.shape;
    for (const [field, fieldSchema] of Object.entries(fields)) {
      if (field !== "routes") next[field] = parseChanged(fieldSchema, old[field], value[field], `${key}.${field}`);
    }
    return next;
  }
  if (key === "legality" && isRecord(value)) {
    const old = isRecord(before) ? before : {};
    const next: Record<string, unknown> = {};
    for (const [field, fieldSchema] of Object.entries(legalitySchema.shape)) {
      if (same(old[field], value[field])) { if (value[field] !== undefined) next[field] = old[field]; continue; }
      if (field === "countries") next[field] = changedRecord(old[field], value[field], countryLegalitySchema, "legality.countries");
      else if (field === "usStates" && value[field] !== undefined) next[field] = changedRecord(old[field], value[field], usStateLegalitySchema, "legality.usStates");
      else {
        const parsed = parseChanged(fieldSchema, old[field], value[field], `legality.${field}`);
        if (parsed !== undefined) next[field] = parsed;
      }
    }
    return next;
  }
  return parseChanged(schema, before, value, key);
}
function walk(value: unknown, before: unknown, path: string, visit: (value: unknown, before: unknown, path: string) => void) {
  visit(value, before, path);
  if (Array.isArray(value)) value.forEach((entry, index) => walk(entry, Array.isArray(before) ? before[index] : undefined, `${path}[${index}]`, visit));
  else if (isRecord(value)) for (const [key, entry] of Object.entries(value)) walk(entry, isRecord(before) ? before[key] : undefined, path ? `${path}.${key}` : key, visit);
}
function validateChangedRanges(value: unknown, before: unknown, path: string, duration: boolean) {
  walk(value, before, path, (range, old, field) => {
    if (!isRecord(range) || !("min" in range) || !("max" in range) || !("unit" in range) || same(range, old)) return;
    const { min, max, unit } = range as { min: number | null; max: number | null; unit: string };
    if ((min !== null && (!Number.isFinite(min) || min < 0)) || (max !== null && (!Number.isFinite(max) || max < 0))) invalid(field, "Bounds must be finite non-negative numbers or empty.");
    if (min !== null && max !== null && min > max) invalid(field, "Minimum cannot exceed maximum.");
    if ((min !== null || max !== null) && !unit.trim()) invalid(`${field}.unit`, "A populated range needs a unit.");
    if (duration && (min !== null || max !== null) && !/^(s|sec|secs|second|seconds|min|mins|minute|minutes|h|hr|hrs|hour|hours|d|day|days|week|weeks)$/i.test(unit.trim())) invalid(`${field}.unit`, "Duration requires a time unit, not a dose unit.");
  });
}

/** Validate changed domain units, not untouched legacy defects elsewhere.
 * Restoration is checked with the same rules but retains the exact trusted
 * server snapshot rather than storing defaults introduced solely for checking.
 */
export function validateArticleChange(before: ArticleDocument, input: unknown, publication = true, restoring = false): ArticleDocument {
  if (!isRecord(input)) invalid("article", "An article document is required.");
  const article = { ...before };
  for (const [key, schema] of Object.entries(substanceArticleStorageSchema.shape)) {
    const value = parseSection(key, before[key], input[key], schema);
    if (value === undefined) delete article[key]; else article[key] = value;
  }
  if (article.id !== before.id || article.slug !== before.slug) invalid("identity", "Article id and slug cannot change in a contextual edit.");
  if (!same(article.editorial_review, before.editorial_review)) invalid("editorial_review", "Review status and flags belong to the review workbench, not a content edit.");
  if (!same(article.title, before.title) && !article.title.trim()) invalid("title", "A canonical substance name is required.");
  const references = (Array.isArray(article.references) ? article.references : []) as Reference[];
  const oldReferences = (Array.isArray(before.references) ? before.references : []) as Reference[];
  const referencesChanged = !same(references, oldReferences);
  if (referencesChanged && references.length > MAX_ARTICLE_REFERENCES) invalid("references", `Keep at most ${MAX_ARTICLE_REFERENCES} sources per article.`);
  const ids = new Set(references.map((reference) => reference.id));
  const oldIds = new Set(oldReferences.map((reference) => reference.id));
  if (referencesChanged) {
    const unchangedReferenceCounts = new Map<string, number>();
    for (const ref of oldReferences) {
      const hash = contentHash(ref);
      unchangedReferenceCounts.set(hash, (unchangedReferenceCounts.get(hash) ?? 0) + 1);
    }
    for (const [index, ref] of references.entries()) {
      const hash = contentHash(ref);
      const unchangedCount = unchangedReferenceCounts.get(hash) ?? 0;
      if (unchangedCount > 0) {
        unchangedReferenceCounts.set(hash, unchangedCount - 1);
        continue;
      }
      const old = oldReferences.find((entry) => entry.id === ref.id);
      const normalized = normalizeIncomingReference(ref);
      if (normalized.ok === false) invalid(`references[${index}]`, normalized.reason);
      if (references.some((entry, other) => other !== index && entry.id === ref.id)) invalid(`references[${index}].id`, "Use a unique stable reference ID.");
      if (old && !haveCompatibleReferenceIdentity(old, ref)) invalid(`references[${index}].id`, "This ID already names another source. Add a new reference ID instead.");
      const equivalent = references.find((entry, other) => other !== index && entry.id !== ref.id && haveCompatibleReferenceIdentity(entry, ref) && referenceIdentitiesOverlap(entry, ref));
      if (equivalent) invalid(`references[${index}].id`, `Keep canonical source ID ${equivalent.id}.`);
      if (!restoring) {
        let previousSource = old;
        if (!previousSource) {
          for (const candidate of oldReferences) {
            if (ids.has(candidate.id) || !haveCompatibleReferenceIdentity(candidate, ref) || !referenceIdentitiesOverlap(candidate, ref)) continue;
            if (previousSource) { previousSource = undefined; break; }
            previousSource = candidate;
          }
        }
        references[index] = { ...normalized.reference, metadataProvenance: previousSource?.metadataProvenance ?? normalized.reference.metadataProvenance };
      }
    }
  }
  if (publication) walk(article, before, "", (value, old, path) => {
    if (path.startsWith("references") || path.startsWith("editorial_review") || path.startsWith("section_gaps")) return;
    if (typeof value !== "string" && !(path.endsWith("reference_ids") && Array.isArray(value))) return;
    const changed = !same(value, old);
    for (const token of extractCitationTokens(value)) {
      if (!ids.has(token.id) && (changed || oldIds.has(token.id))) invalid(path, `Citation ${token.id} has no reference. Add the source or remove its marker.`);
    }
    if (path.endsWith("reference_ids") && Array.isArray(value)) for (const id of value) {
      if (!ids.has(id) && (changed || oldIds.has(id))) invalid(path, `Reference ${id} does not exist.`);
    }
  });
  for (const section of ["dosage", "duration"] as const) {
    if (same(before[section], article[section])) continue;
    const routes = article[section].routes as Array<{ route: string }>;
    const oldRoutes = (Array.isArray(before[section]?.routes) ? before[section].routes : []) as Array<{ route: string }>;
    for (const [index, route] of routes.entries()) {
      const old = oldRoutes.find((entry) => entry.route === route.route);
      if (same(old, route)) continue;
      const key = route.route.trim().toLowerCase();
      if (!key || routes.some((entry, other) => other !== index && entry.route.trim().toLowerCase() === key)) invalid(`${section}.routes[${index}].route`, "Name a distinct route of administration.");
      validateChangedRanges(route, old, `${section}.routes[${index}]`, section === "duration");
      if (section === "dosage") {
        const tiers = (route as SubstanceArticle["dosage"]["routes"][number]).dose_ranges;
        const priorTiers = (old as SubstanceArticle["dosage"]["routes"][number])?.dose_ranges;
        if (!same(tiers, priorTiers)) {
          const units = new Set(Object.values(tiers).filter((range) => range.min !== null || range.max !== null).map((range) => range.unit.trim().replace(/μ/g, "µ").toLowerCase()));
          if (units.size > 1) invalid(`dosage.routes[${index}].dose_ranges`, "All populated tiers in one route must use the same unit. No automatic conversion is performed.");
        }
      }
    }
    if (section === "dosage") validateChangedRanges(article.dosage.plateau_dosing, before.dosage?.plateau_dosing, "dosage.plateau_dosing", false);
  }
  if (publication && !same(article.legality?.countries, before.legality?.countries)) {
    const countries = article.legality.countries as Record<string, CountryLegality>;
    for (const [country, entry] of Object.entries(countries)) {
      if (same(before.legality?.countries?.[country], entry)) continue;
      const previous = before.legality?.countries?.[country];
      const path = `legality.countries.${country}`;
      if (!entry.status.trim() || !entry.canonicalStatus) invalid(`${path}.canonicalStatus`, "Choose the canonical legal status.");
      const classificationChanged = entry.status !== previous?.status
        || entry.canonicalStatus !== previous?.canonicalStatus
        || entry.designation !== previous?.designation
        || entry.citationNeeded !== previous?.citationNeeded;
      if (!entry.instrument?.trim()) invalid(`${path}.instrument`, "Name the legal instrument.");
      let hasSources = false;
      for (const field of ["status", "notes", "instrument"] as const) {
        const sources = extractCitationTokens(entry[field] ?? "");
        hasSources ||= sources.length > 0;
        if (!classificationChanged && entry[field] === previous?.[field]) continue;
        for (const source of sources) {
          const ref = references.find((row) => row.id === source.id);
          if (!ref || ref.sourceType !== "government_or_regulatory") invalid(`${path}.${field}`, `Reference ${source.id} must identify a government or regulatory primary legal source.`);
        }
      }
      if (!hasSources) invalid(`${path}.notes`, "Cite a primary legal source with a [cite:reference-id] marker.");
      if ((classificationChanged || entry.notes !== previous?.notes) && /\b(refuter|research pass|worker output|proposal artifact|citation audit|source search)\b/i.test(entry.notes)) invalid(`${path}.notes`, "Keep research-process notes in private evidence; public notes must describe the law.");
    }
  }
  return restoring ? input as ArticleDocument : article;
}
