---
name: batch
description: Batch section generation via the OpenRouter TypeScript SDK with Claude Opus 4.5
---

# Batch Section Generation

> **⚠️ MAINTENANCE REQUIREMENT:** This skill file MUST be updated whenever:
> - A batch run completes (update Task Tracker)
> - Schema changes affect batch output (update Schema Structure)
> - New batch scripts are created
> - Prompt iteration discovers important lessons
>
> **Keep the Task Tracker current - it's the source of truth for batch progress.**

Generate article sections in bulk via the shared OpenRouter SDK helper instead of the DevTools UI.

**Fixed Configuration:**
- **Fresh Slate mode** - existing section content excluded from context, always generate from scratch
- **Claude Opus 4.5** with **high reasoning effort**
- **High/Normal priority only** - low priority articles are excluded from batch processing

## Task Tracker

| Section | Script | Quotes | Phase 1 (Single) | Phase 2 (5) | Phase 3 (20) | Phase 4 (Full) | Notes |
|---------|--------|--------|------------------|-------------|--------------|----------------|-------|
| **legality** | ✅ | ✅ 679 | ✅ | ✅ | ✅ | ✅ | **DONE** - 248 articles |
| **history_culture** | ✅ | ✅ 249 | ✅ | ✅ | ✅ | ✅ | **DONE** - 245 articles, includes date_range feature |
| **harm_potential** | ✅ | ✅ 502 | ✅ | ✅ | ✅ | ✅ | **DONE** - 228 articles (Jan 29, 2026). Prompt fix applied for source meta-commentary. |
| tolerance | ⬜ | ✅ 247 | ⬜ | ⬜ | ⬜ | ⬜ | |
| **pharmacology** | ✅ | ✅ 249 | ✅ | ⬜ | ⬜ | ⬜ | Script created Jan 29, 2026. Phase 1: 6 substances (2c-b, dxm, mda, amphetamine, fentanyl, alprazolam). Schema updated with route-specific fields. |
| dosage_duration | ✅ | ✅ 249 | ✅ | ⬜ | ⬜ | ⬜ | Uses Haiku 4.5, minimal context, incremental saves |
| summary | ⬜ | ✅ 251 | ⬜ | ⬜ | ⬜ | ⬜ | |
| subjective_effects | ⬜ | ✅ 250 | ⬜ | ⬜ | ⬜ | ⬜ | |
| identification | ⬜ | ❌ | ⬜ | ⬜ | ⬜ | ⬜ | Uses generic sources |
| interactions | ⬜ | ❌ | ⬜ | ⬜ | ⬜ | ⬜ | Uses TripSit combos |

**Legend:** ⬜ Not started | 🔄 In progress | ✅ Complete

---

## Quick Reference

```bash
# Environment setup
export OPENROUTER_API_KEY="sk-or-v1-..."
export VITE_CONVEX_URL="https://enchanted-echidna-791.convex.cloud"
export CONVEX_ADMIN_KEY=$(grep "^CONVEX_ADMIN_KEY=" .env.local | cut -d= -f2-)

# Available scripts
node scripts/batch/batch-generate-legality.mjs         # Legality sections
node scripts/batch/batch-generate-harm-potential.mjs   # Harm potential sections
node scripts/batch/batch-generate-history-culture.mjs  # History & culture sections
node scripts/batch/batch-generate-pharmacology.mjs     # Pharmacology sections

# Common workflow (replace {section} with legality, harm-potential, etc.)
node scripts/batch/batch-generate-{section}.mjs --substance=lsd --dry-run  # Preview single
node scripts/batch/batch-generate-{section}.mjs --substance=lsd            # Single test
node scripts/batch/batch-generate-{section}.mjs --slugs=lsd,mdma,dmt       # Multiple specific slugs
node scripts/batch/batch-generate-{section}.mjs --limit=5                  # Small batch
node scripts/batch/batch-generate-{section}.mjs --concurrency=5            # Full batch

# Harm potential special options
node scripts/batch/batch-generate-harm-potential.mjs              # Only articles with existing content (default)
node scripts/batch/batch-generate-harm-potential.mjs --all        # All 505 articles with quotes
node scripts/batch/batch-generate-harm-potential.mjs --slugs=lsd,mdma,ketamine  # Specific substances

# ⚠️ CRITICAL: After any batch run, sync to PRODUCTION Convex
TARGET_CONVEX_URL=https://glad-minnow-656.convex.cloud node scripts/convex/sync-convex-to-production.mjs

# Optional: validate the app after large runs
npm run build
```

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                    Batch Generation Script                           │
│  scripts/batch/batch-generate-{section}.mjs                                │
│  - Loads prompt from Convex (api.prompts.getByKey)                  │
│  - Loads quotes from {section}-quotes/{slug}-{section}.md           │
│  - Builds Fresh Slate context (excludes target section)             │
│  - Calls the shared OpenRouter SDK helper with Claude Opus 4.5      │
│  - Parses YAML response and writes through the configured Convex/app path │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    OpenRouter TypeScript SDK                         │
│  Model: anthropic/claude-opus-4.5                                   │
│  Reasoning: high                                                     │
│  Max Tokens: 16384                                                   │
│  Temperature: 0.3                                                    │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│                      Output                                          │
│  - Dev Convex receives new section content through the script/API path    │
│  - Optional local exports remain backup artifacts only                    │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Sections Available for Batch Generation

