# Psychoactive Index Configuration Dev Tools Gameplan

## Objectives
- Replace the hard-coded psychoactive grouping logic in `src/data/library.ts` with a data-driven configuration that lives alongside `articles.json` data.
- Provide Dev Tools users with a purpose-built UI to inspect, tweak, and version-control the index layout (category definitions, exclusions, sub-groups, and sort orders) without editing TypeScript.
- Keep the runtime pipeline simple, predictable, and backwards-compatible so existing category cards can be replicated exactly before rolling out new layouts.

## Proposed configuration schema
Create `src/data/psychoactiveIndexConfig.json` (document the shape in a leading block comment) that ships the full set of rules the builder needs. Suggested structure:

```jsonc
{
  "$schema": "/schemas/psychoactive-index-config.schema.json",
  "version": 1,
  "defaults": {
    "fallbackCategoryKey": "miscellaneous",
    "dedupeStrategy": "first-match", // prevents the same slug from appearing in multiple cards
    "implicitSort": "alpha"
  },
  "categories": [
    {
      "key": "psychedelic",
      "label": "Psychedelic",
      "iconKey": "psychedelic",
      "aliases": ["psychedelics"],
      "match": {
        "rules": [
          { "field": "anyTag", "values": ["psychedelic"] }
        ],
        "mode": "any"
      },
      "exclude": {
        "rules": [
          { "field": "anyTag", "values": ["hidden"] }
        ]
      },
      "denylist": { "names": [], "slugs": [] },
      "priority": 10,
      "sections": [
        {
          "key": "common",
          "label": "Common",
          "match": { "rules": [{ "field": "normalizedCategory", "values": ["common"], "mode": "any" }] },
          "manualOrder": ["LSD", "Mescaline", "DMT (Dimethyltryptamine)", "2C-B"],
          "sort": { "type": "manual-alpha" }
        },
        {
          "key": "lysergamide",
          "label": "Lysergamides",
          "match": { "rules": [{ "field": "chemicalClass", "values": ["Lysergamides"], "mode": "any" }] }
        }
      ],
      "overflow": {
        "label": "Other psychedelics",
        "sort": { "type": "alpha" }
      }
    }
  ],
  "exclusionMatrix": [
    { "source": "psychedelic", "target": "hallucinogen" },
    { "source": "dissociative", "target": "hallucinogen" }
  ]
}
```

## Current-state configuration snapshot
- Generated reference config lives at `notes and plans/psychoactive-index-config-current.json`. It re-expresses the current psychoactive index rules using the proposed schema (sections, manual orders, denylists, and the hallucinogen exclusion matrix).
- The JSON mirrors every hard-coded helper in `src/data/library.ts`: stimulant exclusions, entactogen denylist, custom section groups, manual ordering, and the fallback misc bucket.
- Preview extract:

