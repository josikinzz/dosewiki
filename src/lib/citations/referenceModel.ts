import type { Reference } from "@/schema/substance/shared";
import {
  dedupeReferences as dedupeSharedReferences,
  deterministicReferenceId as deterministicSharedReferenceId,
  normalizeDoi,
  referenceDedupeKey as sharedReferenceDedupeKey,
} from "../../../lib/citations/referenceIdentity.js";

export const CITE_TOKEN_PATTERN = /\[cite:([A-Za-z0-9][A-Za-z0-9._:-]*)\]/g;

export type CitationToken = {
  id: string;
  index: number;
  raw: string;
};

export type NumberedReference = Reference & {
  number: number;
  anchorId: string;
  apaTextResolved: string;
};

export type CitationNumbering = {
  orderedIds: string[];
  numbersById: Map<string, number>;
  unknownIds: string[];
  referencesById: Map<string, Reference>;
  numberedReferences: NumberedReference[];
};

export function extractCitationTokens(text: unknown): CitationToken[] {
  if (typeof text !== "string" || !text.includes("[cite:")) return [];
  return Array.from(text.matchAll(CITE_TOKEN_PATTERN), (match) => ({
    id: match[1],
    index: match.index ?? 0,
    raw: match[0],
  }));
}

export function stripCitationTokens(text: string): string {
  return text.replace(CITE_TOKEN_PATTERN, "").replace(/\s+/g, " ").trim();
}

function collectStrings(value: unknown, seen: WeakSet<object>, strings: string[]) {
  if (typeof value === "string") {
    strings.push(value);
    return;
  }
  if (!value || typeof value !== "object") return;
  if (seen.has(value)) return;
  seen.add(value);

  if (Array.isArray(value)) {
    for (const item of value) collectStrings(item, seen, strings);
    return;
  }

  for (const [key, child] of Object.entries(value)) {
    if (key === "references" || key === "citations" || key === "source_citations" || key === "editorial_review") {
      continue;
    }
    collectStrings(child, seen, strings);
  }
}

export function collectCitationIdsFromContent(content: unknown): string[] {
  const strings: string[] = [];
  collectStrings(content, new WeakSet(), strings);

  const ids: string[] = [];
  const seen = new Set<string>();
  for (const text of strings) {
    for (const token of extractCitationTokens(text)) {
      if (!seen.has(token.id)) {
        seen.add(token.id);
        ids.push(token.id);
      }
    }
  }
  return ids;
}

function pushCitationId(id: unknown, orderedIds: string[], seen: Set<string>) {
  if (typeof id !== "string") return;
  const trimmed = id.trim();
  if (!trimmed || seen.has(trimmed)) return;
  seen.add(trimmed);
  orderedIds.push(trimmed);
}

function collectCitationIdsFromText(value: unknown, orderedIds: string[], seen: Set<string>) {
  for (const token of extractCitationTokens(value)) {
    pushCitationId(token.id, orderedIds, seen);
  }
}

