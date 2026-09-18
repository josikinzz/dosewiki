import { canonicalizeEffectSlug } from "../../replications/lib/reconciliation.mjs";

import {
  normalizeTag,
  rewriteAssetUrls,
  rewriteInternalLinks,
  rewriteSeeAlso,
  rewriteSocialMediaImage,
} from "./rewrites.mjs";

function parseOptionalAst(section) {
  if (!section?.parsed) return undefined;
  try {
    return typeof section.parsed === "string" ? JSON.parse(section.parsed) : section.parsed;
  } catch {
    return undefined;
  }
}

function mapOptionalCollection(items, mapper) {
  return items?.length ? items.map(mapper) : undefined;
}

export function transformEffect(rawEffect, assetMap, galleryOrderByEffect) {
  const tags = (rawEffect.tags || []).map(normalizeTag);
  const descriptionRaw = rewriteInternalLinks(rewriteAssetUrls(rawEffect.description_raw || "", assetMap));
  const analysisRaw = rewriteInternalLinks(rewriteAssetUrls(rawEffect.analysis_raw || "", assetMap));
  const styleVariationsRaw = rewriteInternalLinks(
    rewriteAssetUrls(rawEffect.style_variations_raw || "", assetMap),
  );
  const personalCommentaryRaw = rewriteInternalLinks(
    rewriteAssetUrls(rawEffect.personal_commentary_raw || "", assetMap),
  );

  let longSummaryRaw;
  let longSummaryAst;
  if (rawEffect.long_summary) {
    longSummaryRaw = rewriteInternalLinks(
      rewriteAssetUrls(rawEffect.long_summary.raw || "", assetMap),
    );
    longSummaryAst = parseOptionalAst(rawEffect.long_summary);
  }

  const citations = mapOptionalCollection(rawEffect.citations, (citation) => ({
    url: citation.url,
    text: citation.text || "",
    from: citation.from || undefined,
  }));
  const seeAlso = rewriteSeeAlso(rawEffect.see_also);
  const externalLinks = mapOptionalCollection(rawEffect.external_links, (link) => ({
    url: link.url,
    title: link.title,
  }));
  const subarticles = mapOptionalCollection(rawEffect.subarticles, (subarticle) => ({
    id: subarticle.id || subarticle._id?.$oid || "",
    title: subarticle.title,
  }));

  const rawGalleryOrder = rawEffect.gallery_order?.length
    ? rawEffect.gallery_order
        .map((item) => {
          if (typeof item === "string") return item;
          return (
            item.url ||
            item.title?.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "") ||
            ""
          );
        })
        .filter(Boolean)
    : undefined;

  const effectSlug = canonicalizeEffectSlug(
    rawEffect.url || rawEffect.name?.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, ""),
  );
  const galleryOrder = galleryOrderByEffect.get(effectSlug) ?? rawGalleryOrder;

  const result = {
    slug: effectSlug,
    name: rawEffect.name,
    tags,
    featured: rawEffect.featured === true,
    summary: rawEffect.summary_raw || "",
    description_raw: descriptionRaw,
    description_ast: parseOptionalAst(rawEffect.description),
  };

  if (analysisRaw?.trim()) {
    result.analysis_raw = analysisRaw;
    const analysisAst = parseOptionalAst(rawEffect.analysis);
    if (analysisAst) result.analysis_ast = analysisAst;
  }

  if (styleVariationsRaw?.trim()) {
    result.style_variations_raw = styleVariationsRaw;
    const styleVariationsAst = parseOptionalAst(rawEffect.style_variations);
    if (styleVariationsAst) result.style_variations_ast = styleVariationsAst;
  }

  if (personalCommentaryRaw?.trim()) {
    result.personal_commentary_raw = personalCommentaryRaw;
    const personalCommentaryAst = parseOptionalAst(rawEffect.personal_commentary);
    if (personalCommentaryAst) result.personal_commentary_ast = personalCommentaryAst;
  }

  if (longSummaryRaw?.trim()) {
    result.long_summary_raw = longSummaryRaw;
    if (longSummaryAst) result.long_summary_ast = longSummaryAst;
  }

  const socialMediaImage = rewriteSocialMediaImage(rawEffect.social_media_image, assetMap);
  if (socialMediaImage) result.social_media_image = socialMediaImage;
  if (galleryOrder) result.gallery_order = galleryOrder;
  if (seeAlso?.length) result.see_also = seeAlso;
  if (externalLinks?.length) result.external_links = externalLinks;
  if (citations?.length) result.citations = citations;
  if (subarticles?.length) result.subarticles = subarticles;
  if (rawEffect.contributors?.length) result.contributors = rawEffect.contributors;

  return result;
}
