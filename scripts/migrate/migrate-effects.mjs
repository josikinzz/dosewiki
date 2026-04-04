#!/usr/bin/env node
/**
 * Migration script for subjective effects from EffectIndex.
 * 
 * Usage:
 *   node scripts/migrate-effects.mjs [path-to-effects.json] [path-to-replications.json]
 * 
 * If no paths are provided, defaults to looking for files in the EffectIndex dump directory.
 * 
 * Prerequisites:
 *   - Convex deployment must be running
 *   - CONVEX_URL environment variable must be set (or use .env.local)
 */

import { readFileSync, existsSync } from "fs";
import path from "path";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../convex/_generated/api.js";
import { canonicalizeEffectSlug, loadGalleryOrderMapping } from "../replications/lib/reconciliation.mjs";

// Configuration
const DEFAULT_EFFECTS_PATH = "../EffectIndex-master/effectindex_dump/effects.json";
const DEFAULT_REPLICATIONS_PATH = "../EffectIndex-master/effectindex_dump/replications.json";
const BATCH_SIZE = 20; // Smaller batch size for larger documents
const GALLERY_ORDER_MAPPING_PATH = path.resolve("notes-and-plans/exports/replications/gallery-order-mapping.json");

// R2 CDN base URL for assets
const R2_CDN_BASE = "https://pub-879bfd45a9774f1c80a8b77aca1f0aee.r2.dev";

/**
 * Tag normalization map - canonicalize tags for consistent filtering.
 */
const TAG_NORMALIZATION = {
  // Plural to singular
  "distortions": "distortion",
  "amplifications": "amplification",
  "suppressions": "suppression",
  "alterations": "alteration",
  // Case normalization
  "gabaergic": "gabaergic",
  "GABAergic": "gabaergic",
  // Keep these as-is
  "visual": "visual",
  "auditory": "auditory",
  "cognitive": "cognitive",
  "physical": "physical",
  "sensory": "sensory",
  "tactile": "tactile",
  "smell and taste": "smell and taste",
  "multisensory": "multisensory",
  "geometric": "geometric",
  "hallucinatory state": "hallucinatory state",
  "psychedelic": "psychedelic",
  "dissociative": "dissociative",
  "deliriant": "deliriant",
  "depressant": "depressant",
  "stimulant": "stimulant",
  "novel state": "novel state",
  "psychological state": "psychological state",
  "transpersonal state": "transpersonal state",
  "uncomfortable": "uncomfortable",
  "cardiovascular": "cardiovascular",
  "neurological": "neurological",
};

/**
 * Normalize a tag to its canonical form.
 */
function normalizeTag(tag) {
  const lower = tag.toLowerCase().trim();
  return TAG_NORMALIZATION[tag] || TAG_NORMALIZATION[lower] || lower;
}

/**
 * Build asset URL map from replications.json for rewriting /img/gallery/ paths.
 */
function buildAssetMap(replications) {
  const assetMap = new Map();
  
  for (const rep of replications) {
    // Map local paths to R2 URLs
    if (rep.resource) {
      // Extract filename from resource (could be full URL or relative path)
      let filename;
      if (rep.resource.startsWith("http")) {
        // Already a full URL, extract filename
        try {
          const url = new URL(rep.resource);
          filename = decodeURIComponent(url.pathname.split("/").pop());
        } catch {
          filename = rep.resource.split("/").pop();
        }
        // Store both the filename and title as keys
        assetMap.set(`/img/gallery/${rep.title}.jpg`, rep.resource);
        assetMap.set(`/img/gallery/${rep.title}.png`, rep.resource);
        assetMap.set(`/img/gallery/${filename}`, rep.resource);
        // Also store by URL slug
        if (rep.url) {
          assetMap.set(`/img/gallery/${rep.url}.jpg`, rep.resource);
          assetMap.set(`/img/gallery/${rep.url}.png`, rep.resource);
        }
      } else {
        // Relative path - construct R2 URL
        const r2Url = `${R2_CDN_BASE}/${encodeURIComponent(rep.resource)}`;
        assetMap.set(`/img/gallery/${rep.resource}`, r2Url);
        if (rep.title) {
          assetMap.set(`/img/gallery/${rep.title}.jpg`, r2Url);
          assetMap.set(`/img/gallery/${rep.title}.png`, r2Url);
          assetMap.set(`/img/gallery/${rep.title}.gif`, r2Url);
          assetMap.set(`/img/gallery/${rep.title}.webp`, r2Url);
        }
      }
    }
  }
  
  return assetMap;
}