function collectReferenceIds(value: unknown, orderedIds: string[], seen: Set<string>) {
  if (!Array.isArray(value)) return;
  for (const referenceId of value) {
    pushCitationId(referenceId, orderedIds, seen);
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function collectDosageDurationCitationIds(article: Record<string, unknown>, orderedIds: string[], seen: Set<string>) {
  const dosage = asRecord(article.dosage) ?? {};
  const duration = asRecord(article.duration) ?? {};
  const dosageRoutes = asArray(dosage.routes).map((route) => asRecord(route)).filter(Boolean) as Record<string, unknown>[];
  const durationRoutes = asArray(duration.routes).map((route) => asRecord(route)).filter(Boolean) as Record<string, unknown>[];
  const orderedRoutes: string[] = [];
  const routeNames = new Set<string>();

  const pushRouteName = (value: unknown) => {
    if (typeof value !== "string") return;
    const trimmed = value.trim();
    if (!trimmed || routeNames.has(trimmed)) return;
    routeNames.add(trimmed);
    orderedRoutes.push(trimmed);
  };

  for (const route of dosageRoutes) pushRouteName(route.route);
  for (const route of durationRoutes) pushRouteName(route.route);

  for (const routeName of orderedRoutes) {
    const dosageRoute = dosageRoutes.find((route) => route.route === routeName);
    if (dosageRoute) {
      collectReferenceIds(dosageRoute.reference_ids, orderedIds, seen);
      collectCitationIdsFromText(dosageRoute.bioavailability, orderedIds, seen);
      collectCitationIdsFromText(dosageRoute.bioavailability_notes, orderedIds, seen);
      collectCitationIdsFromText(dosageRoute.notes, orderedIds, seen);
    }

    const durationRoute = durationRoutes.find((route) => route.route === routeName);
    if (durationRoute) {
      collectReferenceIds(durationRoute.reference_ids, orderedIds, seen);
      collectCitationIdsFromText(durationRoute.half_life, orderedIds, seen);
      collectCitationIdsFromText(durationRoute.half_life_notes, orderedIds, seen);
    }
  }

  const plateauDosing = asRecord(dosage.plateau_dosing);
  if (!plateauDosing) return;

  for (const key of ["first_plateau", "second_plateau", "third_plateau", "fourth_plateau", "fifth_plateau"]) {
    const plateau = asRecord(plateauDosing[key]);
    if (plateau) {
      collectCitationIdsFromText(plateau.effects, orderedIds, seen);
    }
  }
  collectCitationIdsFromText(plateauDosing.notes, orderedIds, seen);
}

export function collectCitationIdsFromPublicRenderOrder(article: unknown): string[] {
  const record = asRecord(article);
  if (!record) {
    return typeof article === "string" ? collectCitationIdsFromContent(article) : [];
  }

  const orderedIds: string[] = [];
  const seen = new Set<string>();

  collectCitationIdsFromText(record.summary, orderedIds, seen);
  collectDosageDurationCitationIds(record, orderedIds, seen);

  const pharmacology = asRecord(record.pharmacology) ?? {};
  const pharmacodynamicsText = typeof pharmacology.pharmacodynamics === "string" && pharmacology.pharmacodynamics.trim().length > 0
    ? pharmacology.pharmacodynamics
    : pharmacology.summary;
  collectCitationIdsFromText(pharmacodynamicsText, orderedIds, seen);
  collectCitationIdsFromText(pharmacology.pharmacokinetics, orderedIds, seen);

  const tolerance = asRecord(record.tolerance) ?? {};
  collectCitationIdsFromText(tolerance.full_tolerance, orderedIds, seen);
  collectCitationIdsFromText(tolerance.half_tolerance, orderedIds, seen);
  collectCitationIdsFromText(tolerance.baseline_tolerance, orderedIds, seen);
  for (const value of asArray(tolerance.cross_tolerance)) {
    collectCitationIdsFromText(value, orderedIds, seen);
  }

  const harmPotential = asRecord(record.harm_potential) ?? {};
  collectCitationIdsFromText(harmPotential.summary, orderedIds, seen);

  const historyCulture = asRecord(record.history_culture) ?? {};
  collectCitationIdsFromText(historyCulture.content, orderedIds, seen);
  for (const section of asArray(historyCulture.sections)) {
    const sectionRecord = asRecord(section);
    if (!sectionRecord) continue;
    collectCitationIdsFromText(sectionRecord.content, orderedIds, seen);
    for (const subsection of asArray(sectionRecord.subsections)) {
      const subsectionRecord = asRecord(subsection);
      if (!subsectionRecord) continue;
      collectCitationIdsFromText(subsectionRecord.content, orderedIds, seen);
    }
  }

  const legality = asRecord(record.legality) ?? {};
  for (const value of asArray(legality.international)) {
    collectCitationIdsFromText(value, orderedIds, seen);
  }
  const countries = asRecord(legality.countries) ?? {};
  for (const country of Object.values(countries)) {
    const countryRecord = asRecord(country);
    if (!countryRecord) continue;
    collectCitationIdsFromText(countryRecord.status, orderedIds, seen);
    collectCitationIdsFromText(countryRecord.notes, orderedIds, seen);
  }

  return orderedIds;
}

export function deterministicReferenceId(input: Pick<Reference, "doi" | "pmid" | "isbn" | "url" | "siteName" | "title">): string {
  return deterministicSharedReferenceId(input);
}

export function referenceDedupeKey(reference: Reference): string {
  return sharedReferenceDedupeKey(reference);
}

export function dedupeReferences(references: Reference[]): Reference[] {
  return dedupeSharedReferences(references);
}

function joinAuthors(authors: string[]) {
  const cleaned = authors.map((author) => author.trim()).filter(Boolean);
  if (cleaned.length === 0) return "";
  if (cleaned.length === 1) return cleaned[0];
  if (cleaned.length <= 20) {
    return `${cleaned.slice(0, -1).join(", ")}, & ${cleaned[cleaned.length - 1]}`;
  }
  return `${cleaned.slice(0, 19).join(", ")}, ... ${cleaned[cleaned.length - 1]}`;
}

export function formatApaReference(reference: Reference): string {
  if (reference.apaText?.trim()) return reference.apaText.trim();

  const authors = joinAuthors(reference.authors ?? []);
  const date = reference.date?.trim() || (reference.year ? String(reference.year) : "n.d.");
  const title = reference.title.trim() || "Untitled reference";
  const container = reference.containerTitle?.trim() || reference.siteName?.trim() || "";
  const publisher = reference.publisher?.trim() || "";
  const volumeIssue = [reference.volume, reference.issue ? `(${reference.issue})` : ""].filter(Boolean).join("");
  const pages = reference.articleNumber ? `Article ${reference.articleNumber}` : reference.pages;
  const sourceParts = [container, volumeIssue, pages].filter((part) => typeof part === "string" && part.trim());
  if (sourceParts.length === 0 && publisher) {
    sourceParts.push(publisher);
  }
  const doi = normalizeDoi(reference.doi) || normalizeDoi(reference.url);
  const locator = doi
    ? `https://doi.org/${doi}`
    : reference.url?.trim() ?? "";

  return [
    authors ? `${authors}.` : "",
    `(${date}).`,
    `${title}.`,
    sourceParts.length > 0 ? `${sourceParts.join(", ")}.` : "",
    locator,
  ].filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
}

export function buildCitationNumbering(references: Reference[], content: unknown): CitationNumbering {
  const deduped = dedupeReferences(references);
  const referencesById = new Map(deduped.map((reference) => [reference.id, reference]));
  const orderedIds = collectCitationIdsFromPublicRenderOrder(content);
  const citationIds = orderedIds.length > 0 ? orderedIds : collectCitationIdsFromContent(content);
  const unknownIds = citationIds.filter((id) => !referencesById.has(id));
  const numbersById = new Map<string, number>();
  const numberedReferences: NumberedReference[] = [];

  for (const id of citationIds) {
    const reference = referencesById.get(id);
    if (!reference || numbersById.has(id)) continue;
    const number = numberedReferences.length + 1;
    numbersById.set(id, number);
    numberedReferences.push({
      ...reference,
      number,
      anchorId: `ref-${id}`,
      apaTextResolved: formatApaReference(reference),
    });
  }

  return { orderedIds: citationIds, numbersById, unknownIds, referencesById, numberedReferences };
}

export function renderCitationTokenText(text: string, numbering: Pick<CitationNumbering, "numbersById">): string {
  return text.replace(CITE_TOKEN_PATTERN, (_token, id: string) => {
    const number = numbering.numbersById.get(id);
    return number ? `[${number}]` : "[?]";
  });
}
