import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import {
  articleFeedback,
  articleSource,
  changelogEntry,
  citationEvidence,
  effectIndexArticle,
  prompt,
  quote,
  siteFeedback,
  substanceArticle,
  tripReport,
  tripReportSubmission,
} from "./lib/contentSchemaValidators";
import {
  replication,
  subjectiveEffect,
  replicationPlaylist,
  substanceGallery,
} from "./lib/effectMediaSchemaValidators";
import { replicationDateResearch } from "./lib/replicationDateValidators";
import { reagentTestDocumentValidator } from "./reagentTestContract";

/**
 * Convex schema for DoseWiki.
 * 
 * Articles are stored as complete documents with the full SubstanceArticle structure.
 * 
 * We use a permissive schema here because:
 * 1. The actual data has many optional fields and variations
 * 2. Zod validation happens on the frontend before display
 * 3. This avoids constant schema updates as data evolves
 * 
 * The frontend's Zod schema (src/schema/substance.schema.ts) is the source of truth
 * for type validation.
 */


const membership = v.object({
  email: v.string(),
  name: v.optional(v.string()),
  image: v.optional(v.string()),
  role: v.union(v.literal("admin"), v.literal("editor"), v.literal("viewer")),
  provider: v.optional(v.string()),
  providerAccountId: v.optional(v.string()),
  createdAt: v.string(),
  updatedAt: v.string(),
  lastSeenAt: v.optional(v.string()),
});

const generatedPublicationProfile = v.union(
  v.literal("summary"),
  v.literal("dosage_duration"),
  v.literal("subjective_effects"),
  v.literal("pharmacology"),
  v.literal("interactions"),
  v.literal("tolerance"),
  v.literal("harm_potential"),
  v.literal("history_culture"),
  v.literal("legality"),
);

const generatedPublicationOperation = v.object({
  proposalId: v.string(),
  payloadDigest: v.string(),
  artifactDigest: v.string(),
  manifestDigest: v.string(),
  rawResponseHash: v.string(),
  targetDeploymentFingerprint: v.string(),
  slug: v.string(),
  profile: generatedPublicationProfile,
  affectedPaths: v.array(v.string()),
  actorEmail: v.string(),
  reviewedBy: v.string(),
  reviewedAt: v.string(),
  previousHash: v.string(),
  nextHash: v.string(),
  hashVersion: v.literal("section-cas-v1"),
  createdAt: v.string(),
});

const contributorProfile = v.object({
  key: v.string(),
  displayName: v.string(),
  aliases: v.array(v.string()),
  avatarStorageId: v.optional(v.string()),
  avatarUrl: v.optional(v.string()),
  bio: v.string(),
  // Free-text contributor title shown on the public profile ("Founder",
  // "Former Dev", "Replication Artist"). Carried over from the Effect Index
  // person records; unrelated to the admin/editor/viewer authorization role.
  role: v.optional(v.string()),
  links: v.array(
    v.object({
      label: v.string(),
      url: v.string(),
    }),
  ),
  membershipEmail: v.optional(v.string()),
  // Partial curation of the contributor's replication grid. Listed replication
  // slugs render first, in exactly this order; everything else the contributor
  // owns follows in the existing default sort. Slugs that no longer resolve to
  // a `replications` row are pruned on write and ignored on read, so a deleted
  // replication cannot leave a hole in the ordering.
  replicationOrder: v.optional(v.array(v.string())),
  // Same partial-curation contract for the contributor's trip reports, against
  // `tripReports` slugs.
  reportOrder: v.optional(v.array(v.string())),
  // The contributor's opt-out from the public /replications gallery. Absent
  // means included; `false` is never stored (the write clears the field
  // instead). This gates only the gallery corpus read — effect-article
  // sections, substance showcases, profile pages, and permalinks still show
  // the works.
  exclude_from_gallery: v.optional(v.boolean()),
  // Staff-maintained memorial/showcase marker. Absent means a normal profile;
  // `false` is never stored (the write clears the field instead). Renders the
  // "Archival profile" notice on the public page. Admin-only write path
  // (`saveProfileAsEditor`); the self-serve save cannot touch it.
  archival: v.optional(v.boolean()),
  // Signed staff commentary ("Editor's note") rendered under the public bio.
  // Absent renders nothing. Admin-only write path, like `archival`.
  staffNote: v.optional(
    v.object({
      markdown: v.string(),
      attribution: v.optional(v.string()),
    }),
  ),
  createdAt: v.string(),
  updatedAt: v.string(),
  updatedBy: v.optional(v.string()),
});

