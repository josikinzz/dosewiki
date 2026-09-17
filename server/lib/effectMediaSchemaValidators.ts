import { v } from "../../lib/postgres/runtime/values"
import { replicationDateInfo } from "./replicationDateValidators";
import {
  contentFamilyValidator,
  drugClassValidator,
  replicationStatusValidator,
  taxonomyConfidenceValidator,
  titleClassMentionValidator,
  titleDrugValidator,
  viewingModeTagValidator,
  viewingModeValidator,
} from "./replicationTaxonomyValidators";

const replicationRightsStatus = v.union(
  v.literal("creator-retained"),
  v.literal("explicit-license"),
  v.literal("unknown"),
  v.literal("permission-granted"),
  v.literal("public-domain"),
);

const replicationRightsFields = {
  rights_status: v.optional(replicationRightsStatus),
  license_name: v.optional(v.string()),
  license_url: v.optional(v.string()),
  credit_line: v.optional(v.string()),
  source_url: v.optional(v.string()),
  rightsholder: v.optional(v.string()),
  permission_notes: v.optional(v.string()),
  removal_contact: v.optional(v.string()),
};

// Subjective effect article - imported from EffectIndex
export const subjectiveEffect = v.object({
  slug: v.string(),           // URL-safe identifier (e.g., "geometry")
  name: v.string(),           // Display name (e.g., "Geometry")
  tags: v.array(v.string()),  // Categorization tags (e.g., ["visual", "geometric"])
  featured: v.optional(v.boolean()),

  // Content sections (raw + parsed VCode AST)
  summary: v.string(),        // Plain text summary for SEO/cards
  description_raw: v.string(),
  description_ast: v.optional(v.any()), // Parsed VCode AST (array of nodes)
  long_summary_raw: v.optional(v.string()),   // Extended summary (VCode markup)
  long_summary_ast: v.optional(v.any()),      // Extended summary parsed AST
  analysis_raw: v.optional(v.string()),
  analysis_ast: v.optional(v.any()),
  style_variations_raw: v.optional(v.string()),
  style_variations_ast: v.optional(v.any()),
  personal_commentary_raw: v.optional(v.string()),
  personal_commentary_ast: v.optional(v.any()),

  // Media
  social_media_image: v.optional(v.string()),
  gallery_order: v.optional(v.array(v.string())),  // Replication slugs
  audio_replications: v.optional(v.array(v.object({
    title: v.string(),
    artist: v.string(),
    artist_url: v.optional(v.string()),
    description: v.optional(v.string()),
    resource: v.string(),
    ...replicationRightsFields,
  }))),

  // Links & References
  see_also: v.optional(v.array(v.object({
    location: v.string(),
    title: v.string(),
  }))),
  external_links: v.optional(v.array(v.object({
    url: v.string(),
    title: v.string(),
  }))),
  citations: v.optional(v.array(v.object({
    url: v.string(),
    text: v.string(),
    from: v.optional(v.string()),
  }))),

  // Subarticles for ToC anchors
  subarticles: v.optional(v.array(v.object({
    id: v.string(),
    title: v.string(),
  }))),

  // Contributors
  contributors: v.optional(v.array(v.string())),
});

/**
 * What a stored media row *is*, as opposed to what it depicts.
 *
 * `replication` — an artist's attempt to reproduce a subjective effect. This is
 * what the public gallery, the artist credits, and the /effects surfaces mean by
 * "replication", and it is the only thing the table could express before.
 *
 * `figure` — an explanatory asset that is stored, credited, and rights-tracked in
 * exactly the same way but is not somebody's rendition of an experience: ECG and
 * EEG traces, Bristol stool charts, vertebral-column diagrams, molecule figures,
 * a brain connectome. These belong in the media store so their rights and credit
 * travel with them, but they must never be counted or shown as replications.
 *
 * ABSENCE MEANS `replication`. The column is optional precisely so the 247 rows
 * that predate it stay correct with no backfill: every one of them is a
 * replication, and reading `row.role ?? "replication"` gives that answer for free.
 * A required column would have made all 247 rows invalid the moment the schema
 * deployed. Read this column through `mediaRole()` in `src/types/replications.ts`
 * rather than comparing it directly, so the default lives in one place.
 *
 * Deliberately NOT indexed. An index over an optional field files the 247
 * undefined rows under `undefined`, so `.eq("role", "replication")` would return
 * zero of them — an index here would be a trap, not an optimization, until the
 * column is backfilled and required.
 */
const replicationRole = v.union(v.literal("replication"), v.literal("figure"));