/**
 * Rewrite asset URLs in raw vcode content.
 */
function rewriteAssetUrls(content, assetMap) {
  if (!content) return content;
  
  // Match src="/img/gallery/..." patterns
  return content.replace(/src="(\/img\/gallery\/[^"]+)"/g, (match, path) => {
    const r2Url = assetMap.get(path);
    if (r2Url) {
      return `src="${r2Url}"`;
    }
    // Try decoding the path
    try {
      const decodedPath = decodeURIComponent(path);
      const r2UrlDecoded = assetMap.get(decodedPath);
      if (r2UrlDecoded) {
        return `src="${r2UrlDecoded}"`;
      }
    } catch {}
    // Fallback: construct R2 URL directly
    const filename = path.replace("/img/gallery/", "");
    return `src="${R2_CDN_BASE}/${encodeURIComponent(filename)}"`;
  });
}

/**
 * Rewrite social media image URL.
 */
function rewriteSocialMediaImage(imagePath, assetMap) {
  if (!imagePath) return undefined;
  
  // Check asset map first
  const r2Url = assetMap.get(imagePath);
  if (r2Url) return r2Url;
  
  // If already a full URL, return as-is
  if (imagePath.startsWith("http")) return imagePath;
  
  // Construct R2 URL
  const filename = imagePath.replace("/img/gallery/", "");
  return `${R2_CDN_BASE}/${encodeURIComponent(filename)}`;
}

/**
 * Link normalization map - rewrite EffectIndex internal links to DoseWiki routes.
 */
const LINK_REWRITES = {
  "/effects/": "/effects",  // Index
  "/summaries/psychedelics": "/psychoactive/psychedelic",
  "/summaries/dissociatives": "/psychoactive/dissociative",
  "/summaries/deliriants": "/psychoactive/deliriant",
  "/summaries/stimulants": "/psychoactive/stimulant",
  "/summaries/depressants": "/psychoactive/depressant",
  "/summaries/cannabinoids": "/psychoactive/cannabinoid",
  "/summaries/opioids": "/psychoactive/opioid",
  "/summaries/entactogens": "/psychoactive/entactogen",
  "/summaries/nootropics": "/psychoactive/nootropic",
  "/summaries/": "/psychoactive/",  // Fallback for /summaries/{class}
  "/substances/": "/",  // /substances/{slug} -> /{slug}
};

/**
 * Rewrite internal links in vcode content.
 */
function rewriteInternalLinks(content) {
  if (!content) return content;
  
  // Match int-link to="..." patterns
  return content.replace(/\[int-link to="([^"]+)"\]/g, (match, path) => {
    // Check exact matches first
    if (LINK_REWRITES[path]) {
      return `[int-link to="${LINK_REWRITES[path]}"]`;
    }
    
    // Check prefix matches
    for (const [prefix, replacement] of Object.entries(LINK_REWRITES)) {
      if (path.startsWith(prefix)) {
        const newPath = path.replace(prefix, replacement);
        // Clean up trailing slashes
        return `[int-link to="${newPath.replace(/\/$/, "")}"]`;
      }
    }
    
    // /effects/{slug} stays the same
    if (path.startsWith("/effects/")) {
      return match;
    }
    
    return match;
  });
}

/**
 * Rewrite see_also locations.
 */
