import { hasUnsafeReferenceMarkup } from "../../lib/citations/referenceIdentity.mjs";
import { referenceSchema, type Reference } from "../../src/schema/substance/shared";

export const PORTAL_MINTED_REFERENCE_SUPPORT_STATUS = "needs_review" as const;

const REFERENCE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

export const ARTICLE_REFERENCE_TITLE_MAX_LENGTH = 500;

export const ARTICLE_REFERENCE_URL_MAX_LENGTH = 2048;

export const ARTICLE_REFERENCE_MAX_AUTHORS = 100;

export const MAX_ARTICLE_REFERENCES = 1000;

export function normalizeIncomingReference(
  raw: unknown,
): { ok: true; reference: Reference } | { ok: false; reason: string } {
  const parsed = referenceSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, reason: "That source is not a valid reference entry." };
  }

  const reference = parsed.data;

  if (!REFERENCE_ID_PATTERN.test(reference.id)) {
    return { ok: false, reason: "That source has no usable citation id." };
  }

  const title = reference.title.trim();
  if (title.length === 0) {
    return { ok: false, reason: "A source needs a title." };
  }
  if (title.length > ARTICLE_REFERENCE_TITLE_MAX_LENGTH) {
    return {
      ok: false,
      reason: `A source title must be ${ARTICLE_REFERENCE_TITLE_MAX_LENGTH} characters or fewer.`,
    };
  }
  if (
    hasUnsafeReferenceMarkup(title)
    || hasUnsafeReferenceMarkup(reference.apaText)
  ) {
    return {
      ok: false,
      reason: "Source titles and citation text cannot contain raw MediaWiki or <ref> markup.",
    };
  }
  if ((reference.url?.length ?? 0) > ARTICLE_REFERENCE_URL_MAX_LENGTH) {
    return { ok: false, reason: "That source URL is too long to store." };
  }
  if (reference.authors.length > ARTICLE_REFERENCE_MAX_AUTHORS) {
    return {
      ok: false,
      reason: `A source may list at most ${ARTICLE_REFERENCE_MAX_AUTHORS} authors.`,
    };
  }

  return {
    ok: true,
    reference: {
      ...reference,
      title,
      supportStatus: PORTAL_MINTED_REFERENCE_SUPPORT_STATUS,
      metadataProvenance: [{
        kind: "imported",
        source: "portal-reference-intake",
        fields: Object.entries(reference)
          .filter(([field, value]) => field !== "id" && field !== "metadataProvenance" && value != null && value !== "")
          .map(([field]) => field)
          .slice(0, 64),
      }],
    },
  };
}
