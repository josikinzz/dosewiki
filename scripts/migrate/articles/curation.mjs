// Curation list for the Effect Index article migration.
//
// The Effect Index dump ships 19 articles, but only a curated subset belongs on
// DoseWiki. The excluded ones are working documents rather than reference
// content: video/production scripts written to be read aloud, fundraising and
// funding-proposal paperwork, and internal structure/methodology notes about how
// Effect Index itself was organised. They are not articles a reader would ever
// want to land on, so they are deliberately not imported at all — not imported
// as "unlisted" either, which would still leave them reachable by URL.
//
// If you are adding a slug back, that is a content decision for the owner, not a
// cleanup: do not "restore" an excluded slug because it looks missing.
//
// This file is the single source of truth for both membership and publication
// status. The dump's own `publication_status` is intentionally ignored — several
// ported articles are marked "unlisted" upstream (dxm, meditation,
// duration-terminology-explanation, approximate-frequency-of-occurrence-scale)
// and we publish them anyway.

/**
 * Slugs we port, mapped to the publication status we assign them.
 * @type {Map<string, string>}
 */
export const CURATED_ARTICLES = new Map([
  // Rating and reference scales.
  ["dmt", "published"],
  ["dxm", "published"],
  ["dissociative-intensity-scale", "published"],
  ["psychedelic-intensity-scale", "published"],
  ["approximate-frequency-of-occurrence-scale", "published"],
  // Essays.
  ["dreams", "published"],
  ["lucid-dreaming", "published"],
  ["meditation", "published"],
  // Reader-facing methodology.
  ["duration-terminology-explanation", "published"],
]);

/**
 * Slugs present in the dump that we knowingly skip, with the reason. Listing
 * them explicitly (rather than "anything not allowlisted") is what lets the
 * migration fail loudly when the dump gains or loses an article.
 * @type {Map<string, string>}
 */
export const EXCLUDED_ARTICLES = new Map([
  ["funding-proposal", "fundraising/org document, not reference content"],
  ["script-for-fundraising", "fundraising/org document, not reference content"],
  ["ego-deaths-script", "video production script"],
  ["unity-script", "video production script"],
  ["dmt-video-script", "video production script"],
  ["psychedelic-internal-hallucinations-video-script", "video production script"],
  ["symmetrical-texture-repetition-video-script", "video production script"],
  ["esei-structure", "internal structure note"],
  ["heart-opening", "internal working draft"],
  ["experimental-identity-levelling-system", "internal structure note"],
]);

/**
 * Splits the raw dump into the articles we port and the ones we skip, failing
 * loudly on any drift between the dump and the curation list. Silent drift —
 * a new upstream article quietly imported, or a curated one quietly vanishing —
 * is the exact failure mode this guard exists to prevent.
 *
 * @param {Array<{ slug?: unknown }>} rawArticles
 * @returns {{ ported: Array<object>, skipped: Array<{ slug: string, reason: string }> }}
 */
export function partitionCuratedArticles(rawArticles) {
  const seen = new Set();
  const ported = [];
  const skipped = [];
  const uncurated = [];

  for (const rawArticle of rawArticles) {
    const slug = rawArticle?.slug;
    if (typeof slug !== "string" || !slug) {
      throw new Error("Article is missing its source slug");
    }
    if (seen.has(slug)) {
      throw new Error(`Article source contains duplicate slug: ${slug}`);
    }
    seen.add(slug);

    if (CURATED_ARTICLES.has(slug)) {
      ported.push(rawArticle);
    } else if (EXCLUDED_ARTICLES.has(slug)) {
      skipped.push({ slug, reason: EXCLUDED_ARTICLES.get(slug) });
    } else {
      uncurated.push(slug);
    }
  }

  if (uncurated.length > 0) {
    throw new Error(
      `Effect Index dump contains ${uncurated.length} article(s) in neither the port nor the skip list: ${uncurated.join(", ")}. ` +
        "Add each slug to CURATED_ARTICLES or EXCLUDED_ARTICLES in scripts/migrate/articles/curation.mjs before importing.",
    );
  }

  const missing = [...CURATED_ARTICLES.keys()].filter((slug) => !seen.has(slug));
  if (missing.length > 0) {
    throw new Error(
      `Curated article(s) missing from the Effect Index dump: ${missing.join(", ")}.`,
    );
  }

  return { ported, skipped };
}

/**
 * The publication status we assign a curated slug. Throws for uncurated slugs so
 * nothing can be imported without passing through the list above.
 *
 * @param {string} slug
 * @returns {string}
 */
export function curatedPublicationStatus(slug) {
  const status = CURATED_ARTICLES.get(slug);
  if (!status) {
    throw new Error(`${slug}: article is not on the curation list`);
  }
  return status;
}
