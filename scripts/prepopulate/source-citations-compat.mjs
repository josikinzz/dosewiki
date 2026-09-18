function hasRouteReferenceIds(routes) {
  return Array.isArray(routes) && routes.some((route) => (
    Array.isArray(route?.reference_ids) && route.reference_ids.length > 0
  ));
}

export function articleHasStructuredCitationContract(article) {
  if (!article || typeof article !== "object") {
    return false;
  }

  return (
    (Array.isArray(article.references) && article.references.length > 0) ||
    hasRouteReferenceIds(article.dosage?.routes) ||
    hasRouteReferenceIds(article.duration?.routes)
  );
}

export function findStructuredCitationArticles(articles) {
  if (!Array.isArray(articles)) {
    return [];
  }

  return articles
    .map((article, index) => ({
      index,
      slug: typeof article?.slug === "string" ? article.slug : "",
      title: typeof article?.title === "string" ? article.title : "",
      hasStructuredCitationContract: articleHasStructuredCitationContract(article),
    }))
    .filter((entry) => entry.hasStructuredCitationContract);
}

export function formatStructuredCitationCompatibilityError(articles) {
  const incompatible = findStructuredCitationArticles(articles);
  if (incompatible.length === 0) {
    return null;
  }

  const sample = incompatible
    .slice(0, 5)
    .map((entry) => entry.slug || entry.title || `article-${entry.index}`)
    .join(", ");

  return [
    "prepopulate-source-citations is compatibility-only and cannot run once structured formal citations exist.",
    `Found ${incompatible.length} structured article(s): ${sample}.`,
    "Use `npm run citations:formal -- --slug=<slug> --dry-run` instead.",
  ].join(" ");
}