function rewriteSeeAlso(seeAlso) {
  if (!seeAlso || !Array.isArray(seeAlso)) return undefined;
  
  return seeAlso.map(item => {
    let location = item.location;
    
    // Check exact matches
    if (LINK_REWRITES[location]) {
      location = LINK_REWRITES[location];
    } else {
      // Check prefix matches
      for (const [prefix, replacement] of Object.entries(LINK_REWRITES)) {
        if (location.startsWith(prefix)) {
          location = location.replace(prefix, replacement).replace(/\/$/, "");
          break;
        }
      }
    }
    
    return {
      location,
      title: item.title,
    };
  });
}

/**
 * Transform a MongoDB-style effect to our clean schema.
 */
function transformEffect(rawEffect, assetMap, galleryOrderByEffect) {
  // Normalize tags
  const tags = (rawEffect.tags || []).map(normalizeTag);
  
  // Rewrite content
  const descriptionRaw = rewriteInternalLinks(
    rewriteAssetUrls(rawEffect.description_raw || "", assetMap)
  );
  const analysisRaw = rewriteInternalLinks(
    rewriteAssetUrls(rawEffect.analysis_raw || "", assetMap)
  );
  const styleVariationsRaw = rewriteInternalLinks(
    rewriteAssetUrls(rawEffect.style_variations_raw || "", assetMap)
  );
  const personalCommentaryRaw = rewriteInternalLinks(
    rewriteAssetUrls(rawEffect.personal_commentary_raw || "", assetMap)
  );
  
  // Parse AST if available (stored as JSON string in some cases)
  let descriptionAst;
  if (rawEffect.description?.parsed) {
    try {
      descriptionAst = typeof rawEffect.description.parsed === "string" 
        ? JSON.parse(rawEffect.description.parsed)
        : rawEffect.description.parsed;
    } catch {}
  }
  
  let analysisAst;
  if (rawEffect.analysis?.parsed) {
    try {
      analysisAst = typeof rawEffect.analysis.parsed === "string"
        ? JSON.parse(rawEffect.analysis.parsed)
        : rawEffect.analysis.parsed;
    } catch {}
  }
  
  let styleVariationsAst;
  if (rawEffect.style_variations?.parsed) {
    try {
      styleVariationsAst = typeof rawEffect.style_variations.parsed === "string"
        ? JSON.parse(rawEffect.style_variations.parsed)
        : rawEffect.style_variations.parsed;
    } catch {}
  }
  
  let personalCommentaryAst;
  if (rawEffect.personal_commentary?.parsed) {
    try {
      personalCommentaryAst = typeof rawEffect.personal_commentary.parsed === "string"
        ? JSON.parse(rawEffect.personal_commentary.parsed)
        : rawEffect.personal_commentary.parsed;
    } catch {}
  }
  
  // Parse long_summary if available (extended effect descriptions)
  let longSummaryRaw;
  let longSummaryAst;
  if (rawEffect.long_summary) {
    longSummaryRaw = rewriteInternalLinks(
      rewriteAssetUrls(rawEffect.long_summary.raw || "", assetMap)
    );
    if (rawEffect.long_summary.parsed) {
      try {
        longSummaryAst = typeof rawEffect.long_summary.parsed === "string"
          ? JSON.parse(rawEffect.long_summary.parsed)
          : rawEffect.long_summary.parsed;
      } catch {}
    }
  }
  
  // Transform citations
  const citations = rawEffect.citations?.length
    ? rawEffect.citations.map(c => ({
        url: c.url,
        text: c.text || "",
        from: c.from || undefined,
      }))
    : undefined;
  
  // Transform see_also with link rewrites
  const seeAlso = rewriteSeeAlso(rawEffect.see_also);
  
  // Transform external_links
  const externalLinks = rawEffect.external_links?.length
    ? rawEffect.external_links.map(l => ({
        url: l.url,
        title: l.title,
      }))
    : undefined;
  
  // Transform subarticles
  const subarticles = rawEffect.subarticles?.length
    ? rawEffect.subarticles.map(s => ({
        id: s.id || s._id?.$oid || "",
        title: s.title,
      }))
    : undefined;
  
  // Transform gallery_order (array of replication slugs)
  // gallery_order can be either strings or objects with url field
  const rawGalleryOrder = rawEffect.gallery_order?.length
    ? rawEffect.gallery_order.map(item => {
        if (typeof item === "string") return item;
        // Extract URL slug from object
        return item.url || item.title?.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "") || "";
      }).filter(Boolean)
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
    description_ast: descriptionAst,
  };
  
  // Only include optional fields if they have content
  if (analysisRaw && analysisRaw.trim()) {
    result.analysis_raw = analysisRaw;
    if (analysisAst) result.analysis_ast = analysisAst;
  }
  
  if (styleVariationsRaw && styleVariationsRaw.trim()) {
    result.style_variations_raw = styleVariationsRaw;
    if (styleVariationsAst) result.style_variations_ast = styleVariationsAst;
  }
  
  if (personalCommentaryRaw && personalCommentaryRaw.trim()) {
    result.personal_commentary_raw = personalCommentaryRaw;
    if (personalCommentaryAst) result.personal_commentary_ast = personalCommentaryAst;
  }
  
  // Add long_summary if available
  if (longSummaryRaw && longSummaryRaw.trim()) {
    result.long_summary_raw = longSummaryRaw;
    if (longSummaryAst) result.long_summary_ast = longSummaryAst;
  }
  
  const socialMediaImage = rewriteSocialMediaImage(rawEffect.social_media_image, assetMap);
  if (socialMediaImage) {
    result.social_media_image = socialMediaImage;
  }
  
  if (galleryOrder) result.gallery_order = galleryOrder;
  if (seeAlso?.length) result.see_also = seeAlso;
  if (externalLinks?.length) result.external_links = externalLinks;
  if (citations?.length) result.citations = citations;
  if (subarticles?.length) result.subarticles = subarticles;
  if (rawEffect.contributors?.length) result.contributors = rawEffect.contributors;
  
  return result;
}

