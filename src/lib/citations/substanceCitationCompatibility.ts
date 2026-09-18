import type { Reference } from "@/schema/substance/shared";
import { canonicalizeReferenceUrl, getReferenceIdentityKeys } from "../../../lib/citations/referenceIdentity.mjs";

export type LegacyCitationLike = {
  name?: string | null;
  url?: string | null;
};

export type StructuredReferenceIdentity = Partial<
  Pick<Reference, "url" | "doi" | "pmid" | "isbn">
>;

export type SubstanceCitationCompatibilityProjection = {
  mode: "references-first" | "legacy-fallback";
  referencesPresent: boolean;
  sourceCitations: LegacyCitationLike[];
  citations: LegacyCitationLike[];
  suppressedSourceCitations: LegacyCitationLike[];
  suppressedCitations: LegacyCitationLike[];
};

function normalizeLegacyCitation(citation: LegacyCitationLike): LegacyCitationLike {
  return {
    name: typeof citation?.name === "string" ? citation.name : null,
    url: typeof citation?.url === "string" ? citation.url : null,
  };
}

function getLegacyCitationIdentityKeys(citation: LegacyCitationLike): string[] {
  const url = canonicalizeReferenceUrl(citation.url);
  if (!url) return [];
  return getReferenceIdentityKeys({ url });
}

export function projectSubstanceCitationCompatibility({
  references = [],
  sourceCitations = [],
  citations = [],
}: {
  references?: StructuredReferenceIdentity[] | null;
  sourceCitations?: LegacyCitationLike[] | null;
  citations?: LegacyCitationLike[] | null;
}): SubstanceCitationCompatibilityProjection {
  const structuredReferences = Array.isArray(references) ? references : [];
  const referencesPresent = structuredReferences.length > 0;
  const mode = referencesPresent ? "references-first" : "legacy-fallback";
  const referenceKeys = new Set(
    structuredReferences.flatMap((reference) => getReferenceIdentityKeys(reference)),
  );

  const partition = (entries: LegacyCitationLike[] | null | undefined) => {
    const kept: LegacyCitationLike[] = [];
    const suppressed: LegacyCitationLike[] = [];

    for (const entry of entries ?? []) {
      const normalized = normalizeLegacyCitation(entry);
      const matchesStructuredReference = referencesPresent
        && getLegacyCitationIdentityKeys(normalized).some((key) => referenceKeys.has(key));
      if (matchesStructuredReference) {
        suppressed.push(normalized);
      } else {
        kept.push(normalized);
      }
    }

    return { kept, suppressed };
  };

  const primarySources = partition(sourceCitations);
  const furtherReading = partition(citations);

  return {
    mode,
    referencesPresent,
    sourceCitations: primarySources.kept,
    citations: furtherReading.kept,
    suppressedSourceCitations: primarySources.suppressed,
    suppressedCitations: furtherReading.suppressed,
  };
}

export function hasProjectedSubstanceCitations({
  references = [],
  sourceCitations = [],
  citations = [],
}: {
  references?: StructuredReferenceIdentity[] | null;
  sourceCitations?: LegacyCitationLike[] | null;
  citations?: LegacyCitationLike[] | null;
}): boolean {
  const projection = projectSubstanceCitationCompatibility({
    references,
    sourceCitations,
    citations,
  });

  return projection.referencesPresent
    || projection.sourceCitations.length > 0
    || projection.citations.length > 0;
}