```json
{
  "key": "psychedelic",
  "label": "Psychedelic",
  "iconKey": "psychedelic",
  "aliases": [
    "psychedelics"
  ],
  "match": {
    "mode": "any",
    "rules": [
      {
        "field": "anyTag",
        "values": [
          "psychedelic"
        ]
      }
    ]
  },
  "sections": [
    {
      "key": "common",
      "label": "Common",
      "match": {
        "mode": "any",
        "rules": [
          {
            "field": "normalizedCategory",
            "values": [
              "common"
            ]
          }
        ]
      },
      "manualOrder": [
        "LSD",
        "Mescaline",
        "DMT (Dimethyltryptamine)",
        "2C-B"
      ],
      "sort": "manual-alpha"
    },
    {
      "key": "lysergamides",
      "label": "Lysergamides",
      "match": {
        "mode": "any",
        "rules": [
          {
            "field": "chemicalClass",
            "values": [
              "Lysergamides"
            ]
          }
        ]
      },
      "manualOrder": [
        "LSD",
        "AL-LAD",
        "LSZ",
        "1B-LSD",
        "1cP-AL-LAD",
        "1cP-LSD",
        "1cP-MiPLA",
        "1D-LSD",
        "1P-ETH-LAD",
        "1P-LSD",
        "1S-LSD"
      ],
      "sort": "manual-alpha"
    },
    {
      "key": "tryptamines",
      "label": "Tryptamines",
      "match": {
        "mode": "any",
        "rules": [
          {
            "field": "chemicalClass",
            "values": [
              "Tryptamines"
            ]
          }
        ]
      },
      "manualOrder": [
        "DMT (Dimethyltryptamine)",
        "Ibogaine",
        "alpha-Methyltryptamine (AMT)",
        "DiPT (N,N-Diisopropyltryptamine)",
        "DPT (N,N-Dipropyltryptamine)",
        "2-Me-DMT (2-Methyl-N,N-dimethyltryptamine, 2,N,N-TMT)",
        "2-MeO-DMT",
        "4-AcO-DET",
        "4-AcO-DMT (O-Acetylpsilocin)",
        "4-AcO-DPT",
        "4-HO-McPT",
        "4-HO-MET",
        "4-HO-PiPT",
        "4-MeO-MiPT",
        "4-PrO-DMT",
        "4-PrO-MET (4-propionoxy-4-HO-MET prodrug)",
        "5-Bromo-DMT",
        "5-Cl-AMT",
        "Bufotenin",
        "5-MeO-AMT",
        "5-MeO-DALT",
        "5-MeO-DiBF (5-Methoxy-diisopropylbenzofuranethylamine)",
        "5-MeO-DMT",
        "5-MeO-DPT (5-methoxy-N,N-dipropyltryptamine)",
        "5-MeO-MiPT"
      ],
      "sort": "manual-alpha"
    },
    {
      "key": "2c-x",
      "label": "2C-X",
      "match": {
        "mode": "any",
        "rules": [
          {
            "field": "normalizedCategory",
            "values": [
              "2C-X"
            ]
          },
          {
            "field": "chemicalClass",
            "values": [
              "2C-X"
            ]
          }
        ]
      },
      "manualOrder": [
        "2C-B",
        "2C-B-AN",
        "2C-B-FLY",
        "2C-BZ",
        "2C-C",
        "2C-D",
        "2C-E",
        "2C-EF",
        "2C-F (2,5-dimethoxy-4-fluorophenethylamine)",
        "2C-G",
        "2C-I",
        "2C-iP",
        "2C-N",
        "2C-P",
        "2C-T-2",
        "2C-T-21",
        "2C-T-4",
        "2C-T-7",
        "2C-TFM"
      ],
      "sort": "manual-alpha"
    },
    {
      "key": "mescaline-homologues",
      "label": "Mescaline homologues",
      "match": {
        "mode": "any",
        "rules": [
          {
            "field": "chemicalClass",
            "values": [
              "Mescaline homologues"
            ]
          }
        ]
      },
      "manualOrder": [
        "Mescaline",
        "AEM (α-Ethylmescaline, 2-Amino-1-(3,4,5-trimethoxyphenyl)butane)",
        "Methallylescaline (MAL)"
      ],
      "sort": "manual-alpha"
    },
    {
      "key": "n-benzylated-phenethylamines",
      "label": "N-benzylated phenethylamines",
      "match": {
        "mode": "any",
        "rules": [
          {
            "field": "chemicalClass",
            "values": [
              "N-benzylated phenethylamines"
            ]
          }
        ]
      },
      "manualOrder": [
        "2C-B-FLY-NBOMe",
        "25B-NBOH",
        "25C-NB3OMe",
        "25CN-NBOH",
        "25E-NBOH",
        "25H-NBOMe",
        "25I-NBF",
        "25I-NBMD",
        "25I-NBOH",
        "25I-NBOMe",
        "25iP-NBOMe",
        "25T-2-NBOMe",
        "25T-NBOMe",
        "2C-P-NBOMe (25P-NBOMe, NBOMe-2C-P)",
        "2C-T-4-NBOMe",
        "2C-T-7-NBOMe",
        "C30-NBOMe"
      ],
      "sort": "manual-alpha"
    },
    {
      "key": "psychedelic-amphetamines",
      "label": "Psychedelic amphetamines",
      "match": {
        "mode": "any",
        "rules": [
          {
            "field": "chemicalClass",
            "values": [
              "Psychedelic amphetamines"
            ]
          }
        ]
      },
      "manualOrder": [
        "2,5-Dimethoxy-4-ethoxyamphetamine (MEM)",
        "3C-E (3,5-dimethoxy-4-ethoxy-amphetamine)",
        "3C-P (4-propoxy-3,5-dimethoxyamphetamine)",
        "ALEPH",
        "ALEPH-2 (2,5-Dimethoxy-4-ethylthioamphetamine)",
        "ALEPH-6 (2,5-Dimethoxy-4-phenylthioamphetamine)",
        "ARIADNE (4C-D, Dimoxamine, 4C-DOM, BL-3912)",
        "Bromo-DragonFLY",
        "DOB (2,5-Dimethoxy-4-bromoamphetamine)",
        "DOC (2,5-Dimethoxy-4-chloroamphetamine)",
        "DOEF",
        "DOET",
        "DOM (2,5-Dimethoxy-4-methylamphetamine)",
        "TMA (3,4,5-Trimethoxyamphetamine)",
        "TMA-2 (2,4,5-Trimethoxyamphetamine)"
      ],
      "sort": "manual-alpha"
    },
    {
      "key": "other-psychedelics",
      "label": "Other psychedelics",
      "match": {
        "mode": "any",
        "rules": [
          {
            "field": "normalizedCategory",
            "values": [
              "other psychedelics"
            ]
          }
        ]
      },
      "manualOrder": [
        "BOH-2C-B (BOHB)",
        "Yopo (Anadenanthera peregrina)"
      ],
      "sort": "manual-alpha"
    }
  ],
  "overflow": {
    "strategy": "chemicalClass"
  },
  "denylist": {
    "names": [],
    "slugs": []
  }
}
```