/**
 * Storable media kinds. `audio` was added alongside `role`: 12 audio assets had
 * nowhere to live, 5 of them already carrying full rights metadata in the
 * separate `subjectiveEffects.audio_replications` column. Widening a union is
 * additive — no existing "image"/"video" row changes meaning.
 */
const replicationMediaType = v.union(
  v.literal("video"),
  v.literal("image"),
  v.literal("audio"),
);

/**
 * Public lifecycle of a stored replication row. Absence means published so the
 * existing corpus needs no backfill. Duplicate suppression is reversible and
 * deliberately distinct from the editorial replication-status taxonomy.
 */
export const replicationPublicationState = v.union(
  v.literal("published"),
  v.literal("duplicate-suppressed"),
);

// Stored media for effect articles: replications, and explanatory figures.
export const replication = v.object({
  slug: v.string(),                    // URL-friendly identifier (e.g., "breathing-by-artist-name")
  title: v.string(),                   // Display title
  artist: v.string(),                  // Artist/creator name
  artist_url: v.optional(v.string()),  // Artist portfolio/social link
  role: v.optional(replicationRole),   // Absent === "replication"; see above
  publication_state: v.optional(replicationPublicationState), // Absent === published
  duplicate_of_replication_id: v.optional(v.id("replications")),
  duplicate_evidence_digest: v.optional(v.string()),
  duplicate_operation_id: v.optional(v.string()),
  duplicate_suppressed_at: v.optional(v.number()),
  type: replicationMediaType,          // "video" | "image" | "audio"
  // A canonical r2_key may be the row's primary media locator without
  // requiring an entry in the native storage manifest.
  storage_id: v.optional(v.string()),
  /**
   * Owning effect, when there is one. Optional because some stored assets
   * genuinely have no effect: figures embedded in `effectIndexArticles`
   * (dmt, dxm, lucid-dreaming, meditation), page heroes, and a molecule diagram
   * that depicts no subjective effect at all. Every existing row sets it, so
   * relaxing `v.string()` to `v.optional(v.string())` changes nothing for them.
   */
  effect_slug: v.optional(v.string()),
  /**
   * Retired from every substance showcase candidate pool at once.
   *
   * Per-substance `removed_slugs` says "good work, wrong article", which is
   * rare. Junk is junk everywhere, and sweeping it one substance at a time is
   * what pushed curations into their slug cap, so this is the corpus-wide
   * verb. The row stays in the Library and on its effect page; it simply stops
   * proposing itself for substance galleries.
   */
  showcase_excluded: v.optional(v.boolean()),
  thumbnail_storage_id: v.optional(v.string()), // Video thumbnail storage ID
  /**
   * Low-res muted preview rendition for gallery in-view autoplay (video rows
   * only). Optional and additive: rows without one keep their current
   * hover-to-play behaviour. Written by
   * scripts/replications/generate-preview-renditions.mjs.
   */
  preview_storage_id: v.optional(v.string()),
  /**
   * Full-viewer silent video rendition for controllable GIF-like motion.
   * This never replaces the original storage_id or the low-resolution
   * preview_storage_id used by Gallery tiles.
   */
  motion_storage_id: v.optional(v.string()),
  /** Poster paired with motion_storage_id; original thumbnail stays untouched. */
  motion_poster_storage_id: v.optional(v.string()),
  /**
   * Cloudflare R2 archive keys, one per media variant. Content-addressed
   * (`media/sha256/<first-two-hex>/<sha256>.<ext>`) and immutable. Optional
   * and additive: imported storage IDs stay populated as durable references
   * into the native storage manifest. `resolveReplicationUrls` prefers a valid
   * R2 key whenever REPLICATION_MEDIA_BASE_URL is configured in the server
   * environment. Written only by the CAS mutation `replications.updateR2Keys`.
   */
  r2_key: v.optional(v.string()),
  thumbnail_r2_key: v.optional(v.string()),
  preview_r2_key: v.optional(v.string()),
  motion_r2_key: v.optional(v.string()),
  motion_poster_r2_key: v.optional(v.string()),
  url: v.optional(v.string()),         // Direct URL (including historical storage or CDN)
  thumbnail_url: v.optional(v.string()), // Direct thumbnail URL (for videos)
  width: v.optional(v.number()),       // For responsive display
  height: v.optional(v.number()),
  format: v.string(),                  // File extension (mp4, jpg, etc.)
  file_size: v.optional(v.number()),   // In bytes
  duration: v.optional(v.number()),    // Video duration in seconds
  /**
   * Whether the stored video contains audible signal. `true` = decoded peak
   * above the silence floor; `false` = no audio stream or digitally silent;
   * absent = never probed. Written by
   * scripts/replications/backfill-audio-presence.mjs; only meaningful on
   * `type: "video"` rows.
   */
  has_audio: v.optional(v.boolean()),
  created_at: v.string(),              // ISO timestamp
  /**
   * Best defensible temporal statement for the work. This is deliberately not
   * named `created_at`: that existing field is the database/import timestamp.
   * The full rationale and evidence live in `replicationDateResearch` so public
   * gallery reads carry only this compact summary.
   */
  date_info: v.optional(replicationDateInfo),
  /**
   * Subjective effects this asset also depicts, as effect slugs.
   *
   * `effect_slug` identifies the owning effect for grouping and the permalink.
   * This column answers the additional question "what else is visible in it",
   * which a single owning
   * slug cannot express: one image can show geometry, drifting, and colour
   * enhancement at once.
   *
   * Optional and additive: every existing row is correct with the column
   * absent, and absence means "not tagged yet", never "depicts nothing".
   * The public gallery filter, effect article collections and public API match
   * owning effect OR these explicit tags. No ancestor membership is inferred.
   */
  effect_tags: v.optional(v.array(v.string())),
  /** SHA-256 of the immutable acquisition source, when the insert plan has it. */
  source_sha256: v.optional(v.string()),
  /** Stable ID of the reviewed local catalog row that supplied this taxonomy. */
  source_catalog_id: v.optional(v.string()),
  /** Stable campaign-neutral identity for catalog and live-only taxonomy records. */
  taxonomy_record_key: v.optional(v.string()),
  /** Editorial judgment used by replication publication and gallery filters. */
  replication_status: v.optional(replicationStatusValidator),
  replication_status_confidence: v.optional(taxonomyConfidenceValidator),
  replication_status_review_required: v.optional(v.boolean()),
  /** Open-eye and closed-eye are both present when viewing_mode is mixed. */
  viewing_mode: v.optional(viewingModeValidator),
  viewing_mode_tags: v.optional(v.array(viewingModeTagValidator)),
  viewing_mode_confidence: v.optional(taxonomyConfidenceValidator),
  viewing_mode_review_required: v.optional(v.boolean()),
  /** Drug associations are title-only; no visual inference is stored here. */
  title_drugs: v.optional(v.array(titleDrugValidator)),
  title_class_mentions: v.optional(v.array(titleClassMentionValidator)),
  drug_classes: v.optional(v.array(drugClassValidator)),
  /** Broad content theme, separate from whether a work is a replication. */
  content_family: v.optional(contentFamilyValidator),
  content_tags: v.optional(v.array(v.string())),
  content_family_confidence: v.optional(taxonomyConfidenceValidator),
  content_family_review_required: v.optional(v.boolean()),
  taxonomy_review_required: v.optional(v.boolean()),
  taxonomy_version: v.optional(v.number()),
  taxonomy_source_digest: v.optional(v.string()),
  taxonomy_updated_at: v.optional(v.number()),
  ...replicationRightsFields,
});