| Section Key | Convex Prompt | Quotes Directory | Script Status |
|-------------|---------------|------------------|---------------|
| `legality` | `section_legality` | `legality-quotes/` (679) | ✅ Ready |
| `harm_potential` | `section_harm_potential` | `harmpotential-quotes/` (505) | ✅ Ready |
| `history_culture` | `section_history_culture` | `history-culture-quotes/` (249) | ✅ Ready |
| `tolerance` | `section_tolerance` | `tolerance-quotes/` (248) | Needs script |
| `pharmacology` | `section_pharmacology` | `pharmacology-quotes/` (249) | ✅ Ready |
| `dosage_duration` | `section_dosage_duration` | `dosage-duration-quotes/` (249) | ✅ Ready (special) |
| `summary` | `section_summary` | `intro-text-quotes/` (251) | Needs script |
| `subjective_effects` | `section_subjective_effects` | `subjective-effects-quotes/` (250) | Needs script |
| `identification` | `section_identification` | (no quotes) | Uses generic sources |
| `interactions` | `section_interactions` | (no quotes) | Uses TripSit combos |

---

## Priority Filtering

Batch scripts **only process high and normal priority articles**. Low priority articles are excluded.

```javascript
// In loadArticles():
const articles = allArticles.filter(a =>
  a.priority === "high" || a.priority === "normal"
);
```

**Current counts (~248 articles):**
- High priority: ~50 (most common/important substances)
- Normal priority: ~200 (standard substances)
- Low priority: ~325 (excluded - direct URL access only)

This ensures batch processing focuses on visible, actively maintained articles.

---

## Workflow: Phases, Tests, and Iterations

### Phase 1: Single Substance Test

```bash
# Dry run to verify setup
node scripts/batch/batch-generate-{section}.mjs --substance=lsd --dry-run

# Generate for single substance
node scripts/batch/batch-generate-{section}.mjs --substance=lsd

# Manually review output quality through `/dev` or Convex-backed reads
```

**Checkpoint:** Review the generated content. Is the quality acceptable? Does it match the section schema?

### Phase 2: Small Batch Test

```bash
# Test with 5 diverse substances
node scripts/batch/batch-generate-{section}.mjs --limit=5

# Review all 5 outputs
```

**Checkpoint:** Check for consistency across different substance types. Note any patterns in errors or quality issues.

### Phase 3: Medium Batch

```bash
# Process 20-50 articles
node scripts/batch/batch-generate-{section}.mjs --limit=20
```

**Checkpoint:** Monitor for rate limiting and any systematic issues.

### Phase 4: Full Batch

```bash
# Process all high/normal priority articles (~248)
node scripts/batch/batch-generate-{section}.mjs

# Validate the app after the batch
npm run build
```

**Post-run:** Check for failed items, spot-check random articles.

---

## Fresh Slate Mode (Always Used)

Batch generation **always** uses Fresh Slate mode:

1. **Exclude target section** from article YAML context
2. **Generate from scratch** using only extracted quotes
3. **No review** of existing content