async function main() {
  console.log("🚀 Subjective Effects Migration Script\n");

  // Get file paths from args or use defaults
  const effectsPath = process.argv[2] || DEFAULT_EFFECTS_PATH;
  const replicationsPath = process.argv[3] || DEFAULT_REPLICATIONS_PATH;
  
  if (!existsSync(effectsPath)) {
    console.error(`❌ Effects file not found: ${effectsPath}`);
    console.error("\nUsage: node scripts/migrate-effects.mjs [path-to-effects.json] [path-to-replications.json]");
    console.error("\nExample:");
    console.error("  node scripts/migrate-effects.mjs ../EffectIndex-master/effectindex_dump/effects.json ../EffectIndex-master/effectindex_dump/replications.json");
    process.exit(1);
  }

  console.log(`📄 Reading effects from: ${effectsPath}`);
  
  // Load and parse effects
  let rawEffects;
  try {
    const content = readFileSync(effectsPath, "utf-8");
    rawEffects = JSON.parse(content);
  } catch (error) {
    console.error(`❌ Failed to parse effects file: ${error.message}`);
    process.exit(1);
  }

  console.log(`📊 Found ${rawEffects.length} effects in source file`);

  // Load replications for asset mapping (optional)
  let assetMap = new Map();
  if (existsSync(replicationsPath)) {
    console.log(`📄 Reading replications from: ${replicationsPath}`);
    try {
      const repContent = readFileSync(replicationsPath, "utf-8");
      const replications = JSON.parse(repContent);
      assetMap = buildAssetMap(replications);
      console.log(`🖼️  Built asset map with ${assetMap.size} entries`);
    } catch (error) {
      console.warn(`⚠️  Failed to parse replications file: ${error.message}`);
      console.warn("   Continuing without asset URL mapping...\n");
    }
  } else {
    console.log(`⚠️  Replications file not found: ${replicationsPath}`);
    console.log("   Continuing without asset URL mapping...\n");
  }

  const galleryOrderByEffect = loadGalleryOrderMapping(GALLERY_ORDER_MAPPING_PATH);
  if (galleryOrderByEffect.size > 0) {
    console.log(`🖼️  Loaded canonical gallery-order mapping for ${galleryOrderByEffect.size} effects`);
  }

  // Transform effects
  console.log("🔄 Transforming effects to new schema...");
  const transformedEffects = rawEffects.map((effect) => transformEffect(effect, assetMap, galleryOrderByEffect));

  // Count featured
  const featuredCount = transformedEffects.filter(e => e.featured).length;
  console.log(`⭐ ${featuredCount} featured effects`);

  // Collect tag statistics
  const tagCounts = new Map();
  for (const effect of transformedEffects) {
    for (const tag of effect.tags) {
      tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
    }
  }
  
  console.log(`🏷️  ${tagCounts.size} unique tags`);
  
  // Show top tags
  const sortedTags = [...tagCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);
  console.log("\nTop 10 tags:");
  for (const [tag, count] of sortedTags) {
    console.log(`   ${tag}: ${count}`);
  }

  // Count content sections
  const withAnalysis = transformedEffects.filter(e => e.analysis_raw).length;
  const withStyleVariations = transformedEffects.filter(e => e.style_variations_raw).length;
  const withPersonalCommentary = transformedEffects.filter(e => e.personal_commentary_raw).length;
  const withLongSummary = transformedEffects.filter(e => e.long_summary_raw).length;
  const withCitations = transformedEffects.filter(e => e.citations?.length).length;
  
  console.log("\nContent breakdown:");
  console.log(`   With analysis: ${withAnalysis}`);
  console.log(`   With style variations: ${withStyleVariations}`);
  console.log(`   With personal commentary: ${withPersonalCommentary}`);
  console.log(`   With long summary: ${withLongSummary}`);
  console.log(`   With citations: ${withCitations}`);

  // Initialize Convex client
  const convexUrl = process.env.CONVEX_URL || process.env.VITE_CONVEX_URL;
  
  if (!convexUrl) {
    console.error("\n❌ CONVEX_URL environment variable not set");
    console.error("\nSet it with:");
    console.error("  export CONVEX_URL=https://your-deployment.convex.cloud");
    console.error("\nOr create a .env.local file with VITE_CONVEX_URL");
    process.exit(1);
  }

  console.log(`\n🔗 Connecting to Convex: ${convexUrl}`);
  const client = new ConvexHttpClient(convexUrl);

  // Import in batches
  console.log(`\n📤 Importing ${transformedEffects.length} effects in batches of ${BATCH_SIZE}...\n`);
  
  let totalCreated = 0;
  let totalUpdated = 0;
  const allErrors = [];

  for (let i = 0; i < transformedEffects.length; i += BATCH_SIZE) {
    const batch = transformedEffects.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(transformedEffects.length / BATCH_SIZE);
    
    process.stdout.write(`  Batch ${batchNum}/${totalBatches}: ${batch.length} effects... `);
    
    try {
      const result = await client.mutation(api.subjectiveEffects.bulkImport, { effects: batch });
      totalCreated += result.created;
      totalUpdated += result.updated;
      allErrors.push(...result.errors);
      console.log(`✓ (created: ${result.created}, updated: ${result.updated})`);
    } catch (error) {
      console.log(`✗ Error: ${error.message}`);
      allErrors.push(`Batch ${batchNum}: ${error.message}`);
    }
  }

  // Summary
  console.log("\n" + "=".repeat(50));
  console.log("📊 Migration Complete\n");
  console.log(`  ✅ Created: ${totalCreated}`);
  console.log(`  🔄 Updated: ${totalUpdated}`);
  
  if (allErrors.length > 0) {
    console.log(`  ❌ Errors: ${allErrors.length}`);
    console.log("\nError details:");
    for (const error of allErrors.slice(0, 10)) {
      console.log(`    - ${error}`);
    }
    if (allErrors.length > 10) {
      console.log(`    ... and ${allErrors.length - 10} more`);
    }
  }

  console.log("\n✨ Done!");
}

main().catch(console.error);