// Per-substance association/exclusion deltas and an exact editorial order.
// Uncurated substances use automatic matches. `disabled` suppresses all sources,
// including future matches, without destroying the stored membership or order.
export const substanceGallery = v.object({
  substance_slug: v.string(),
  curated_slugs: v.array(v.string()),
  removed_slugs: v.array(v.string()),
  carousel_order: v.optional(v.array(v.string())),
  disabled: v.optional(v.boolean()),
  updated_at: v.string(),               // ISO timestamp
  updated_by: v.optional(v.string()),
  archived_at: v.optional(v.string()),  // set instead of deleting; hidden everywhere until restored
  archived_by: v.optional(v.string()),
});

// A reusable, named, ordered set of replications an editor can apply to any
// substance's curation. Nothing here publishes: applying a playlist edits the
// target gallery's *draft*, and the `substanceGalleries` curation stays the one
// publish gate. This exists because the same twelve works are the right opener
// for a whole family of substances, and rebuilding that order by hand for each
// one is the bulk of the curation work.
export const replicationPlaylist = v.object({
  key: v.string(),                      // kebab-case stable id
  owner_email: v.optional(v.string()),  // member who may edit it directly; unowned = admin-only
  title: v.string(),                    // display name
  replication_slugs: v.array(v.string()),
  updated_at: v.string(),               // ISO timestamp
  updated_by: v.optional(v.string()),
  archived_at: v.optional(v.string()),  // set instead of deleting; hidden everywhere until restored
  archived_by: v.optional(v.string()),
});