```javascript
// In buildUserMessage():
const filtered = { ...article };
delete filtered.legality;  // Remove target section
// For dosage_duration, remove both:
// delete filtered.dosage;
// delete filtered.duration;
```

This ensures:
- Clean regeneration without bias from previous content
- Consistent output across all articles
- Fresh interpretation of source quotes

---

## Script Template

When creating a new batch script, use `scripts/batch/batch-generate-legality.mjs` as the template:

### Key Configuration

```javascript
const CONFIG = {
  model: "anthropic/claude-opus-4.5",
  maxTokens: 16384,
  temperature: 0.3,
  reasoningEffort: "high",  // Always high for batch generation
  maxConcurrency: 5,        // Use 5 for speed, 2-3 if memory issues
  retryAttempts: 3,
  retryDelayMs: 2000,
};
```

### Required Modifications for New Sections

1. **Update section key mapping:**
   ```javascript
   const SECTION_KEY = "harm_potential";  // Convex prompt key suffix
   const QUOTES_DIR = "harmpotential-quotes";
   const QUOTES_SUFFIX = "harmpotential";  // filename pattern: {slug}-{suffix}.md
   ```

2. **Update YAML parsing:**
   ```javascript
   // Handle section-specific structure
   if (parsed.harm_potential) {
     return parsed.harm_potential;
   }
   ```

3. **Update article patching:**
   ```javascript
   article.harm_potential = update.harm_potential;
   ```

4. **For dosage_duration (special case):**
   ```javascript
   // Parses into two separate fields
   article.dosage = update.dosage;
   article.duration = update.duration;
   ```

---

## Command Options (All Scripts)

| Option | Description |
|--------|-------------|
| `--dry-run` | Preview without API calls or saving |
| `--verbose` | Show detailed progress output |
| `--substance=<slug>` | Process single substance only |
| `--slugs=<slug1,slug2>` | Process multiple substances by comma-separated slugs |
| `--concurrency=<n>` | Parallel API requests (default: 3) |
| `--limit=<n>` | Process at most N items |
| `--skip-backup` | Don't create backup file |
| `--all` | Process all articles with quotes (bypasses "existing content" filter) |
| `--new-only` | Process only articles with quotes but WITHOUT existing content (skip already done) |

---

## Error Handling

### Rate Limiting (429)
- Automatic retry with exponential backoff
- Reduce concurrency if persistent: `--concurrency=2`

### Insufficient Credits (402)
- Script stops immediately
- Top up OpenRouter credits

### Parse Errors
- Logged to failed items list
- Re-run with `--substance=<slug>` to retry specific failures

### Large Articles
- Some substances have very large quote files
- May need increased timeout or reduced concurrency

---

## Post-Generation Checklist

1. **Check failed items** - Script outputs list of failures
2. **Run review script** to catch quality issues:
   ```bash
   node scripts/review-all-legality.mjs
   ```
3. **⚠️ Search for source meta-commentary** (catches "no data in sources" phrases):
   ```bash
   node scripts/search-harm-sources.mjs --convex
   ```
   If issues found, fix with `scripts/fix-harm-source-mentions.mjs` or re-run affected articles.
4. **Re-run problematic articles** if needed:
   ```bash
   node scripts/batch/batch-generate-{section}.mjs --substance=<slug>
   ```