Key ideas:
- `match.rules` references normalized datasets (`anyTag` aggregates categories/index categories/psychoactive classes, `normalizedCategory`, `chemicalClass`, `mechanism`, `slug`, `nameRegex`). `mode` can be `any`, `all`, or `not` to cover simple boolean logic.
- `exclude.rules` mirrors `match` to support per-card filters like the current stimulant exclusions.
- `denylist` prevents manual outliers (mirrors the current entactogen exclusions) without writing code.
- `sections` each have a `match` block, optional `manualOrder`, and an optional `sort` override (`alpha`, `manual-alpha`, `bySlug`, or `none` when the manual order is exhaustive).
- `autoSections` (optional) lets a category fall back to a predefined grouping strategy (`chemicalClass` today, `alpha` for `miscellaneous`) when no explicit sections are defined.
- `overflow` (optional) controls the catch-all section name + sort when an entry matches the category but not any explicit section; the current build uses shortcuts like `{ "strategy": "chemicalClass" }` to mirror legacy behavior.
- `denylist` blocks specific names/slugs from landing in a card—even when they match the category rules—and always appears (even empty) so the UI can treat the shape consistently.
- `priority` (optional) can force display order; categories missing from the config are ignored, allowing future toggles. The fallback category is only emitted if no other category claims a record.
- `exclusionMatrix` enforces cross-category dedupe (replicating the hallucinogen filtering)—the builder will skip a target category if the substance already landed in any of the listed source keys.
- Ship a JSON schema (`/schemas/psychoactive-index-config.schema.json`) to power runtime validation and form hints.

## Runtime pipeline adjustments
1. Build a new helper in `src/data/categoryConfig.ts` that:
   - Imports the JSON (type-checked with Zod or a hand-written validator) and exports a normalized `CategoryConfig[]` plus helpers for rule evaluation.
   - Provides per-field normalization functions (lowercase slug comparisons, trimmed display names) so the config stays human-readable.
   - Surfaces validation warnings (unknown tags, empty sections, duplicated ordering entries) during build.
2. Refactor `buildCategoryGroups` in `src/data/library.ts` to:
   - Load the parsed config and iterate categories in `priority` order.
   - Evaluate `match`/`exclude` rules against the `CategorizedRecordContext` that already exists; a generalized `matchesRuleSet(context, ruleSet)` can replace bespoke `filterStimulantRecords`, `filterEntactogenRecords`, and manual deny lists.
   - Track assigned slugs to enforce `dedupeStrategy` and `exclusionMatrix` rules.
   - For each category, partition matches into section buckets (run `sections` sequentially, pulling matches and removing them from the working set) and send the remainder to the `overflow` section.
   - Build `DosageCategoryGroup` objects the same way (`sections` flatten into `drugs`, manual orders preserved, fallback alpha sort otherwise) so `CategoryGrid` can remain untouched.
3. Expose derived metadata (e.g., a `Map<categoryKey, CategoryRuleSummary>`) for Dev Tools to render tooltips about how the card is constructed.
4. Extend `dosageCategoryGroups`, `chemicalClassIndexGroups`, and `mechanismIndexGroups` exports so only the psychoactive route is driven by the new config for now. (Chemical/mechanism can follow later.)

## Dev Tools UX plan
Add a new “Index Layout” tab under Dev Mode with the following flow:

- **Overview column**
  - List all configured categories with drag handles, visibility toggles, and summary badges (number of sections, inclusion/exclusion tag counts).
  - Provide quick actions: duplicate category, reset to baseline, open JSON view.
- **Category editor panel**
  - Fields for label, internal key, icon (reuse `getCategoryIcon` values via select menu), aliases, fallback toggle.
  - Inclusion rules builder:
    - Rule rows with dropdowns for `field` (Any Tag, Category, Index Category, Psychoactive Class, Chemical Class, Mechanism Text, Name, Slug) and operator (`includes`, `equals`, `startsWith`, `regex` for name/slug only).
    - Group mode selector (`Any / All / None`).
  - Exclusion rules builder mirroring inclusion.
  - Denylist chips for names/slugs.
  - Cross-category exclusion picker referencing other category keys (rendered as multi-select, stored in `exclusionMatrix`).