// Lossless Effect Index source records retained for a future EI-specific
// deployment. This table is intentionally not part of any DoseWiki read path.
const effectIndexArchiveRecord = v.object({
  kind: v.string(),
  key: v.string(),
  payload: v.any(),
  importedAt: v.number(),
});

// Drug-class safety banner presets. One document per preset; the shared pure
// rules live in `src/data/substanceWarningBanners.ts` and are imported by both
// `convex/warningBanners.ts` and the /dev Banner Studio.
//
// `enabled` and `enabledSlugs` are the ONLY render inputs: a preset shows on an
// article iff `enabled === true` and `enabledSlugs` contains that slug. Nothing
// is derived from a substance's classification — free-text class strings are
// too noisy to assign safety copy (cocaine's `"Alkaloid (tropane)"` matches a
// deliriant rule; DXM's `"Morphinan (substituted)"` matches an opioid rule),
// so the opt-in is explicit and per-slug.
//
// Four columns were dropped and must not come back. `label` was a third name
// for a banner beside `key` and `headline`, and three names for one thing was
// the single largest source of confusion in the Studio; `key` is now both the
// identity and the editor-facing name. `priority` was a numeric tiebreak nobody
// could reason about under a two-banner cap, so ordering is tone then key.
// `links` is a removed feature. `candidateMatchers` was a search input
// persisted as state: `searchWarningBannerTargets` matches substance names and
// class strings live, so the stored copy only went stale.
//
// Every string a reader sees is stored here, so rewording a banner is an edit
// rather than a deploy.
const warningBannerPreset = v.object({
  key: v.string(),
  tone: v.union(v.literal("danger"), v.literal("unsafe"), v.literal("caution")),
  icon: v.string(),
  severityLabel: v.string(),
  headline: v.string(),
  points: v.array(v.string()),
  enabled: v.boolean(),
  enabledSlugs: v.array(v.string()),
  updatedAt: v.string(),
  updatedBy: v.optional(v.string()),
});