5. **⚠️ SYNC TO PRODUCTION CONVEX** (CRITICAL - data won't appear on prod site otherwise):
   ```bash
   TARGET_CONVEX_URL=https://glad-minnow-656.convex.cloud node scripts/convex/sync-convex-to-production.mjs
   ```
6. **Test in dev server:**
   ```bash
   npm run dev
   # Navigate to a processed article
   ```
7. **Test production site** - Verify changes appear on dose.wiki

---

## Files

| File | Purpose |
|------|---------|
| `scripts/batch/batch-generate-legality.mjs` | Legality batch script (template) |
| `scripts/batch/batch-generate-harm-potential.mjs` | Harm potential batch script |
| `scripts/batch/batch-generate-history-culture.mjs` | History & culture batch script |
| `scripts/batch/batch-generate-dosage-duration.mjs` | Dosage/duration batch script |
| `scripts/batch/batch-generate-pharmacology.mjs` | Pharmacology batch script |
| `scripts/batch/review-legality.mjs` | Review specific articles for issues |
| `scripts/batch/review-all-legality.mjs` | Review all 248 articles for issues |
| `src/data/SubstanceIndex.json` | Backup/export artifact; not the live write target |
| `src/data/articles.backup.json` | Pre-run backup |
| `src/data/config/sectionPrompts/*.md` | Section prompts (source of truth) |
| `convex/prompts.ts` | Prompt storage in Convex |
| `scripts/migrate/migrate-prompts-to-convex.mjs` | Sync prompts to Convex |
| `scripts/convex/sync-convex-to-production.mjs` | Sync all data from dev to production Convex |
| `scripts/search-harm-sources.mjs` | Search for source meta-commentary (QA check) |
| `scripts/fix-harm-source-mentions.mjs` | Fix source meta-commentary in Convex |

---

## Creating a New Batch Script

### Quick Checklist

1. **Copy template:** `cp scripts/batch/batch-generate-legality.mjs scripts/batch/batch-generate-{section}.mjs`

2. **Update these constants:**
   ```javascript
   // CONFIG object
   quotesDir: join(PROJECT_ROOT, "{section}-quotes"),  // Check actual dir name!

   // loadPromptFromConvex()
   key: "section_{section}"  // e.g., "section_harm_potential"

   // loadQuotes function name and path
   function load{Section}Quotes(slug) {
     const quotesPath = join(CONFIG.quotesDir, `${slug}-{suffix}.md`);  // Check actual suffix!
   }

   // hasExisting{Section} filter function
   // parseGeneratedYaml - handle section-specific structure
   // Article patching: article.{section} = update.{section}
   ```

3. **Verify prompt exists:** `bunx convex run prompts:getByKey '{"key": "section_{section}"}'`

4. **Test:** `--dry-run` → `--substance=lsd` → `--limit=5` → full batch

### Quote File Naming (Watch Out!)

Directory and file naming is **inconsistent** across sections:

| Section | Directory | File Pattern |
|---------|-----------|--------------|
| legality | `legality-quotes/` | `{slug}-legality.md` |
| harm_potential | `harmpotential-quotes/` | `{slug}-harmpotential.md` |
| history_culture | `history-culture-quotes/` | `{slug}-history-culture.md` |
| tolerance | `tolerance-quotes/` | `{slug}-tolerance.md` |
| pharmacology | `pharmacology-quotes/` | `{slug}-pharmacology.md` |

**Always check the actual directory** with `ls` before assuming the pattern!

### "Existing Content" Filter Reality

Most sections have **very few articles with existing content**:

| Section | Articles with Content | Notes |
|---------|----------------------|-------|
| legality | 248 | All had content (unique case) |
| harm_potential | 2 | DXM, Ketamine only |
| history_culture | 1 | Ketamine only |
| others | 0-5 | Likely minimal |

**For real batch runs, you'll almost always need `--all`** to process articles with quote files rather than just those with existing content.

### Workflow

```bash
# 1. Check quote files exist
ls {section}-quotes/ | head

# 2. Verify prompt in Convex
bunx convex run prompts:getByKey '{"key": "section_{section}"}'

# 3. Dry run (see what would be processed)
node scripts/batch/batch-generate-{section}.mjs --dry-run
node scripts/batch/batch-generate-{section}.mjs --all --dry-run  # If few with existing content

# 4. Single substance test
node scripts/batch/batch-generate-{section}.mjs --substance=lsd

# 5. Review output through `/dev` or Convex-backed reads

# 6. Small batch
node scripts/batch/batch-generate-{section}.mjs --all --limit=5

# 7. Full batch
node scripts/batch/batch-generate-{section}.mjs --all --concurrency=5

# 8. Validate
npm run build
```

---

## Prompt Iteration

If output quality is poor:

1. **Check Convex prompt:**
   ```bash
   bunx convex run prompts:getByKey '{"key": "section_legality"}'
   ```

2. **Update prompt in Convex:**
   ```bash
   # Edit src/data/config/sectionPrompts/{section}.md
   # Then sync to Convex:
   VITE_CONVEX_URL="https://enchanted-echidna-791.convex.cloud" node scripts/migrate/migrate-prompts-to-convex.mjs
   ```

3. **Re-run single substance test:**
   ```bash
   node scripts/batch/batch-generate-{section}.mjs --substance=lsd
   ```

4. **Compare outputs** and iterate until quality is acceptable.

---

## Lessons Learned

### Concurrency

- **Use `--concurrency=5`** for faster processing (~28 min for 248 articles)
- Concurrency=2 is safer for memory but slower (~45 min)
- No rate limiting issues encountered at concurrency=5

### Monitoring Progress

Watch progress in a separate terminal:
```bash
tail -f /private/tmp/claude/-Users-josie-Documents-Utilities-dose-wiki-copy/tasks/{task_id}.output
```

### Convex Sync

- **Convex is the source of truth** - batch scripts write directly to Convex dev, then sync to production
- Scripts auto-sanitize Greek letters (α → alpha) before syncing
- Uses `saveSubstances` mutation (public, with apiKey auth) for batch writes
- **⚠️ Never use `internalMutation` from scripts** - they can't be called from HTTP clients
- Sync to production after every batch:
  ```bash
  export CONVEX_ADMIN_KEY=$(grep "^CONVEX_ADMIN_KEY=" .env.local | cut -d= -f2-)
  TARGET_CONVEX_URL=https://glad-minnow-656.convex.cloud node scripts/convex/sync-convex-to-production.mjs
  ```

### Incremental Processing with --new-only

When running batches incrementally (e.g., after testing with a few articles):
- Use `--new-only` flag to skip articles that already have content
- This prevents re-processing articles you've already done
- Example: After testing 10 articles, run `--new-only` to process remaining 234

### Incomplete Articles May Crash UI

Some articles have incomplete data (null fields). After batch processing, viewing these articles may crash section components.

**Fix (Jan 17, 2026):** Added null checks to these components:
- `HeroSection.tsx` - `summary?.trim()`
- `PharmacologySection.tsx` - `pharmacology.receptor_binding &&`, `mechanism_of_action?.length`
- `ToleranceSection.tsx` - `tolerance?.full_tolerance?.trim()`
- `HarmPotentialSection.tsx` - `harm_potential?.addiction_liability?.trim()`

If you encounter similar crashes, add optional chaining (`?.`) to the failing property access.

### Quality Issues & Fixes

1. **Empty notes problem:** Model sometimes leaves `notes` field empty
   - Fix: Strengthen prompt with "MANDATORY Notes - NEVER Empty" and explicit examples
   - Re-run problematic articles individually: `--substance=<slug>`

2. **Missing countries:** Model may skip countries mentioned in source
   - Fix: Add "Extract ALL Countries" to prompt core principles

3. **Review scripts:**
   ```bash
   # Review specific articles
   node scripts/review-legality.mjs "Article Title 1" "Article Title 2"

   # Review all 248 for issues
   node scripts/review-all-legality.mjs
   ```

### Expected Results

- ~35 articles may have 0 countries (no legality info in source quotes - this is normal)
- All other articles should have notes for every country entry
- Total country entries for legality: ~1,900+

### Source Meta-Commentary (Jan 29, 2026)

**Problem:** AI was writing phrases like "No data available in sources" or "not well characterized in available literature" instead of leaving fields empty.

**Fix:** Added explicit "NEVER COMMENT ON SOURCES" section to prompt with examples:
```markdown
❌ WRONG: "No data available in sources"
❌ WRONG: "Sources do not describe..."
❌ WRONG: "Not characterized in available sources"
✅ CORRECT: Leave the field as "" (empty string) or null
```

**Audit scripts created:**
- `scripts/search-harm-sources.mjs --convex` - Search for source mentions
- `scripts/fix-harm-source-mentions.mjs` - Apply targeted fixes to Convex

**Key lesson:** When telling the model to leave fields empty, be explicit that it should NOT write meta-commentary about the absence of data.

### Prompt Requirements

For reliable output, prompts should include:
- **MANDATORY** language for required fields
- **NEVER** language for prohibited patterns (e.g., empty strings, source meta-commentary)
- **Examples of valid AND invalid** output
- **CRITICAL** warning before validation checklist
- Specific examples showing minimum acceptable content

### Prompt Design Principles

**Show only the new schema, never the old:**
When migrating to a new schema structure, the prompt should ONLY show the new schema. Don't show old fields with "DO NOT GENERATE" warnings - this confuses the model and wastes tokens.

```markdown
# WRONG - shows old schema and says don't use it
## Old Fields (DO NOT GENERATE)
- addiction_liability: string  ❌ DEPRECATED
- dependence_liability: string  ❌ DEPRECATED

## New Fields (USE THESE)
- addiction.psychological: { level, description }
...

# CORRECT - only shows new schema
## Schema
harm_potential:
  addiction:
    psychological: { level, description }
    physical_dependence: { level, description }
...
```

**Use evidence-based definitions, not external classification systems:**
Don't tie level definitions to specific external systems (e.g., IARC groups for carcinogenicity). Use descriptive evidence-based definitions that work even when external data is unavailable.

```markdown
# WRONG - IARC-specific
| confirmed | IARC Group 1; established human carcinogen |

# CORRECT - evidence-based
| confirmed | Established human carcinogen; sufficient evidence from human studies |
```

**Be specific about "mechanism" fields:**
When a field is named "mechanism", explicitly clarify it must be a biological/chemical mechanism, not a dose-response observation.

```markdown
# WRONG - allows unhelpful output
- mechanism: How the damage occurs

# CORRECT - specific guidance
- mechanism: The BIOLOGICAL mechanism causing damage (e.g., "5-HT2B agonism",
  "NMDA receptor blockade"). NOT dose observations like "associated with higher doses"
```

---

## Section-Specific Notes

### pharmacology

**Status:** Phase 1 complete (Jan 29, 2026) - 6 substances processed

**Quote files location:** `pharmacology-quotes/{slug}-pharmacology.md`

**⚠️ ROUTE DATA MERGING (Critical Architecture):**

The pharmacology batch script has unique behavior: it generates route-specific pharmacokinetic data (bioavailability, half-life) and **merges it into the dosage/duration sections** where the UI reads it.

**Data flow:**
1. AI generates `route_bioavailability`, `route_half_life`, `route_bioavailability_notes`, `route_half_life_notes`
2. Script merges these into existing `dosage.routes[].bioavailability` and `duration.routes[].half_life`
3. Core pharmacology fields (mechanism_of_action, receptor_binding, metabolism, metabolites) stay in pharmacology section

```javascript
// AI generates:
pharmacology: {
  mechanism_of_action: [...],
  receptor_binding: {...},
  metabolism: "...",
  metabolites: [...],
  route_bioavailability: { "Oral": "~90%", "Intravenous": "100%" },
  route_half_life: { "Oral": "9-14 hours" },
  route_bioavailability_notes: { "Oral": "Well absorbed..." },
  route_half_life_notes: { "Oral": "pH-dependent..." }
}

// Script merges into:
dosage.routes[].bioavailability  // ← from route_bioavailability
dosage.routes[].bioavailability_notes  // ← from route_bioavailability_notes
duration.routes[].half_life  // ← from route_half_life
duration.routes[].half_life_notes  // ← from route_half_life_notes
```

**Why this architecture?**
- The UI displays bioavailability/half-life in the Dosage & Duration section, not Pharmacology
- Route names are matched case-insensitively (e.g., "Oral" matches "oral")
- Only routes that exist in dosage/duration are updated

**Schema fields added (Jan 29, 2026):**
```typescript
pharmacologySchema = z.object({
  mechanism_of_action: z.array(z.string()),
  receptor_binding: z.record(z.string(), z.string()),
  metabolism: z.string(),
  metabolites: z.array(z.string()),
  // Route-specific (generated by AI, merged into dosage/duration)
  route_bioavailability: z.record(z.string(), z.string()).optional(),
  route_half_life: z.record(z.string(), z.string()).optional(),
  route_half_life_notes: z.record(z.string(), z.string()).optional(),
  route_bioavailability_notes: z.record(z.string(), z.string()).optional(),
});
```

**Lightweight context mode:** Like harm_potential, uses minimal context (title, classification only).

### harm_potential

**Default behavior:** Only processes articles that already have harm_potential content. Use `--all` flag to process all 502 articles with quote files.

**Quote files location:** `harmpotential-quotes/{slug}-harmpotential.md`

**⚠️ LIGHTWEIGHT CONTEXT MODE (Jan 2026):**

The harm_potential batch script uses minimal context to reduce token usage:

```javascript
// User message contains ONLY:
{
  title: "Ketamine",
  psychoactive_class: ["Dissociative"],
  chemical_class: ["Arylcyclohexylamine"],
}
```

**NOT included:** Full article YAML, dosage, duration, pharmacology, legality, history, etc.

The model generates harm_potential content based primarily on the extracted quotes, with minimal substance identification context. This significantly reduces input tokens (~8-10K vs ~16K+ with full context).

**Schema Structure (Updated Jan 2026):**

The harm_potential section uses structured severity levels alongside freeform descriptions:

```yaml
harm_potential:
  addiction:
    psychological:
      level: "extremely_low" | "low" | "moderate" | "high" | "extremely_high" | null
      description: "Freeform text..."
    physical_dependence:
      level: "extremely_low" | "low" | "moderate" | "high" | "extremely_high" | null
      description: "Freeform text..."

  toxicity:
    lethal_dosage:  # NEW nested structure (Jan 2026)
      notes: "Freeform text for approximate lethal doses, human case reports, informal estimates"
      ld50:  # Formal LD50 data from human or animal studies (optional)
        - species: "rat"
          route: "oral"
          value: 500
          unit: "mg/kg"
    organ_toxicity:  # Array of structured entries
      - system: "urinary"
        findings: "Bladder damage with chronic use"
        mechanism: "5-HT2B agonism" (actual bio mechanism, NOT "associated with high doses")
        notes: "Associated with frequent high-dose use"
    carcinogenicity:
      level: "confirmed" | "probable" | "possible" | "no_evidence" | "unknown" | null
      evidence:  # Optional detailed breakdown
        human_epidemiological: "none" | "negative" | "limited" | "positive" | null
        animal_models: { level, species[] } | null
        in_vitro: { type: "genotoxic" | "non-genotoxic", assay_type } | null
        mechanistic: { level: "none" | "possible", basis } | null
      description: "Freeform text..."
    antibiotic_function:
      level: "confirmed" | "probable" | "possible" | "no_evidence" | "unknown" | null
      description: "Freeform text..."

  psychosis:  # Top-level, NOT under "risks"
    level: "extremely_low" | "low" | "moderate" | "high" | "extremely_high" | null
    description: "Freeform text..."

  seizure:  # Top-level, NOT under "risks"
    level: "extremely_low" | "low" | "moderate" | "high" | "extremely_high" | null
    description: "Freeform text..."
```

**lethal_dosage structure (Jan 2026):**
- `notes`: Freeform text for approximate lethal doses, human case reports, informal estimates
- `ld50`: Array for formal LD50 data from controlled human or animal studies
- UI displays notes above the LD50 table (if both present)
- Card title is "Lethal Dosage" (not "LD50")

**Removed from schema:**
- `risks` wrapper (psychosis/seizure are now top-level)
- `risks.self_harm`
- `risks.other`
- `toxicity.other`

**Severity Level Definitions:**

| Level | Risk Fields | Carcinogenicity |
|-------|-------------|-----------------|
| extremely_low | Minimal risk even with regular use | — |
| low | Rare; requires predisposing factors | — |
| moderate | Notable minority of users | — |
| high | Common with regular use | — |
| extremely_high | Near-certain with regular use | — |
| confirmed | — | IARC Group 1 |
| probable | — | IARC Group 2A |
| possible | — | IARC Group 2B |
| no_evidence | — | Studies show no activity |
| unknown | Insufficient data | Insufficient data |

**Backward Compatibility:**

The UI component (`HarmPotentialSection.tsx`) handles both old and new schema formats. Articles with old string-based fields display correctly until regenerated.

**Migration Script:**

```bash
# Transform existing data from old to new schema structure
node scripts/migrate/migrate-harm-potential-schema.mjs --dry-run
node scripts/migrate/migrate-harm-potential-schema.mjs
```

### history_culture

**Status:** ✅ COMPLETE (Jan 17, 2026) - 245 articles processed

**Flags:**
- `--all` - Process all articles with quotes (includes already-done)
- `--new-only` - Process only articles with quotes but WITHOUT existing content (recommended for incremental runs)

**Quote files location:** `history-culture-quotes/{slug}-history-culture.md`

**Output structure:** Uses either `content` (freeform paragraphs) or `sections` array with `{heading, content, date_range?, subsections?}` objects, depending on how much material is available.

**date_range feature (added Jan 17, 2026):**
- Sections and subsections can have optional `date_range: { start: string, end?: string }`
- AI generates date ranges when sections have clear time periods (e.g., "Discovery and Synthesis (1938–1943)")
- Single dates use only `start` (e.g., `{ start: "1943" }`)
- Ranges use both (e.g., `{ start: "1963", end: "1971" }`)
- Displayed in UI as parenthetical text next to section headings
- Schema updated in `src/schema/substance.schema.ts`
- UI updated in `src/components/sections/HistoryCultureSection.tsx`
- Prompt updated in `src/data/config/sectionPrompts/historyCulture.md`

**Syncing prompts:** If you update the prompt file, sync to Convex:
```bash
VITE_CONVEX_URL="https://enchanted-echidna-791.convex.cloud" node scripts/migrate/migrate-prompts-to-convex.mjs
```

### dosage_duration

**Status:** ✅ Script ready, tested

**⚠️ DIFFERENT FROM OTHER BATCH SCRIPTS:**

| Aspect | Other Scripts | dosage_duration |
|--------|---------------|-----------------|
| Model | Claude Opus 4.5 | **Claude Haiku 4.5** |
| Reasoning | high | **medium** |
| Context | Full article (minus target section) | **Minimal** (title, names, classification, existing dosage/duration only) |
| Mode | Fresh Slate (regenerate) | **Review Mode** (improve existing) |
| Saving | At end of batch | **Incremental** (after each batch of 3) |
| Preserves | N/A | **bioavailability, half_life** (pharmacology-owned) |

**Why different?**
- Dosage/duration is structured data extraction, not complex reasoning
- Full article context is wasteful as articles grow larger with history/legality
- Incremental saves prevent data loss if batch is interrupted
- Review mode improves existing data rather than regenerating from scratch

**Script:** `scripts/batch/batch-generate-dosage-duration.mjs`

**Quote files:** `dosage-duration-quotes/{slug}-dosage-duration.md`

**Config:**
```javascript
const CONFIG = {
  model: "anthropic/claude-haiku-4.5",
  maxTokens: 8192,
  temperature: 0.3,
  reasoningEffort: "medium",
  maxConcurrency: 5,
};
```

**Minimal context sent to model:**
```yaml
title: "LSD"
identification:
  common_name: "LSD"
  substitutive_name: "..."
classification:
  psychoactive_class: [...]
  chemical_class: [...]
dosage:  # existing data for review
  routes: [...]
duration:  # existing data for review
  routes: [...]
```

Does NOT include: history_culture, legality, harm_potential, subjective_effects, pharmacology details, citations, etc.

**Pharmacology-owned fields preserved:**
- `dosage.routes[].bioavailability` - kept from existing article
- `dosage.routes[].bioavailability_notes` - kept from existing article
- `duration.routes[].half_life` - kept from existing article
- `duration.routes[].half_life_notes` - kept from existing article

The AI never sees these fields, and they're restored after generation.

**Incremental saving:**
- Saves through the configured Convex/app write path after each batch of articles completes
- If batch is interrupted (Ctrl+C, crash, API limit), already-processed articles are saved
- Progress tracked in `notes-and-plans/exports/batch/batch-dosage-duration-progress.json`

**Usage:**
```bash
# Test single substance
node scripts/batch/batch-generate-dosage-duration.mjs --substance=lsd

# Small batch test
node scripts/batch/batch-generate-dosage-duration.mjs --limit=5

# Full batch (241 articles with existing content)
node scripts/batch/batch-generate-dosage-duration.mjs --concurrency=3

# Process articles without existing content
node scripts/batch/batch-generate-dosage-duration.mjs --new-only
```