- **Sections manager**
  - Accordion list of sections; each entry has label, optional description, rule builder (same schema as category-level but scoped), manual order editor (typeahead over article names, reorderable list), and fallback sort dropdown.
  - Button to add “Other / overflow” label; toggling indicates whether unmatched entries should be dropped or listed.
- **Preview & validation**
  - Right-hand preview renders the resulting card using `CategoryGrid` styling with live data from the current in-memory config (no write yet). Show warnings when entries appear twice or no entries match a required section.
  - Diff viewer highlighting how the proposed config diverges from baseline (numbers of substances, newly excluded ones, duplicates resolved, etc.).
- **Persistence workflow**
  - “Save draft” writes the config into Dev Mode state (in-memory) and surfaces JSON diff just like article edits.
  - “Export JSON” downloads the generated file for manual review.
  - “Commit-ready copy” pushes the JSON into the virtual file system (mirroring `DevModePage`’s article save flow) so the user can pull the diff and commit.
  - Advanced toggle reveals raw `JsonEditor` view of the config for power users.

## Implementation roadmap
1. **Schema & infrastructure**
   - Define TypeScript types and JSON schema, implement validator + normalizer helper, and migrate current rules into the JSON file to guarantee parity.
   - Update build scripts (and `npm run build:inline`) to validate the config during compilation; fail fast on invalid rules.
2. **Library refactor**
   - Replace psychoactive-specific hard-coded logic in `library.ts` with config-driven builder while keeping helper utilities (`createCategorizedRecordContexts`, manual order sorting) reusable.
   - Add telemetry helpers to surface outstanding issues (e.g., config references a tag that does not exist).
3. **Dev Tools tab**
   - Create new components under `src/components/sections/dev-tools/index-layout/` for the overview list, rule builders, section editor, and preview panel.
   - Integrate with `DevModeProvider` to load/save the JSON, reuse existing diff + authentication flows.
   - Wire preview to recompute category groups using the in-memory config to guarantee WYSIWYG behavior.
4. **QA & rollout**
   - Snapshot the current page output before/after migration to confirm zero regression.
   - Exercise Dev Tools (create new section, adjust exclusions, duplicate categories) and ensure config validation prevents impossible states.
   - Document the workflow in `notes and plans/dosewiki-site-readme.md` so collaborators understand how to adjust cards going forward.

## Risks & mitigation
- **Complex rule builder UX**: keep the expression language intentionally small (no nested logical groups beyond `any/all/not`) and surface the underlying JSON so power users can fine-tune without a sprawling UI.
- **Duplicate or orphaned entries**: rely on shared deduction (`dedupeStrategy`, `exclusionMatrix`) plus real-time preview warnings to catch conflicts.
- **Breaking other screens**: guard the initial refactor behind thorough regression checks of `CategoryGrid` on both Substances and Dev Tools surfaces; keep chemical/mechanism logic untouched until psychoactive migration proves stable.
- **Config drift**: enforce schema validation in CI/build and add a `lastEditedBy` + `lastEditedAt` metadata block to the JSON so change history is visible.

## Open questions
- Should we expose icon selection in the UI or restrict it to a controlled dropdown of approved icons?
- Do we need per-section clipboard export overrides, or can we keep the existing Markdown builder unchanged?
- How should we handle entries intentionally listed in multiple cards (e.g., educational cross-listing)? If needed, we can add a per-category `allowDuplicates` flag later.
- Is a future extension to chemical/mechanism indexes desirable? If so, we can generalize the schema once the psychoactive migration ships successfully.

## Implementation status
- ✅ **Schema & validation**: `src/data/psychoactiveIndexConfig.json` now powers the psychoactive index. Runtime validation lives in `src/data/psychoactiveIndexConfig.ts`, and the JSON schema ships at `schemas/psychoactive-index-config.schema.json`.
- ✅ **Library refactor**: `src/data/library.ts` consumes the normalized config to build category groups. Helper functions (`assignRecordsToCategories`, `buildCategoryGroupsForRecords`, etc.) accept arbitrary configs so previews can reuse the same engine.
- ✅ **Dev Tools UI**: `src/components/sections/dev-tools/index-layout/IndexLayoutTab.tsx` exposes a three-pane editor (overview, rule/section builder, live preview) with optional raw JSON editing. The tab persists changes via `DevModeProvider` and generates real-time previews using the draft config.
- ✅ **Docs updated**: `notes and plans/dosewiki-site-readme.md` covers the new workflow.
- 🔄 **Future work**: extend the same pattern to chemical/mechanism groupings and add config-drift metadata (`lastEditedBy`, `lastEditedAt`) if required.