export default defineSchema({
  // Main substance index table - each document is a complete SubstanceArticle
  substanceIndex: defineTable(substanceArticle)
    .index("by_title", ["title"])
    .index("by_article_id", ["id"])
    .index("by_slug", ["slug"])
    .index("by_priority", ["priority"]),

  // Point-in-time ProtestKit snapshot keyed by canonical DoseWiki slug.
  reagentTests: defineTable(reagentTestDocumentValidator)
    .index("by_slug", ["slug"])
    .index("by_snapshot_hash", ["snapshotHash"]),

  // Changelog table - tracks all article changes
  changelog: defineTable(changelogEntry)
    .index("by_entry_id", ["entryId"])
    .index("by_created_at", ["createdAt"])
    .index("by_submitted_by", ["submittedBy"]),

  // Article source files - scraped content per substance (read-only after migration)
  articleSources: defineTable(articleSource)
    .index("by_slug", ["slug"]),

  // Prompts - editable system and section prompts
  prompts: defineTable(prompt)
    .index("by_key", ["key"]),

  // Quote documents - extracted quotes per substance per section
  quotes: defineTable(quote)
    .index("by_slug_section", ["slug", "section"])
    .index("by_section", ["section"]),

  citationEvidence: defineTable(citationEvidence)
    .index("by_slug", ["slug"])
    .index("by_slug_section", ["slug", "section"])
    .index("by_slug_claim", ["slug", "claimKey"])
    .index("by_status", ["status"]),

  // Successful reviewed section publications. The proposal ID index is the
  // idempotency boundary and the row is inserted in the article patch transaction.
  generatedPublicationOperations: defineTable(generatedPublicationOperation)
    .index("by_proposal_id", ["proposalId"])
    .index("by_slug_created", ["slug", "createdAt"]),

  // Trip reports - imported from EffectIndex
  tripReports: defineTable(tripReport)
    .index("by_slug", ["slug"])
    .index("by_featured", ["featured"]),

  // Private public-submission intake. Rows stay editor-only until promoted into tripReports.
  tripReportSubmissions: defineTable(tripReportSubmission)
    .index("by_status_created", ["status", "created_at"])
    .index("by_created_at", ["created_at"])
    .index("by_public_id", ["id"]),

  // Private per-article "report an issue / suggest an edit" intake. Editor-only; never rendered publicly.
  articleFeedback: defineTable(articleFeedback)
    .index("by_status_created", ["status", "created_at"])
    .index("by_created_at", ["created_at"])
    .index("by_public_id", ["id"])
    .index("by_substance", ["substance_slug", "created_at"]),

  // Private site-wide general feedback intake. Editor-only; never rendered publicly.
  siteFeedback: defineTable(siteFeedback)
    .index("by_status_created", ["status", "created_at"])
    .index("by_created_at", ["created_at"])
    .index("by_public_id", ["id"]),

  // Subjective effect articles - imported from EffectIndex
  subjectiveEffects: defineTable(subjectiveEffect)
    .index("by_slug", ["slug"])
    .index("by_featured", ["featured"]),

  // EffectIndex articles - intensity scales, substance analyses, methodology
  effectIndexArticles: defineTable(effectIndexArticle)
    .index("by_slug", ["slug"])
    // Writing tab listings: one kind, one status, newest publication date first.
    // Legacy rows carry neither `kind` nor `status`, so they sort under the
    // undefined prefix rather than under "article"/"published".
    .index("by_kind_status_date", ["kind", "status", "publicationDate"])
    .index("by_featured", ["featured"]),

  // Raw Effect Index people, profiles, and posts. Never render from this table.
  effectIndexArchive: defineTable(effectIndexArchiveRecord)
    .index("by_kind_key", ["kind", "key"]),

  // Video and image replications of effects
  replications: defineTable(replication)
    .index("by_effect", ["effect_slug"])
    .index("by_slug", ["slug"])
    .index("by_artist", ["artist"]),

  // One full dating/provenance dossier per replication. The compact date_info
  // summary lives on `replications`; this table keeps the evidence out of hot
  // gallery reads while remaining available for later editorial/public UI.
  replicationDateResearch: defineTable(replicationDateResearch)
    .index("by_replication_id", ["replication_id"]),

  // Per-substance Replication Showcase curation; see the validator's note.
  substanceGalleries: defineTable(substanceGallery)
    .index("by_substance", ["substance_slug"]),

  // Reusable named replication playlists, applied into a gallery's draft; see
  // the validator's note. Nothing here publishes on its own.
  replicationPlaylists: defineTable(replicationPlaylist)
    .index("by_key", ["key"]),

  memberships: defineTable(membership)
    .index("by_email", ["email"])
    .index("by_role", ["role"])
    .index("by_provider_account", ["provider", "providerAccountId"]),

  contributorProfiles: defineTable(contributorProfile)
    .index("by_key", ["key"])
    .index("by_membership_email", ["membershipEmail"]),

  // Category layout - stores the manually curated psychoactive index structure
  // as a single document containing the full layout configuration.
  // The public /substances page still reads this table; the index-layout save
  // route (src/app/api/save-to-convex/route.ts) mirrors indexLayouts writes
  // into it to keep the public read in sync. Durable fix: point public reads
  // at the indexLayouts table, then retire this mirror.
  categoryLayout: defineTable({
    version: v.number(),
    categories: v.array(v.object({
      key: v.string(),
      label: v.string(),
      iconKey: v.string(),
      sections: v.array(v.object({
        key: v.string(),
        label: v.string(),
        drugs: v.array(v.string()),  // Just slugs - names resolved client-side
      })),
      drugs: v.array(v.string()),    // Top-level drugs not in sections
      columns: v.optional(v.any()),  // Responsive column configuration
    })),
  }),

  // Site configuration - About page content and other global settings.
  // One document per well-known `key`; every payload field is optional because
  // a document only carries the fields its own key means.
  //
  //   "about"                              → aboutMarkdown / aboutSubtitle / founderProfileKeys
  //   "effect-index-featured-replications" → featuredReplicationSlugs
  //   "safety-banner-display"              → bannerIconSize
  //
  // The featured list lives here rather than as a `featured` column on
  // `replications` because it is an *ordered* editorial selection, not a
  // property of a row: the Effect Index carousel shows these slugs in this
  // order, and a per-row boolean cannot express the order. It also keeps the
  // homepage's read to one small document instead of a whole-table scan.
  siteConfig: defineTable({
    key: v.string(),
    aboutMarkdown: v.optional(v.string()),
    aboutSubtitle: v.optional(v.string()),
    founderProfileKeys: v.optional(v.array(v.string())),
    featuredReplicationSlugs: v.optional(v.array(v.string())),
    bannerIconSize: v.optional(v.number()),
    updatedAt: v.string(),
    updatedBy: v.optional(v.string()),
  }).index("by_key", ["key"]),

  // Editable site copy. One document per copy block: the prose that public
  // pages used to hardcode, lifted into Convex so the /dev Copy Studio can edit
  // it without a deploy. `key` is the stable lookup id used by the server read
  // helper; `flavor` scopes a block to one site skin (e.g. "effect-index") and
  // is absent for blocks shared by every flavor.
  //
  // `kind` picks which payload field is authoritative:
  //   "markdown" | "plain" → `body`
  //   "list"               → `items`
  // `label` and `group` are editor-facing only; they drive the Copy Studio rail
  // and never reach a reader.
  copyBlocks: defineTable({
    key: v.string(),
    flavor: v.optional(v.string()),
    kind: v.union(v.literal("markdown"), v.literal("plain"), v.literal("list")),
    body: v.optional(v.string()),
    items: v.optional(v.array(v.string())),
    label: v.string(),
    group: v.string(),
    updatedAt: v.string(),
    updatedBy: v.optional(v.string()),
  })
    .index("by_key", ["key"])
    .index("by_group", ["group"]),

  // Drug-class safety banner presets; see the validator's note. Opt-in only:
  // `enabled` plus an explicit `enabledSlugs` entry is the whole render rule.
  warningBannerPresets: defineTable(warningBannerPreset).index("by_key", ["key"]),

  // Canonical molecule depictions for public substance/class pages and the /dev
  // Molecules editor. One document per slug. `svg` is the live brand-palette
  // display asset; `molblock` is the re-editable source (coords + stereo).
  // Static /molecules/*.svg files are retained only as a read fallback.
  moleculeOverrides: defineTable({
    slug: v.string(),
    svg: v.string(),
    molblock: v.string(),
    smiles: v.optional(v.string()),
    // Bond indices (into the molblock's bond block) drawn with the bold line
    // weight in every renderer. Absent/empty means no bold bonds.
    boldBonds: v.optional(v.array(v.number())),
    source: v.optional(
      v.union(v.literal("seeded"), v.literal("editor"), v.literal("template")),
    ),
    updatedAt: v.string(),
    updatedBy: v.optional(v.string()),
  }).index("by_slug", ["slug"]),

  // Editor-authored plain-scaffold orientation templates. These are separate
  // from both substance/class depiction overrides and public generic class
  // structures; saving one never changes a published molecule.
  moleculeClassTemplates: defineTable({
    classKey: v.string(),
    molblock: v.string(),
    // Bond indices drawn with the bold line weight while editing the template.
    // Editor-only cosmetics: applies copy coordinates, never bold, to members.
    boldBonds: v.optional(v.array(v.number())),
    updatedAt: v.number(),
    updatedBy: v.optional(v.string()),
  }).index("by_class_key", ["classKey"]),

  // Index layouts - stores all category/classification index definitions
  // Replaces the bundled JSON files in src/data/indexes/
  indexLayouts: defineTable({
    type: v.union(v.literal("psychoactive"), v.literal("chemical"), v.literal("mechanism")),
    version: v.number(),
    categories: v.array(v.object({
      key: v.string(),
      label: v.string(),
      iconKey: v.string(),
      notes: v.optional(v.string()),
      columns: v.optional(v.any()),
      drugs: v.array(v.string()),
      sections: v.array(v.object({
        key: v.string(),
        label: v.string(),
        notes: v.optional(v.string()),
        link: v.optional(v.object({
          type: v.union(v.literal("chemicalClass"), v.literal("psychoactiveClass"), v.literal("mechanism")),
          value: v.string(),
        })),
        drugs: v.array(v.string()),
      })),
    })),
  }).index("by_type", ["type"]),
});
