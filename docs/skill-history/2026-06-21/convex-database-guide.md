# Convex Database Guide

> **⚠️ MAINTENANCE REQUIREMENT:** This skill file MUST be updated whenever changes are made to Convex that affect:
> - Table schemas or indexes
> - Queries or mutations (new, modified, or removed)
> - Migration scripts or sync workflows
> - Frontend hooks or providers
> - Dev/prod sync procedures
>
> **If you modify Convex code, update this document before finishing your task.**

This skill provides comprehensive documentation for working with Convex in the DoseWiki codebase.

---

## Table of Contents

1. [Data Location Summary](#data-location-summary)
2. [Quick Reference](#quick-reference)
3. [Architecture Overview](#architecture-overview)
4. [Database Schema](#database-schema)
5. [Convex Functions by File](#convex-functions-by-file)
6. [Frontend Integration](#frontend-integration)
7. [Migration Scripts](#migration-scripts)
8. [Dev vs Production](#dev-vs-production)
9. [Authentication](#authentication)
10. [Common Patterns](#common-patterns)
11. [Performance Optimization](#performance-optimization-lazy-library-loading)
12. [Troubleshooting](#troubleshooting)
13. [General Convex Development Reference](#general-convex-development-reference)

---

## Data Location Summary

**All major content data (~26 MB) is now in Convex and loaded at runtime:**

| Data | Size | Location | Notes |
|------|------|----------|-------|
| Substance articles (679) | ~5 MB | ✅ Convex | `substanceIndex` table |
| Article sources (682) | ~21 MB | ✅ Convex | `articleSources` table - DevMode loads from Convex |
| Index layouts (3) | ~107 KB | ✅ Convex | `indexLayouts` table - psychoactive/chemical/mechanism |
| Trip reports (164) | — | ✅ Convex | `tripReports` table |
| Subjective effects (233) | — | ✅ Convex | `subjectiveEffects` table |
| Category layout | ~14 KB | ✅ Convex | `categoryLayout` table (deprecated, use indexLayouts) |
| Prompts | — | ✅ Convex | `prompts` table |
| Quotes | — | ✅ Convex | `quotes` table |
| Replications | — | ✅ Convex | `replications` table |

**Small config files still bundled (~170 KB total):**
- Config files (~100 KB) - tag options, icons, favicons
- Drug class content (~15 KB) - hallucinogen category pages
- About page content (~10 KB)
- Route synonyms (~50 KB)

**Note:** Index definitions (psychoactive/chemical/mechanism) were moved to Convex `indexLayouts` table, saving ~107 KB from the bundle.

**Files on disk only (not bundled, used by scripts):**
- `SubstanceIndex.json` (5 MB) - backup/scripts
- `parsed-sources.json` (16 MB) - parsing scripts
- `tripsit-combos.json` (496 KB) - interaction scripts

## Quick Reference

### Common Commands

```bash
# Start Convex dev server (required for local development)
bunx convex dev

# View Convex dashboard
bunx convex dashboard

# Run a query/mutation against dev
bunx convex run articles:getAll

# Run against production
bunx convex run articles:getAll --prod

# Load admin key for authenticated operations (required for sync scripts)
export CONVEX_ADMIN_KEY=$(grep "^CONVEX_ADMIN_KEY=" .env.local | cut -d= -f2-)

# Compare local prompts with Convex before syncing (to avoid overwriting improvements)
VITE_CONVEX_URL="https://enchanted-echidna-791.convex.cloud" node scripts/migrate/compare-prompts.mjs

# Sync prompts to dev Convex
VITE_CONVEX_URL="https://enchanted-echidna-791.convex.cloud" node scripts/migrate/migrate-prompts-to-convex.mjs

# Then sync to production
TARGET_CONVEX_URL=https://glad-minnow-656.convex.cloud node scripts/convex/sync-convex-to-production.mjs --tables=prompts
```

### Admin CLI (Authenticated Mutations)

For running authenticated mutations from the command line without using the Convex dashboard:

```bash
# Query (no auth needed) - use --query flag
node scripts/admin/convex-admin.mjs tripReports:getAuthorNames --query
node scripts/admin/convex-admin.mjs tripReports:getByAuthor '{"authorName":"Anonymous"}' --query

# Mutation on dev (auto-injects API key from .env.local)
node scripts/admin/convex-admin.mjs tripReports:renameAuthor '{"oldName":"Foo","newName":"Bar"}'
node scripts/admin/convex-admin.mjs tripReports:deleteById '{"id":"abc123"}'

# Mutation on prod (add --prod flag)
node scripts/admin/convex-admin.mjs tripReports:deleteById '{"id":"abc123"}' --prod

# Help
node scripts/admin/convex-admin.mjs --help
```

**Note:** The admin CLI reads `CONVEX_ADMIN_KEY` from `.env.local` and automatically injects it into mutation calls. This key must also be set in the Convex dashboard for both dev and prod deployments.

### Environment Variables

```bash
# .env.local
VITE_CONVEX_URL=https://enchanted-echidna-791.convex.cloud
CONVEX_DEPLOYMENT=dev:enchanted-echidna-791
CONVEX_ADMIN_KEY=<your-admin-key>  # Required for batch scripts
```

**Note:** `CONVEX_ADMIN_KEY` must also be set in the Convex dashboard (Settings > Environment Variables) for both dev and prod deployments.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                         Frontend                                 │
│  src/app + src/features/dev → server helpers/client Convex hooks │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Convex Cloud                                  │
│  convex/*.ts functions → schema.ts tables                       │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                   Migration Scripts                              │
│  scripts/migrate-*.mjs → ConvexHttpClient                       │
└─────────────────────────────────────────────────────────────────┘
```

**Key Pattern:** Convex is required - the app shows an error if `VITE_CONVEX_URL` is not configured.

---

## Database Schema

### Tables

| Table | Purpose | Key Index |
|-------|---------|-----------|
| `substanceIndex` | Substance articles (679) | `by_article_id`, `by_slug`, `by_priority` |
| `articleSources` | Scraped source content (~21MB) | `by_slug` |
| `indexLayouts` | Category indexes (psychoactive/chemical/mechanism) | `by_type` |
| `tripReports` | Trip reports (164) | `by_slug` |
| `subjectiveEffects` | Effect articles (233) | `by_slug` |
| `effectIndexArticles` | Archived articles (4) | `by_slug` |
| `siteConfig` | About page content | `by_key` |
| `prompts` | AI generator prompts (12) | `by_key` |
| `quotes` | Extracted source quotes (2700+) | `by_slug_section` |
| `changelog` | Modification history | `by_entry_id` |
| `replications` | Video/image replications (284) | `by_effect` |
| `categoryLayout` | **@deprecated** - use `indexLayouts` | (single doc) |

### Schema File

`convex/schema.ts` defines all tables. Key points:
- Uses `v.any()` for nested content (flexible)
- Frontend Zod schema (`src/schema/substance.schema.ts`) is the validation source of truth
- All tables have appropriate indexes for query patterns

### Notable Schema Structures

**harm_potential (Updated Jan 2026):**

The `harm_potential` section uses structured severity levels for addiction, dependence, psychosis, and seizure:

```typescript
harm_potential: {
  addiction: {
    psychological: { level: RiskLevel | null, description: string },
    physical_dependence: { level: RiskLevel | null, description: string }
  },
  toxicity: {
    lethal_dosage: {  // NEW nested structure (Jan 2026)
      notes: string,  // Freeform text for approximate lethal doses, human case reports
      ld50: Array<{ species, route, value, unit }>  // Formal LD50 data from studies
    },
    ld50: Array<...>,  // Legacy field - kept for backward compatibility
    organ_toxicity: Array<{ system, findings, mechanism, notes }>,
    carcinogenicity: { level: CarcinogenicityLevel | null, evidence?, description },
    antibiotic_function: { level: AntibioticLevel | null, description }
  },
  psychosis: { level: RiskLevel | null, description: string },  // Top-level
  seizure: { level: RiskLevel | null, description: string }     // Top-level
}

// RiskLevel: "extremely_low" | "low" | "moderate" | "high" | "extremely_high"
// CarcinogenicityLevel: "confirmed" | "probable" | "possible" | "no_evidence" | "unknown"
```

**lethal_dosage structure:**
- `notes`: Freeform text for approximate lethal doses, human case reports, informal estimates
- `ld50`: Array for formal LD50 data from controlled human or animal studies
- UI displays notes above the LD50 table (if both present)
- Card title is "Lethal Dosage" (not "LD50")

**Removed from old schema:**
- `risks` wrapper (psychosis/seizure moved to top level)
- `risks.self_harm`
- `risks.other`
- `toxicity.other`

The UI component handles both old and new schema formats for backward compatibility. See `src/features/article/components/sections/harm-potential/`.

**Trip report license (Jun 2026):**

`tripReports` documents carry an optional `license` field (`convex/tripReportContract.ts` → `storedTripReportValidator`):
- Absent / unrecognized → treated as `"author-retained"` (legacy reports donated/emailed over the years; rights stay with the original author — "up to the author"). The UI defaults to this, so existing rows need **no backfill**.
- `"public-domain"` → CC0. Set automatically by `tripReportSubmissions.promote` (`buildPromotionPayload`) when an editor promotes a public submission; the submission form's `publish_consent` copy dedicates the report to the public domain.

Resolve in the frontend with `resolveTripReportLicense()` from `src/types/tripReport.ts`; the marker renders in `ReportHeroSection`. Optional explicit backfill of existing rows to `"author-retained"` is not required (the display default covers it); if you do patch rows, re-sync prod with `--tables=tripReports`. The license model is documented for the public at `/docs/license` (`public/docs/license.html`).

---

## Convex Functions by File

### convex/substanceIndex.ts

```typescript
// Queries (no auth required)
api.substanceIndex.getAll()                      // All articles (heavy - 5MB)
api.substanceIndex.getById({ id: number })       // By article.id (not _id)
api.substanceIndex.getByTitle({ title: string })
api.substanceIndex.getBySlug({ slug: string })   // Single article by slug (fast)
api.substanceIndex.getSlugNameMap()              // Lightweight lookup (~20KB)
api.substanceIndex.getRandomSample({ count, seed })  // Random high-priority articles (optimized)

// Mutations (require auth - JWT or apiKey)
api.substanceIndex.saveSubstance({ apiKey?, article })           // Upsert single (auto-sets slug)
api.substanceIndex.saveSubstances({ apiKey?, articles: [] })     // Batch upsert
api.substanceIndex.deleteSubstance({ apiKey?, id: number })

// ⚠️ Internal mutations (NOT callable from scripts/HTTP clients)
// Use saveSubstances instead for script-based sync
internal.substanceIndex.replaceAllSubstances({ articles })  // Destructive replace
```

### convex/categoryLayout.ts

```typescript
// Queries (no auth required)
api.categoryLayout.get()                         // Get the category layout (single doc)

// Mutations (require auth - JWT or apiKey)
api.categoryLayout.save({ apiKey?, version, categories }) // Save/update category layout
api.categoryLayout.clear({ apiKey? })                     // Delete category layout
```

### convex/prompts.ts

```typescript
// Queries (no auth required)
api.prompts.getByKey({ key: string })    // "generator" or "section_harm_potential"
api.prompts.getAll()

// Mutations (require auth - JWT or apiKey)
api.prompts.save({ apiKey?, key, content, updatedBy })
api.prompts.deleteByKey({ apiKey?, key })
api.prompts.bulkImport({ apiKey?, prompts: [], updatedBy })
```

### convex/quotes.ts

```typescript
// Queries (no auth required)
api.quotes.getBySlugAndSection({ slug, section })  // e.g., "lsd", "harm_potential"
api.quotes.getBySlug({ slug })                     // All quotes for substance
api.quotes.getBySection({ section })               // All quotes for section type

// Mutations (require auth - JWT or apiKey)
api.quotes.save({ apiKey?, slug, section, content, updatedBy })
api.quotes.bulkImport({ apiKey?, quotes: [], updatedBy })
```

### convex/tripReports.ts

```typescript
// Queries
api.tripReports.getAll()
api.tripReports.getBySlug({ slug })
api.tripReports.getFeatured()
api.tripReports.getBySubstance({ substanceName })
api.tripReports.getBySubstanceNames({ substanceNames: [] })  // Batch query
api.tripReports.getSubstanceNames()               // Unique list
api.tripReports.getAuthorNames()                  // Unique author list
api.tripReports.getByAuthor({ authorName })

// Mutations (require auth - JWT or apiKey)
api.tripReports.deleteById({ apiKey?, id })       // Delete single report
api.tripReports.renameAuthor({ apiKey?, oldName, newName })

// Internal mutations (not exposed to clients)
internal.tripReports.bulkImport({ reports: [] })
internal.tripReports.deleteAll()
```

### convex/subjectiveEffects.ts

```typescript
// Queries
api.subjectiveEffects.getAll()
api.subjectiveEffects.getBySlug({ slug })
api.subjectiveEffects.getFeatured()
api.subjectiveEffects.getByCategory({ category }) // "sensory", "cognitive", etc.
api.subjectiveEffects.getByTags({ tags: [] })     // Effects with ALL tags
api.subjectiveEffects.getByAnyTag({ tags: [] })   // Effects with ANY tag
api.subjectiveEffects.getAllTags()

// Mutations
api.subjectiveEffects.update({ slug, updates })

// Internal mutations (not exposed to clients)
internal.subjectiveEffects.bulkImport({ effects: [] })
internal.subjectiveEffects.deleteAll()
```

### convex/replications.ts

```typescript
// Queries
api.replications.getAll()
api.replications.getBySlug({ slug })
api.replications.getReplicationsByEffect({ effect_slug })
api.replications.getByArtist({ artist })

// Mutations
api.replications.generateUploadUrl()              // For file uploads
api.replications.insertReplication({ ... })
api.replications.updateGalleryOrder({ effect_slug, replication_slugs })
api.replications.deleteBySlug({ slug })
api.replications.updateEffectSlug({ slug, effect_slug })
api.replications.updateUrl({ id, url, thumbnail_url })
api.replications.updateStorageIds({ id, storage_id, thumbnail_storage_id })

// Internal mutations (not exposed to clients)
internal.replications.bulkImport({ replications: [] })
internal.replications.deleteAll()
```

### convex/articleSources.ts

```typescript
// Queries (no auth required)
api.articleSources.getBySlug({ slug })            // Get full source content for one substance
api.articleSources.getSubstanceList({ cursor?, limit? })  // Paginated metadata (no content)

// Mutations (require auth - JWT or apiKey)
api.articleSources.bulkImport({ apiKey?, sources: [] })    // Batch import
api.articleSources.importOne({ apiKey?, slug, substanceName, sources, contents })
```

**Note:** Article sources (~21MB total) are loaded from Convex at runtime, not bundled. The `getSubstanceList` query uses pagination to avoid the 16MB read limit.

### convex/indexLayouts.ts

```typescript
// Queries
api.indexLayouts.getByType({ type })              // "psychoactive" | "chemical" | "mechanism"
api.indexLayouts.getAll()                         // All three layouts

// Mutations
api.indexLayouts.save({ type, version, categories })
api.indexLayouts.bulkImport({ layouts: [] })
api.indexLayouts.deleteByType({ type })
```

**Note:** Index layouts define the category structure for the home page and classification pages. Loaded at runtime via `useIndexLayouts` hook, parsed through `parseManualConfig` to add normalized fields.

### convex/siteConfig.ts

```typescript
// Queries (no auth required)
api.siteConfig.getAbout()                         // Get About page content

// Mutations (require auth - JWT or apiKey)
api.siteConfig.saveAbout({ apiKey?, aboutMarkdown, aboutSubtitle, founderProfileKeys, updatedBy })
```

**Note:** Stores About page content. Accessed via `useAboutConfig` hook.

### convex/changelog.ts

```typescript
// Queries (no auth required)
api.changelog.getAll()                            // All entries (sorted by createdAt desc)
api.changelog.getRecent({ limit? })               // Recent entries with optional limit

// Mutations (require auth - JWT or apiKey)
api.changelog.addEntry({ apiKey?, entryId, createdAt, message, markdown, submittedBy, articles })
api.changelog.deleteEntry({ apiKey?, entryId })
```

### convex/effectIndexArticles.ts

```typescript
// Queries (no auth required)
api.effectIndexArticles.getAll()
api.effectIndexArticles.getBySlug({ slug })
api.effectIndexArticles.getByTag({ tag })

// Mutations (require auth - JWT or apiKey)
api.effectIndexArticles.bulkImport({ apiKey?, articles: [] })
```

---

## Frontend Integration

### Core Module: src/lib/convex.tsx

```typescript
import { isConvexEnabled, ConvexProvider } from "../lib/convex";

// Check if Convex is configured
if (isConvexEnabled()) {
  // Use Convex queries
}
```

### Custom Hooks

```typescript
// Lazy library loading (used internally by LazySubstanceIndexProvider)
import { useLazyLibrary } from "../hooks/useLazyLibrary";
const { library, isLoading, isReady, isEmpty } = useLazyLibrary(enabled);
// - library: LibraryData | null
// - isLoading: true while Convex query in progress
// - isReady: true when library built successfully
// - isEmpty: true if query returned no data

// Per-article loading (fetches single article on-demand)
import { useSubstanceArticle, useSubstanceLookup } from "../hooks/useSubstanceArticle";
const { article, isLoading, notFound } = useSubstanceArticle("lsd");
const { lookup, substances } = useSubstanceLookup(); // Lightweight slug-name map

// Category layout (for home page)
import { useCategoryLayout } from "../hooks/useCategoryLayout";
const { layout, isLoading, exists } = useCategoryLayout();

// Articles (legacy - loads all articles)
import { useConvexArticles, useSaveConvexArticle } from "../hooks/useConvexArticles";

// Prompts (Convex only, no fallback)
import { useSectionPrompt, useGeneratorPrompt } from "../hooks/usePrompts";

// Quotes (with static file fallback)
import { useQuote, useHarmPotentialQuote } from "../hooks/useQuotes";

// Effects
import { useSubjectiveEffects, useSubjectiveEffect } from "../hooks/useSubjectiveEffects";

// Article Sources (for DevMode - loads from Convex, not bundled)
import { useSubstanceSourceList, loadSubstanceSourcesFromConvex } from "../hooks/useArticleSources";
const { substances, isLoading, error } = useSubstanceSourceList();  // Paginated list
const module = await loadSubstanceSourcesFromConvex("lsd");         // Load single substance's sources

// Index Layouts (category structure - loads from Convex, not bundled)
import { useIndexLayouts } from "../hooks/useIndexLayouts";
const { configs, isLoading } = useIndexLayouts(enabled);
// configs.psychoactive, configs.chemical, configs.mechanism
// Each is NormalizedManualIndexConfig with categoryMap, normalized sections, etc.
```

### Sync Context

`src/context/ConvexSyncContext.tsx` provides debounced article syncing:

```typescript
import { useConvexSync } from "../context/ConvexSyncContext";

const { syncStatus, syncArticles, syncNow } = useConvexSync();
// syncStatus: "idle" | "pending" | "syncing" | "synced" | "error"
```

### DevMode Context

`src/features/dev/context/DevModeContext.tsx` manages article editing state:

```typescript
import { useDevMode } from "../context/DevModeContext";

const {
  articles,              // Current article state (editable copy)
  updateArticleAt,       // Update single article (sets hasLocalEdits=true)
  getOriginalArticles,   // Get fresh original articles from ref
  markChangesSaved,      // Reset hasLocalEdits flag after successful save
  // ... other functions
} = useDevMode();
```

**Key behavior:**
- `articles` state syncs from Convex when library loads
- `hasLocalEditsRef` prevents sync effect from overwriting user edits
- After saving to Convex, call `markChangesSaved()` to:
  1. Reset `hasLocalEditsRef` to `false`
  2. Update `originalArticlesRef` with current articles (new baseline)

---

## Migration Scripts

Scripts are organized in `scripts/convex/` and `scripts/migrate/`:

| Script | Purpose | Command |
|--------|---------|---------|
| `sync-convex-to-production.mjs` | **Sync dev→prod (supports --tables flag)** | `TARGET_CONVEX_URL=https://glad-minnow-656.convex.cloud node scripts/convex/sync-convex-to-production.mjs` |
| `export-convex-to-json.mjs` | Export Convex to local backup artifacts | `node scripts/convex/export-convex-to-json.mjs` |
| `convex-import-substance-index.mjs` | Historical import path; prefer current migration/sync scripts when available | `node scripts/convex/convex-import-substance-index.mjs` |
| `compare-prompts.mjs` | Compare local prompts with Convex before syncing | `VITE_CONVEX_URL=... node scripts/migrate/compare-prompts.mjs` |
| `migrate-prompts-to-convex.mjs` | Sync prompt files to dev Convex | `VITE_CONVEX_URL=... node scripts/migrate/migrate-prompts-to-convex.mjs` |
| `migrate-quotes-to-convex.mjs` | Sync extracted quotes | `node scripts/migrate/migrate-quotes-to-convex.mjs` |
| `migrate-trip-reports.mjs` | Import trip reports | `node scripts/migrate/migrate-trip-reports.mjs <path>` |
| `migrate-effects.mjs` | Import effects | `node scripts/migrate/migrate-effects.mjs <effects.json> <replications.json>` |
| `migrate-sources-to-convex.mjs` | Import article sources (~21MB) | `node scripts/migrate/migrate-sources-to-convex.mjs` |
| `migrate-add-slugs.mjs` | Add slug field to existing substances | `VITE_CONVEX_URL=... node scripts/migrate/migrate-add-slugs.mjs` |
| `seed-index-layouts.mjs` | Seed index layouts | `VITE_CONVEX_URL=... node scripts/seed/seed-index-layouts.mjs` |

### Running Migrations

```bash
# Load admin key (required for authenticated sync operations)
export CONVEX_ADMIN_KEY=$(grep "^CONVEX_ADMIN_KEY=" .env.local | cut -d= -f2-)

# Compare local prompts with Convex BEFORE syncing (to avoid overwriting improvements)
VITE_CONVEX_URL="https://enchanted-echidna-791.convex.cloud" node scripts/migrate/compare-prompts.mjs

# Push prompts to dev Convex
VITE_CONVEX_URL="https://enchanted-echidna-791.convex.cloud" node scripts/migrate/migrate-prompts-to-convex.mjs

# Then sync to production (targeted)
TARGET_CONVEX_URL=https://glad-minnow-656.convex.cloud node scripts/convex/sync-convex-to-production.mjs --tables=prompts

# Full sync to production (all tables)
TARGET_CONVEX_URL=https://glad-minnow-656.convex.cloud node scripts/convex/sync-convex-to-production.mjs
```

### Migration Pattern

All migrations follow this pattern:

```javascript
import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api.js";

const client = new ConvexHttpClient(process.env.CONVEX_URL);
const result = await client.mutation(api.tableName.bulkImport, {
  items: [...],
  updatedBy: "migration-script"
});

// Result: { created: N, updated: N, errors: [] }
```

---

## Dev vs Production

### ⚠️ CRITICAL: Two Separate Convex Deployments

**DoseWiki uses TWO different Convex databases:**

| Environment | Convex URL | Purpose |
|-------------|------------|---------|
| **Local Dev** | `https://enchanted-echidna-791.convex.cloud` | Development, batch generation |
| **Vercel Prod** | `https://glad-minnow-656.convex.cloud` | Production site |

**Common Issue:** Data appears on dev server but NOT on production because batch scripts write to the dev database, while Vercel reads from the prod database.

### Checking Current Deployment

```bash
# See local dev deployment
cat .env.local | grep CONVEX

# Output:
# VITE_CONVEX_URL=https://enchanted-echidna-791.convex.cloud
# CONVEX_DEPLOYMENT=dev:enchanted-echidna-791

# Production uses glad-minnow-656 (set in Vercel env vars)
```

### Running Commands Against Production

```bash
# Query production
bunx convex data prompts --prod

# Run mutation against production
bunx convex run prompts:bulkImport --prod '{"prompts": [...], "updatedBy": "sync"}'

# View production data
bunx convex data articles --prod | head -20
```

### Syncing Dev to Production

**Full sync (all tables):**

```bash
TARGET_CONVEX_URL=https://glad-minnow-656.convex.cloud node scripts/convex/sync-convex-to-production.mjs
```

**Targeted sync (specific tables only):**

```bash
# Sync only prompts (fast - use after editing prompt files)
TARGET_CONVEX_URL=https://glad-minnow-656.convex.cloud node scripts/convex/sync-convex-to-production.mjs --tables=prompts

# Sync multiple specific tables
TARGET_CONVEX_URL=https://glad-minnow-656.convex.cloud node scripts/convex/sync-convex-to-production.mjs --tables=prompts,quotes

# Sync substances and prompts
TARGET_CONVEX_URL=https://glad-minnow-656.convex.cloud node scripts/convex/sync-convex-to-production.mjs --tables=substanceIndex,prompts
```

**Available tables for `--tables` flag:**
- `substanceIndex` - Substance articles (679)
- `categoryLayout` - Home page layout
- `siteConfig` - About page content
- `indexLayouts` - Category indexes (3)
- `tripReports` - Trip reports (164)
- `subjectiveEffects` - Effect articles (233)
- `effectIndexArticles` - Archived articles (4)
- `prompts` - AI generation prompts (12)
- `quotes` - Extracted source quotes (2700+)
- `replications` - Effect media (284)

**Run full sync after batch generation. Use targeted sync for quick updates.**

### Export to JSON (Backup)

Export substance data to a local JSON file for backup:

```bash
node scripts/export-convex-to-json.mjs
```

Note: The app requires Convex - there is no static file fallback.

### Syncing Prompts Only

The simplest way to sync prompts after editing `src/data/config/sectionPrompts/*.md`:

```bash
# 1. Push prompts to dev Convex (reads from local files)
VITE_CONVEX_URL="https://enchanted-echidna-791.convex.cloud" node scripts/migrate/migrate-prompts-to-convex.mjs

# 2. Sync only prompts to production (fast, ~2 seconds)
TARGET_CONVEX_URL=https://glad-minnow-656.convex.cloud node scripts/convex/sync-convex-to-production.mjs --tables=prompts
```

This is much faster than a full sync when you've only edited prompt files.

---

## Authentication

### Overview

All Convex **mutations** require authentication. **Queries** are public (read-only).

Authentication is handled by `convex/lib/auth.ts` with two methods:

1. **JWT Authentication** - For frontend users signed in via WorkOS AuthKit
2. **API Key Authentication** - For batch scripts and automated processes

### How It Works

```typescript
// In a mutation handler:
import { requireAuth } from "./lib/auth";

export const myMutation = mutation({
  args: {
    apiKey: v.optional(v.string()),  // Optional - for scripts
    // ... other args
  },
  handler: async (ctx, args) => {
    // This will:
    // 1. Check if apiKey is provided and valid (for scripts)
    // 2. Otherwise, check for JWT identity (for frontend users)
    // 3. Throw AuthError if neither succeeds
    await requireAuth(ctx, args.apiKey);

    // ... mutation logic
  },
});
```

### For Frontend Code

Frontend calls don't need to pass `apiKey` - they authenticate via JWT from WorkOS:

```typescript
// React component - JWT auth happens automatically
const saveArticle = useMutation(api.substanceIndex.saveSubstance);
await saveArticle({ article: myArticle });  // No apiKey needed
```

### For Batch Scripts

Scripts must pass `CONVEX_ADMIN_KEY` as the `apiKey` parameter:

```javascript
// In batch script
const adminKey = process.env.CONVEX_ADMIN_KEY;
if (!adminKey) {
  console.error("Error: CONVEX_ADMIN_KEY required");
  process.exit(1);
}

const result = await client.mutation(api.substanceIndex.saveSubstances, {
  apiKey: adminKey,  // Required for scripts
  articles: batch,
});
```

### Setting Up CONVEX_ADMIN_KEY

1. **In Convex Dashboard** (Settings > Environment Variables):
   - Dev: `https://dashboard.convex.dev/d/enchanted-echidna-791`
   - Prod: `https://dashboard.convex.dev/d/glad-minnow-656`
   - Add `CONVEX_ADMIN_KEY` with a secure value

2. **In `.env.local`** (for batch scripts):
   ```bash
   CONVEX_ADMIN_KEY=<your-admin-key>
   ```

### Security Notes

- **Never commit** `CONVEX_ADMIN_KEY` to version control
- The auth system uses timing-safe comparison to prevent timing attacks
- Unauthenticated requests always fail - there is no dev mode bypass
- Internal mutations (`internalMutation`) are not exposed to clients at all

### ⚠️ CRITICAL: `internalMutation` vs `mutation`

**`internalMutation` CANNOT be called from HTTP clients (like `ConvexHttpClient`).**

```typescript
// This is an internalMutation - NOT callable from scripts
export const replaceAllSubstances = internalMutation({ ... });

// This is a public mutation - callable from scripts with apiKey
export const saveSubstances = mutation({
  args: { apiKey: v.optional(v.string()), articles: v.array(...) },
  handler: async (ctx, args) => {
    requireAuth(ctx, args.apiKey);  // Requires auth
    // ...
  }
});
```

**From scripts, you can ONLY call:**
- `query` - public reads (no auth needed)
- `mutation` - public writes (needs `apiKey` param if function uses `requireAuth`)

**You CANNOT call from scripts:**
- `internalMutation` - only callable from other Convex functions or admin CLI
- `internalQuery` - same restriction
- `internalAction` - same restriction

**If a script fails with "Server Error" or "Could not find public function":**
1. Check if the function is `internalMutation` vs `mutation`
2. If internal, find or create a public `mutation` equivalent
3. Pass `apiKey: process.env.CONVEX_ADMIN_KEY` for authenticated mutations

---

## Common Patterns

### Upsert Pattern (used in all mutations)

```typescript
const existing = await ctx.db.query("table")
  .withIndex("by_key", q => q.eq("key", value))
  .first();

if (existing) {
  await ctx.db.patch(existing._id, updates);
  return { updated: true, id: existing._id };
} else {
  const id = await ctx.db.insert("table", data);
  return { updated: false, id };
}
```

### Bulk Import Return Value

```typescript
{
  created: number,   // New records inserted
  updated: number,   // Existing records updated
  errors: string[]   // Any errors encountered
}
```

---

## Troubleshooting

### ⚠️ Data shows on dev but NOT on production

**This is the most common issue.** Dev and prod use different Convex databases.

**Diagnosis:**
```bash
# Check what Vercel is using
# Go to Vercel → Project Settings → Environment Variables → VITE_CONVEX_URL
# It should be: https://glad-minnow-656.convex.cloud

# Check what local dev is using
cat .env.local | grep VITE_CONVEX_URL
# Output: https://enchanted-echidna-791.convex.cloud
```

**Solution - Sync dev → prod:**
```bash
TARGET_CONVEX_URL=https://glad-minnow-656.convex.cloud node scripts/convex/sync-convex-to-production.mjs
```

**Alternative - Use same database:**
Change Vercel's `VITE_CONVEX_URL` to `https://enchanted-echidna-791.convex.cloud`

### ⚠️ Syncing individual articles between dev/prod

**Problem:** When syncing a single article from dev to prod, you get an ID mismatch error:
```
Provided document ID "k979..." doesn't match '_id' field "kd7b..."
```

**Cause:** Dev and prod have different `_id` values for the same article (by slug).

**Solution:** Fetch the prod version, update only the fields you need, save back:

```javascript
const devClient = new ConvexHttpClient('https://enchanted-echidna-791.convex.cloud');
const prodClient = new ConvexHttpClient('https://glad-minnow-656.convex.cloud');

// Get article from dev (for updated content)
const devArticle = await devClient.query(api.substanceIndex.getBySlug, { slug: 'ketamine' });

// Get article from prod (to preserve its _id)
const prodArticle = await prodClient.query(api.substanceIndex.getBySlug, { slug: 'ketamine' });

// Update only the fields you need
prodArticle.harm_potential = devArticle.harm_potential;

// Save back to prod
await prodClient.mutation(api.substanceIndex.saveSubstances, { articles: [prodArticle] });
```

**Never do this:**
```javascript
// WRONG - will fail due to _id mismatch
const devArticle = await devClient.query(api.substanceIndex.getBySlug, { slug: 'ketamine' });
await prodClient.mutation(api.substanceIndex.saveSubstances, { articles: [devArticle] });
```

### DevMode shows "Loading articles..." forever

**Symptoms:** Clicking DevTools from menu shows spinner that never resolves.

**Debug:** Check browser console for these logs:
```
[LazySubstanceIndexProvider] pushState intercepted, new path: /dev/articles
[LazySubstanceIndexProvider] Route change - path: /dev/articles needsLibrary: true
[useLazyLibrary] enabled: true
[useLazyLibrary] convexArticles: array(577)
[DevModeProvider] useLibrary() returned articles: 577
```

**Common causes:**

1. **Route detection not firing** - Check for `pushState intercepted` log
   - Fix: Ensure `LazySubstanceIndexProvider` intercepts `history.pushState`

2. **Convex query not returning** - Check for `convexArticles: undefined (loading)` stuck
   - Fix: Ensure `bunx convex dev` is running
   - Check: Network tab for `getAll` query

3. **Library not propagating** - `DevModeProvider` shows 0 articles but `useLazyLibrary` shows 577
   - This was a bug where `DevModeContext` had duplicate `useLazyLibrary` calls
   - Fix: `DevModeContext` should use `useLibrary()` from `SubstanceIndexProvider`, not its own `useLazyLibrary`

### "Convex not configured" error on app load

**Convex is required.** The app will show an error screen if `VITE_CONVEX_URL` is not set.

```bash
# Ensure .env.local has the URL
echo 'VITE_CONVEX_URL=https://enchanted-echidna-791.convex.cloud' >> .env.local

# For Vercel, set VITE_CONVEX_URL in environment variables
# Production: https://glad-minnow-656.convex.cloud
```

### "Cannot read properties of undefined"

Usually means Convex query returned `undefined` (still loading) or `null` (not found).

```typescript
// Always check loading state
const data = useQuery(api.table.query, args);
if (data === undefined) return <Loading />;
if (data === null) return <NotFound />;
```

### Sync not working

1. Check `bunx convex dev` is running
2. Verify `VITE_CONVEX_URL` is set
3. Check browser console for errors
4. Use `useConvexSync()` to check sync status

### "Server Error" or "Could not find public function" from scripts

**Cause:** Script is trying to call an `internalMutation` which cannot be called from HTTP clients.

**Diagnosis:**
```bash
# Check the function definition in convex/*.ts
grep -n "internalMutation" convex/substanceIndex.ts
```

**Solution:** Use the public `mutation` equivalent instead:
- `replaceAllSubstances` (internal) → use `saveSubstances` (public)
- Pass `apiKey: process.env.CONVEX_ADMIN_KEY` for authenticated mutations

See "Authentication > CRITICAL: `internalMutation` vs `mutation`" above.

### Production data stale after batch generation

After running batch scripts (legality, history-culture, harm-potential, etc.), sync to production:

```bash
# Full sync (recommended after batch generation)
TARGET_CONVEX_URL=https://glad-minnow-656.convex.cloud node scripts/convex/sync-convex-to-production.mjs

# Or sync only specific tables
TARGET_CONVEX_URL=https://glad-minnow-656.convex.cloud node scripts/convex/sync-convex-to-production.mjs --tables=substanceIndex

# Optional: export JSON backup
node scripts/convex/export-convex-to-json.mjs
```

### DevMode edits not persisting to Convex

**Symptoms:**
- User makes an edit in DevMode
- Clicks "Save to Convex"
- Logs show mutation succeeded
- But data reverts or changelog shows all articles changed

**Root Causes Fixed (Jan 2026):**

1. **Sync effect overwriting user edits:**
   - The `DevModeContext` has a sync effect that updates `articles` state when `articlesSource` changes
   - Convex query refreshes (focus changes, network activity) trigger this effect
   - This was overwriting user edits before they could be saved
   - **Fix:** Added `hasLocalEditsRef` to track pending edits; sync effect skips when flag is true

2. **Stale memoized original values:**
   - `originalArticles` memo was computed when DevModePage mounted (before articles loaded)
   - The memo captured 0 articles and never recomputed (stable `getOriginalArticles` dependency)
   - All 577 articles appeared as "NEW" when saving
   - **Fix:** Added `articles.length` as dependency to force recompute when data loads

3. **About page false positives:**
   - Same issue with `originalAboutMarkdown`, `originalAboutSubtitle`, `originalAboutFounderKeys`
   - **Fix:** Added current values as dependencies to force recompute

**Key Pattern - Memoization with Convex:**

```typescript
// WRONG - memo computed before data loads, never updates
const originalData = useMemo(() => getOriginal(), [getOriginal]);

// RIGHT - recompute when data changes
const originalData = useMemo(() => getOriginal(), [getOriginal, currentData.length]);

// Or call fresh in save handler instead of using stale memo
const freshOriginal = getOriginal();
```

**Debug Logs to Check:**
```
[DevModeProvider] Sync effect CHECK - hasLocalEdits: true/false
[DevModeProvider] ⚠️ SKIPPING sync - user has local edits
[DevModePage] 📊 originalArticles memo computed - N articles (triggered by articles.length: N)
[DevModePage] 🔍 handleSaveToConvex - articles count: 577 freshOriginalArticles count: 577
```

If `freshOriginalArticles count: 0` when saving, the memo is stale.

---

## File Structure

```
convex/
├── schema.ts                 # Table definitions
├── substanceIndex.ts         # Article CRUD + per-article queries
├── articleSources.ts         # Source content (~21MB)
├── indexLayouts.ts           # Category indexes (psychoactive/chemical/mechanism)
├── tripReports.ts            # Trip report CRUD
├── subjectiveEffects.ts      # Effect CRUD
├── effectIndexArticles.ts    # Archived articles
├── siteConfig.ts             # About page content
├── prompts.ts                # AI generation prompts
├── quotes.ts                 # Extracted source quotes
├── replications.ts           # Media storage
├── changelog.ts              # History tracking
├── categoryLayout.ts         # @deprecated - use indexLayouts
├── lib/
│   └── auth.ts               # Authentication utilities (requireAuth, AuthError)
└── _generated/               # Auto-generated types (don't edit)

src/
├── main.tsx                  # LazySubstanceIndexProvider (lazy loading entry point)
├── lib/convex.tsx            # Client setup, provider
├── context/ConvexSyncContext.tsx  # Debounced sync
├── data/
│   ├── SubstanceIndexProvider.tsx  # Library context provider
│   └── LightweightDataProvider.tsx # Slug-name map provider
└── hooks/
    ├── useLazyLibrary.ts         # Lazy library loading hook
    ├── useSubstanceArticle.ts    # Per-article loading
    ├── useIndexLayouts.ts        # Index layout loading from Convex
    ├── useArticleSources.ts      # Article source loading from Convex (DevMode)
    ├── usePrompts.ts             # Section and generator prompts
    ├── useQuotes.ts              # Source quotes
    ├── useSubjectiveEffects.ts   # Effect queries
    ├── useConvexArticles.ts      # Legacy full article loading
    └── useCategoryLayout.ts      # @deprecated - use useIndexLayouts

scripts/
├── admin/
│   └── convex-admin.mjs               # Admin CLI for authenticated mutations
├── convex/
│   ├── sync-convex-to-production.mjs  # Sync dev→prod (supports --tables flag)
│   ├── export-convex-to-json.mjs      # Export Convex→JSON backup
│   └── convex-import-substance-index.mjs
├── migrate/
│   ├── compare-prompts.mjs            # Compare local vs Convex prompts before sync
│   ├── migrate-prompts-to-convex.mjs  # Push prompt files to Convex
│   ├── migrate-quotes-to-convex.mjs   # Push quotes to Convex
│   ├── migrate-sources-to-convex.mjs  # Push article sources (~21MB)
│   ├── migrate-trip-reports.mjs       # Import trip reports
│   ├── migrate-effects.mjs            # Import subjective effects
│   └── migrate-add-slugs.mjs          # Add slug field to substances
└── seed/
    └── seed-index-layouts.mjs         # Seed index layouts
```

---

## Important Notes

1. **Convex is required:** The app shows an error if `VITE_CONVEX_URL` is not set
2. **Dev and Prod are DIFFERENT databases:** After batch generation, run `sync-convex-to-production.mjs`
3. **Batch sizes:** Articles 50-100, Effects 20 (large documents)
4. **Destructive operations:** `replaceAllArticles()` and `deleteAll()` are permanent
5. **Schema changes:** Require `bunx convex dev` to push updates
6. **⚠️ Keep this document updated:** When modifying Convex tables, queries, mutations, or sync scripts, update this skill file before completing your task

---

## Quick Reference: Syncing to Production

```bash
# Full sync (all tables) - use after batch generation
TARGET_CONVEX_URL=https://glad-minnow-656.convex.cloud node scripts/convex/sync-convex-to-production.mjs

# Targeted sync (specific tables) - use for quick updates
TARGET_CONVEX_URL=https://glad-minnow-656.convex.cloud node scripts/convex/sync-convex-to-production.mjs --tables=prompts
TARGET_CONVEX_URL=https://glad-minnow-656.convex.cloud node scripts/convex/sync-convex-to-production.mjs --tables=substanceIndex,prompts

# Production site updates immediately via Convex.
```

**Common workflows:**
- After editing prompt files: `--tables=prompts`
- After batch generation: full sync (no flag)
- After editing quotes: `--tables=quotes`
- After editing substances: `--tables=substanceIndex`

---

## Performance Optimization: Lazy Library Loading

### Query Optimizations (Jan 2026)

Several Convex queries were optimized:

1. **changelog.getAll() / getRecent()** - Now use `withIndex("by_created_at").order("desc")` instead of in-memory sorting
2. **substanceIndex.getRandomSample()** - Now filters by `priority="high"` first (252 vs 679 articles), reducing working set by ~60%

### Security: Internal Mutations

Destructive mutations are now `internalMutation` (not exposed to clients):
- `substanceIndex.replaceAllSubstances` - Deletes all then inserts
- `tripReports.bulkImport`, `deleteAll`
- `subjectiveEffects.bulkImport`, `deleteAll`
- `replications.bulkImport`, `deleteAll`

To call these from migration scripts, use the Convex admin CLI or wrap in an action.

### Overview

The app previously loaded ALL 679 articles (~5MB) on startup before showing any UI. This caused a 1-2 second blocking load.

**Current architecture uses lazy loading:**
- Home page loads only lightweight data (~34KB): category layout + slug-name map
- Full library (~5MB) is loaded on-demand when visiting `/dev`, `/search`, etc.
- `SubstanceArticlePage` fetches its own article by slug via `useSubstanceArticle(slug)`

### Lazy Loading Architecture

```
main.tsx
  └─ LazySubstanceIndexProvider ← Single point for lazy library loading
       │   - Intercepts history.pushState/replaceState for SPA navigation
       │   - Calls useLazyLibrary(needsLibrary) when route needs full data
       │   - Provides EMPTY_LIBRARY until data loads
       └─ SubstanceIndexProvider (with library or EMPTY_LIBRARY)
            └─ DevModeProvider ← Gets library from useLibrary()
                 └─ DevModePage / other components
```

### Key Components

| Component | Location | Purpose |
|-----------|----------|---------|
| `LazySubstanceIndexProvider` | `main.tsx` | Single point for lazy library loading, route detection |
| `useLazyLibrary` | `hooks/useLazyLibrary.ts` | Hook that triggers `getAll` on-demand |
| `EMPTY_LIBRARY` | `main.tsx` | Placeholder until library loads |
| `LightweightDataProvider` | `data/LightweightDataProvider.tsx` | Provides slug-name map (~20KB) |
| `SubstanceIndexProvider` | `data/SubstanceIndexProvider.tsx` | Provides library data via context |

### Routes That Trigger Full Library Load

The full library is loaded when navigating to these paths:

- `/dev/*` - DevMode (article editing)
- `/data` - Data download page
- `/mechanism/*` - Mechanism detail pages
- `/chemical/*`, `/psychoactive/*` - Classification pages
- `/category/*` - Category detail pages
- `/search/*` - Search results
- `/reports/{slug}` - Trip report detail (for substance linking)

### Route Detection (SPA Navigation)

`LazySubstanceIndexProvider` intercepts `history.pushState` and `history.replaceState` to detect SPA navigation:

```typescript
// In LazySubstanceIndexProvider useEffect:
const originalPushState = history.pushState.bind(history);
history.pushState = function (...args) {
  originalPushState(...args);
  handleRouteChange(); // Check if new path needs library
};
```

This is necessary because `popstate` only fires on browser back/forward, not on programmatic navigation.

### Data Flow

```
Initial Load (fast):
  main.tsx → categoryLayout.get + getSlugNameMap → LightweightDataProvider
           → EMPTY_LIBRARY → SubstanceIndexProvider
           → App renders immediately

On-Demand (when /dev, /search, etc.):
  User clicks link → pushState intercepted
    → LazySubstanceIndexProvider detects route
    → useLazyLibrary(true)
    → api.substanceIndex.getAll
    → buildLibrary()
    → SubstanceIndexProvider receives full library
    → Components re-render with data
```

### Per-Article Loading (Phases 5-6)

In addition to lazy library loading, individual article pages use per-article queries:

- `SubstanceArticlePage` fetches its own article by slug via `useSubstanceArticle(slug)`
- `getBySlug` query enables O(1) lookups instead of loading entire collection
- `getSlugNameMap` returns lightweight data (~20KB) for name resolution
- `categoryLayout` table stores home page structure separately

### Current Status

**✅ Completed:**
- Added `slug` field and `by_slug` index to `substanceIndex` table
- Added `getBySlug` query for per-article loading
- Added `getSlugNameMap` query for lightweight slug-name lookup (~20KB)
- Created `categoryLayout` table and queries
- Created `useSubstanceArticle` hook for per-article loading
- Created `useCategoryLayout` hook
- Updated `SubstanceArticlePage` to fetch its own article by slug
- Updated `App.tsx` to pass `slug` instead of `article` prop
- Created migration scripts (`migrate-add-slugs.mjs`, `seed-category-layout.mjs`)
- Ran migration to add slugs to all 577 existing substances
- **Fixed lazy library loading for DevMode:**
  - `LazySubstanceIndexProvider` intercepts `pushState`/`replaceState` for SPA navigation
  - `DevModeContext` now uses `useLibrary()` from provider (not duplicate `useLazyLibrary`)
  - Added defensive checks for race conditions in `DevModePage`

**⏳ Still TODO for Full Optimization:**

1. **Seed category layout to Convex:**
   ```bash
   VITE_CONVEX_URL=https://enchanted-echidna-791.convex.cloud node scripts/seed-category-layout.mjs
   ```

2. **Update `DosagesPage` to use `useCategoryLayout()` + `useSubstanceLookup()`:**
   - Currently uses `dosageCategoryGroups` from full library
   - Should load category structure from Convex and resolve names from slug lookup
   - This would eliminate the need for `getAll` on home page load

3. **Make other pages lazy-load full library:**
   - `MechanismDetailPage` - needs mechanism lookups
   - `ClassificationDetailPage` - needs classification lookups
   - `GlobalSearch` - needs full search index
   - These could lazy-load the full library only when visited

4. **Sync to production after completion:**
   ```bash
   TARGET_CONVEX_URL=https://glad-minnow-656.convex.cloud node scripts/convex/sync-convex-to-production.mjs
   ```

### Key Queries for Performance

```typescript
// Lightweight (~20KB) - for home page name resolution
api.substanceIndex.getSlugNameMap()

// Per-article (~10KB each) - for article pages
api.substanceIndex.getBySlug({ slug: "lsd" })

// Full collection (~5MB) - only when needed
api.substanceIndex.getAll()
```

### Migration Required After Schema Changes

When adding new substances or updating existing ones, ensure slugs are set:

```bash
# Add slugs to any substances missing them
VITE_CONVEX_URL=https://enchanted-echidna-791.convex.cloud node scripts/migrate-add-slugs.mjs

# Sync to production
TARGET_CONVEX_URL=https://glad-minnow-656.convex.cloud node scripts/convex/sync-convex-to-production.mjs
```

---

# General Convex Development Reference

This section contains general Convex development patterns and best practices that apply to any Convex project. Use this as a reference when writing new Convex functions.

## Function Types

| Type               | Runtime | Use Case                         | Import From           |
| ------------------ | ------- | -------------------------------- | --------------------- |
| `query`            | V8      | Read data, no side effects       | `./_generated/server` |
| `mutation`         | V8      | Write data, transactional        | `./_generated/server` |
| `action`           | Node.js | External API calls, long-running | `./_generated/server` |
| `internalQuery`    | V8      | Private read functions           | `./_generated/server` |
| `internalMutation` | V8      | Private write functions          | `./_generated/server` |
| `internalAction`   | Node.js | Private Node.js operations       | `./_generated/server` |

## Function Syntax (Modern)

```typescript
import { query, mutation, action } from "./_generated/server";
import { v } from "convex/values";

// Public query
export const listTasks = query({
  args: { status: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const tasks = await ctx.db.query("tasks").collect();
    return tasks;
  },
});

// Public mutation
export const createTask = mutation({
  args: {
    title: v.string(),
    description: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const taskId = await ctx.db.insert("tasks", {
      title: args.title,
      description: args.description,
      status: "pending",
    });
    return taskId;
  },
});

// Internal action (Node.js runtime)
("use node"); // Required at top of file for Node.js features

import { internalAction } from "./_generated/server";
import OpenAI from "openai";

export const generateEmbedding = internalAction({
  args: { text: v.string() },
  handler: async (_ctx, args) => {
    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
    const response = await openai.embeddings.create({
      model: "text-embedding-3-small",
      input: args.text,
    });
    return response.data[0].embedding;
  },
});
```

## Schema Definition

```typescript
// convex/schema.ts
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

const applicationTables = {
  tasks: defineTable({
    title: v.string(),
    description: v.optional(v.string()),
    status: v.string(),
    priority: v.optional(v.number()),
    userId: v.optional(v.string()),
  })
    .index("by_status", ["status"])
    .index("by_priority", ["priority"]),
};

export default defineSchema({
  ...applicationTables,
});
```

### Key Schema Rules

1. **Never manually add `_creationTime`** - it's automatic
2. **Never use `.index("by_creation_time", ["_creationTime"])`** - it's built-in
3. **Index names should be descriptive**: `by_fieldName` or `by_field1_and_field2`
4. **All indexes include `_creationTime` automatically as the last field**
5. **Indexes must be non-empty**: define at least one field

## Common Validators

```typescript
v.id("tableName");        // Reference to a document
v.string();               // String value
v.number();               // Number (float/int)
v.boolean();              // Boolean
v.null();                 // Null value
v.array(v.string());      // Array of strings
v.object({                // Object with defined shape
  name: v.string(),
  age: v.number(),
});
v.optional(v.string());   // Optional field
v.union(                  // Union of types
  v.literal("active"),
  v.literal("inactive")
);
v.any();                  // Any type (use sparingly)
```

## Query Patterns

```typescript
// Get all documents
const all = await ctx.db.query("tasks").collect();

// Get with index filter
const active = await ctx.db
  .query("tasks")
  .withIndex("by_status", (q) => q.eq("status", "active"))
  .collect();

// Get single document by ID
const task = await ctx.db.get(taskId);

// Unique result (throws if multiple)
const task = await ctx.db
  .query("tasks")
  .filter((q) => q.eq(q.field("title"), "My Task"))
  .unique();

// First result (returns null if none)
const task = await ctx.db
  .query("tasks")
  .withIndex("by_status", (q) => q.eq("status", "active"))
  .first();

// Order and limit
const recent = await ctx.db.query("tasks").order("desc").take(10);

// Pagination
const page = await ctx.db
  .query("tasks")
  .paginate({ numItems: 20, cursor: null });
```

## Mutation Patterns

```typescript
// Insert new document
const id = await ctx.db.insert("tasks", {
  title: "New Task",
  status: "pending",
});

// Patch (merge update)
await ctx.db.patch(taskId, {
  status: "completed",
});

// Replace (full replacement)
await ctx.db.replace(taskId, {
  title: "Updated Title",
  status: "completed",
  description: "New description",
});

// Delete
await ctx.db.delete(taskId);
```

## Calling Functions from Functions

```typescript
import { api } from "./_generated/api";
import { internal } from "./_generated/api";

// From a mutation or action
export const myMutation = mutation({
  args: {},
  handler: async (ctx) => {
    // Call another query
    const tasks = await ctx.runQuery(api.tasks.list, {});

    // Call another mutation
    await ctx.runMutation(api.tasks.create, { title: "From mutation" });

    // Call internal function
    await ctx.runMutation(internal.tasks.processTask, { taskId: "abc123" });
  },
});
```

## React Integration

```typescript
import { useQuery, useMutation, useAction } from "convex/react";
import { api } from "../../convex/_generated/api";

function TaskList() {
  // Query with automatic reactivity
  const tasks = useQuery(api.tasks.list) || [];

  // Mutation
  const createTask = useMutation(api.tasks.create);

  // Action
  const generateReport = useAction(api.reports.generate);

  return (
    <div>
      {tasks.map(task => (
        <div key={task._id}>{task.title}</div>
      ))}
      <button onClick={() => createTask({ title: "New" })}>
        Add Task
      </button>
    </div>
  );
}
```

### React Best Practices

1. **NEVER call hooks conditionally:**

   ```typescript
   // WRONG
   const data = user ? useQuery(api.getUser, { userId: user.id }) : null;

   // RIGHT - use "skip" sentinel
   const data = useQuery(api.getUser, user ? { userId: user.id } : "skip");
   ```

2. **Use skipToken for conditional queries (modern API):**
   ```typescript
   import { skipToken } from "convex/react";
   const data = useQuery(api.tasks.get, taskId ? { id: taskId } : skipToken);
   ```

3. **Handle loading states:**
   ```typescript
   const data = useQuery(api.tasks.list);
   if (data === undefined) return <Loading />;  // Still loading
   if (data === null) return <NotFound />;      // Not found
   return <TaskList tasks={data} />;
   ```

## Using Generated Types

```typescript
import type { Doc, Id } from "./_generated/dataModel";

type Task = Doc<"tasks">;         // Task document type
type TaskId = Id<"tasks">;        // Task ID type

function processTask(taskId: TaskId) {
  // Type-safe!
}
```

## Best Practices

### DO

- Use `internal*` functions for sensitive operations
- Always validate arguments with `v.*()` validators
- Use indexes for efficient queries
- Check loading states in React components
- Keep functions under 100 lines
- Use TypeScript strict mode
- Test in dev before deploying

### DON'T

- Don't use `.filter()` in queries for large datasets - use indexes instead
- Don't manually add `_id` or `_creationTime` to schemas
- Don't use `undefined` in Convex - use `null` instead
- Don't make files longer than 300 lines
- Don't call hooks conditionally in React
- Don't manually edit `_generated/` files
- Don't forget to deploy functions after changes

## Environment Variables in Functions

```typescript
export const checkEnv = query({
  args: {},
  handler: async (_ctx) => {
    return {
      apiKeyPresent: !!process.env.API_KEY,
      nodeEnv: process.env.NODE_ENV,
    };
  },
});
```

## Troubleshooting Common Errors

```
Type error: Property 'xxx' does not exist on type
```
**Fix**: Run `bunx convex dev` to regenerate types after schema changes.

```
Error: Module not found: Can't resolve './_generated/api'
```
**Fix**: Run `bunx convex dev` or `bunx convex deploy` to generate API files.

```
Error: Cannot read property 'xxx' of undefined
```
**Fix**: Check your query/mutation logic - document may not exist or field may be optional. Always handle `undefined` and `null` cases.

---

## Authentication Reference (convex-dev/auth)

For projects using `@convex-dev/auth`:

### Auth Setup

```typescript
// convex/auth.ts
import { convexAuth, getAuthUserId } from "@convex-dev/auth/server";
import { Password } from "@convex-dev/auth/providers/Password";
import { Anonymous } from "@convex-dev/auth/providers/Anonymous";
import { query } from "./_generated/server";

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [Password, Anonymous],
});

export const currentUser = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    return await ctx.db.get(userId);
  },
});
```

### HTTP Router Setup

```typescript
// convex/http.ts
import { auth } from "./auth";
import router from "./router";

const http = router;

// CRITICAL: Add auth routes to the HTTP router
auth.addHttpRoutes(http);

export default http;
```

### Using Auth in Functions

```typescript
import { query } from "./_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";

export const getUserTasks = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      return [];  // Or throw new Error("Not authenticated")
    }
    return await ctx.db
      .query("tasks")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
  },
});
```

### React Auth Integration

```typescript
import { useQuery } from "convex/react";
import { api } from "../convex/_generated/api";
import { SignInButton, SignOutButton, useAuth } from "@convex-dev/auth/react";

export default function App() {
  const { isAuthenticated, user } = useAuth();
  const tasks = useQuery(api.tasks.getUserTasks) || [];

  if (!isAuthenticated) {
    return (
      <main>
        <h1>My App</h1>
        <SignInButton />
      </main>
    );
  }

  return (
    <main>
      <h1>Welcome, {user?.name || 'User'}!</h1>
      <SignOutButton />
      <ul>
        {tasks.map(task => (
          <li key={task._id}>{task.title}</li>
        ))}
      </ul>
    </main>
  );
}
```

### Schema with Auth Tables

```typescript
// convex/schema.ts
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { authTables } from "@convex-dev/auth/server";

const applicationTables = {
  tasks: defineTable({
    title: v.string(),
    status: v.string(),
    userId: v.id("users"),
  }).index("by_user", ["userId"]),
};

export default defineSchema({
  ...authTables,  // Include auth tables
  ...applicationTables,
});
```

---

## Self-Hosted Convex Reference

For self-hosted Convex deployments (Docker-based):

### Service Ports

| Service | Port | Purpose |
|---------|------|---------|
| Convex API | 3210 | Main API endpoints |
| Site Proxy | 3211 | Auth/HTTP routes |
| Dashboard | 6791 | Admin dashboard |

### Environment Variables

```bash
CONVEX_CLOUD_ORIGIN=<api-url>           # API endpoint
CONVEX_SITE_ORIGIN=<site-url>           # Site proxy (for auth)
CONVEX_DEPLOYMENT_URL=<api-url>         # Same as CLOUD_ORIGIN
VITE_CONVEX_URL=<api-url>               # Frontend config
CONVEX_SELF_HOSTED_ADMIN_KEY=<key>      # Admin key
JWT_ISSUER=<site-url>                   # Must match SITE_ORIGIN
```

### Critical Variable Relationships

```
CONVEX_CLOUD_ORIGIN = CONVEX_DEPLOYMENT_URL = VITE_CONVEX_URL (all point to API, port 3210)
CONVEX_SITE_ORIGIN = JWT_ISSUER (both point to site proxy, port 3211)
```

### Docker Commands

```bash
# Start services
docker-compose up -d

# Check status
docker ps

# View logs
docker-compose logs -f convex

# Stop services
docker-compose down
```
