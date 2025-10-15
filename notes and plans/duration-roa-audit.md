# Duration Table ROA Audit

## Overview
- Goal: document how multi-ROA duration strings are currently formatted in `src/data/articles.json` and define a safe path to migrate them to per-route duration tables that mirror the dosage tables.
- Scope: all 502 published substance records (each supplies `drug_info.duration`). Initial findings came from ad-hoc Python tooling; the latest pass normalised the live dataset (107 dosage route labels, 1,017 duration strings) with a safety backup at `src/data/articles.json.pre-roa-normalization.bak`.

## Dataset Survey
| Metric | Count | Notes |
| --- | ---: | --- |
| Articles with duration data | 502 | All records present the five-stage object (`total_duration`, `onset`, `peak`, `offset`, `after_effects`). `comeup`/`comedown` are unused. |
| Route-aware stage entries (≥1 ROA token) | 471 | Across all stages; 117 mention a single ROA, 354 mention multiple. |
| Stage entries without explicit ROA | 2,039 | These should be duplicated across all routes after migration (treated as general defaults). |
| Articles with any multi-ROA duration string | 227 | Concentrated in `onset` (226 articles), then `total_duration` (54), `peak` (43), `offset` (26), `after_effects` (3). |
| Parsed duration segments (after splitting on `;`, `|`, commas outside parentheses) | 3,021 | 810 segments contain an explicit ROA reference. |

## ROA Vocabulary Normalization (2026-05-12)
- Backed up `src/data/articles.json` to `src/data/articles.json.pre-roa-normalization.bak` before any edits.
- Normalised 107 dosage route labels to canonical wording (e.g., `IV` → `intravenous`, `vaped / smoked (free-base)` → `vaporized / smoked (free base)`), keeping contextual qualifiers such as release forms or preparation notes.
- Cleaned 1,017 duration strings to expand abbreviations (`IV`, `IM`, `IN`) and standardise dashes/slash spacing so combos read as `intravenous / intramuscular`, `oral / insufflated`, etc.
- Preserved descriptive qualifiers by carrying them in the value text (e.g., `oral (extended release)`, `vaporized / smoked (free base)`), ensuring UI surfaces still show formulation nuances without duplicating route keys.
- Manual follow-up adjusted edge cases like Ketamine’s onset (`seconds (intravenous); …`) where the previous notation lost units, confirming the normaliser didn’t erase critical context.

### Segment pattern frequencies (810 route-tagged segments)
| Pattern | Count | Example |
| --- | ---: | --- |
| `value (ROA[, ROA…])` | 350 | `15-30 minutes (oral), 5-15 minutes (insufflated)` |
| `ROA: value` or `ROA – value` | 84 | `Oral: 30-60 min; Insufflated: 1-2 min` |
| `ROA value` (route prefix, no punctuation) | 102 | `IM 1-5 min`, `Oral 10-30 min` |
| `value ROA` (route suffix) | 246 | `20–60 min oral`, `5–10 min insufflated` |
| Ambiguous / mixed | 28 | e.g. `Within minutes (when formed… )`, `IV seconds`, `≤2 min vaporised` |

## ROA Vocabulary Snapshot
Canonical mapping proposed for migration (derived from dosage routes + duration strings):

| Canonical route | Current labels |
| --- | --- |
| oral (24) | `oral`; `oral (beads crushed / parachuted)`; `oral (capsule / powder)`; `oral (capsule / solution)`; `oral (capsule or powder)`; `oral (extended release)`; `oral (extrapolated)`; `oral (immediate release)`; `oral (intact XR capsule)`; `oral (liquid; swallowed)`; `oral (powder / capsule)`; `oral (powdered dried root)`; `oral (solution / capsule)`; `oral (swallowed arecoline HBr solution / capsule)`; `oral (tablet; sublingually dissolved)`; `oral (tablets / capsules; dissolved powder)`; `oral (toss and wash / capsules / pressed tabs)`; `oral (volumetric solution; 1 mg / 10 mL)`; `oral / orally disintegrating tablet`; `oral / sublingual`; `oral / sublingual (blotter or liquid)`; `oral / sublingual (blotter)`; `oral / sublingual (blotter, liquid, or pellet)`; `oral / sublingual (volumetric only)` |
| insufflated (10) | `insufflated`; `insufflated (crushed beads)`; `insufflated (extrapolated)`; `insufflated (intranasal)`; `insufflated (irritating)`; `insufflated (liquid)`; `insufflated (rare; not recommended)`; `insufflated (strong burn; discouraged)`; `insufflated (very caustic; discouraged)`; `insufflated*` |
| intranasal (3) | `intranasal`; `intranasal (experimental)`; `intranasal (investigational / pediatric)` |
| sublingual (7) | `sublingual`; `sublingual (ODT or liquid)`; `sublingual (powder held under tongue)`; `sublingual / buccal`; `sublingual / buccal (10 mg Huny Mint or lozenge)`; `sublingual / buccal (blotter)`; `sublingual / oral (ethanol tincture; 1:2 w / v fresh ratio; ~45-60% alc.)` |
| buccal (2) | `buccal`; `buccal (chewed betel quid)` |
| rectal (5) | `rectal`; `rectal (boofed)`; `rectal (crushed beads in solution)`; `rectal (dissolved solution)`; `rectal (solution)` |
| vaporized (8) | `vaporized`; `vaporized / inhaled`; `vaporized / nebulized e-liquid`; `vaporized / smoked`; `vaporized / smoked (e-cig)`; `vaporized / smoked (free base)`; `vaporized / smoked (freebase foil or mesh)`; `vaporized / smoked (freebase)` |
| smoked (2) | `smoked`; `smoked / vaporized` |
| inhaled (2) | `inhaled`; `inhaled (smoked / vaporized)` |
| intravenous (5) | `intravenous`; `intravenous (bolus)`; `intravenous (clinical use only)`; `intravenous (high risk)`; `intravenous infusion (resedation prevention)` |
| intramuscular (2) | `intramuscular`; `intramuscular (clinical setting)` |
| subcutaneous (1) | `subcutaneous` |
| intrathecal (1) | `intrathecal` |
| transdermal (2) | `transdermal`; `transdermal (topical)` |

Combo labels in the table (for example `oral / sublingual`, `vaporized / smoked`) should be split into their constituent routes when building per-ROA duration tables—they are not standalone categories.

Release-form qualifiers such as `oral (immediate release)` / `oral (extended release)` map back to the same oral route key; keep the wording in the stage value (or a per-route note) so readers still see formulation differences without duplicating routes.

_Recommendation_: normalise duration metadata to the same canonical keys used for dosage routes (after stripping parenthetical qualifiers), while keeping the original route label for UI display. `intranasal`/`IN` should collapse into the existing `insufflated` entries; `inhaled` segments should map to `smoked` or `vaporized` depending on context (flagged below).

## Ambiguous or Edge-Case Segments (27)
These require manual review or refined heuristics before migration:
- `Cocaethylene – onset: Within minutes (when formed in the body after simultaneous use of cocaine and alcohol)` – biochemical context, no route to expose.
- `Serdexmethylphenidate – total_duration: Up to 13 hours (when combined with dexmethylphenidate, as in Azstarys)` – combination caveat.
- `Ketamine – onset: IV seconds` – missing numeric unit; treat as `seconds (IV)`.
- `Lofentanil – onset: 5–10 min IN` and similar `IN` suffixes (needs `IN` → `intranasal` mapping before parsing).
- `25E-NBOH – onset: <1 min vaporised`, `MDMPEA – onset: 3–10 min insufflated.` – trailing punctuation/angle brackets.
- `Etoxadrol – onset: rapid (seconds to a minute) after IV bolus` – descriptive prose inside parentheses.
- `Crack (Cocaine) – onset: 5-10 s after inhalation` – choose between mapping `inhalation` to `smoked` or adding an `inhaled` pseudo-route.
- `25T-2-NBOMe – onset mentions oral, but dosage table lacks an oral entry (buccal/sublingual only)` – requires data decision.

(See script log for full 27-entry list; recommend exporting to CSV before migration for QA.)

## Duration vs. Dosage Route Misalignments (23 articles)
Cases where duration strings reference a route absent from the dosage table after canonicalisation. Key groups:
1. **Oral missing from blotter-only entries** – e.g. `25T-2-NBOMe` names oral in duration but dosage supports only buccal/sublingual. Decide whether to add an oral dosage row or relabel the duration copy.
2. **Intranasal vs. Insufflated nomenclature** – several pharma entries (e.g. `Serdexmethylphenidate`, `Brotizolam`) use “IN” in durations while dosage only lists oral. Confirm whether an intranasal route should be added or the duration text should be scoped to oral use.
3. **Parenteral gaps** – `Fentanyl` duration includes IM but dosage omits it; `Isotonitazene` duration calls out IV despite no parenteral dosage table. Need either to add empty dosage shells for those routes or collapse the duration text back into general guidance.
4. **Inhaled cannabinoids / synthetic cannabinoids** – many durations use “inhaled” while dosage differentiates `smoked` vs `vaporized`. Decide whether to map “inhaled” to one of the existing labels or expose a shared inhalation route.

I stored these 23 titles with their unmatched route tokens for reference during implementation.

## Proposed Data Model
Introduce a duration schema parallel to dosages:

```json
"duration": {
  "general": {
    "total_duration": "4-8 hours",
    "onset": "15-30 minutes",
    "peak": "1-3 hours",
    "offset": "2-4 hours",
    "after_effects": "Up to 24 hours (residual effects)"
  },
  "routes_of_administration": [
    {
      "route": "oral",
      "stages": {
        "onset": "15-30 minutes",
        "peak": "1-3 hours",
        "offset": "2-4 hours",
        "after_effects": "Up to 24 hours"
      }
    },
    {
      "route": "insufflated",
      "stages": {
        "onset": "5-15 minutes",
        "peak": "1-2 hours",
        "offset": "1-3 hours"
      }
    }
  ]
}
```

Behaviours:
- `general` holds defaults duplicated to every displayed route when a stage lacks a route-specific override.
- `routes_of_administration[].stages` may omit keys when data is unknown (UI will show “not available” for gaps).
- Optional `duration.notes` (string) could capture prose currently mixed into stage values (e.g., combination caveats) if we need a catch-all.

## Migration Strategy
1. **Canonical map preparation**
   - Build a synonym dictionary covering all tokens observed in durations (`oral`, `IN`, `IV`, `patch`, `vaporised`, etc.) → canonical route keys that align with dosage entries.
   - Normalise dosage route labels (strip parentheses/qualifiers) to the same canonical set and retain a mapping back to the original label for UI slugging.

2. **Segment parsing**
   - Split each stage string into segments using the bracket-aware splitter described above.
   - For each segment, detect the formatting pattern in the order: `value (ROA)`, `ROA: value`, `ROA value`, `value ROA`, `slash combos`.
   - Extract the clean value (preserve parenthetical notes that are not ROA tokens) and the list of canonical routes.
   - For slash combos (`IV/IM`, `oral/insufflated`), expand to individual routes.

3. **Stage assignment**
   - Populate `duration.routes_of_administration[route].stages[stageKey]` with the parsed value for each route hit in the segment.
   - Track which routes/stages received explicit values. Any residual text that could not be parsed (ambiguous list) should be logged for manual intervention or stored under `general`.

4. **General fallback**
   - If a stage string yielded no route-specific data (e.g. `Up to 24 hours`), set the value on `duration.general[stageKey]`.
   - After processing per route, back-fill missing stage values from `general` so the UI inherits existing behaviour where no route-specific copy exists.

5. **Validation**
   - Emit a summary of routes without matching dosage entries; review and either add empty dosage shells or remap the duration segment.
   - Run `npm run build` and `npm run build:inline` after data mutation to ensure `contentBuilder` still normalises without runtime errors.
   - Spot-check high-risk entries (above ambiguous list) inside the app to confirm the route switcher now toggles distinct dosage + duration blocks.

## Next Steps (post per-ROA conversion)
Per-ROA duration tables now ship from tooling, Dev Tools expose route-level editors, and runtime consumers read the new schema. Remaining work focuses on QA and rolling the data out safely.

1. **Data QA sweep**
   - Spot-check a diverse set of articles (multi-route combos, ER/IR form factors, inhaled vs smoked) using the dry-run file to confirm each route renders a complete five-stage table with the correct qualifiers.
   - Generate summary metrics from `articles.duration-migrated.json` (e.g., count of duplicated defaults vs bespoke timings) to monitor clustering before promotion.
   - **2026-05-14 QA checkpoint:** Reviewed `3-MeO-PCP`, `Ketamine`, `Methylphenidate`, `DMT`, `Buprenorphine`, and `Methadone` against the dry-run output. Every route rendered a dedicated table; legacy data gaps surfaced as follows — Ketamine rectal peak missing, Methadone IV onset absent, DMT oral still inherits smoked timings, and transdermal Buprenorphine lacks onset/peak copy from source content.
     - Dataset-wide stats: 935 route tables with 129 missing ≥1 stage (onset 96×, total duration 43×, peak 21×, offset 7×, after-effects 1×). Flag these for follow-up authoring rather than tooling fixes.
     - Created safety backup `src/data/articles.json.pre-duration-migration.bak` ahead of promotion; production dataset now points to the per-ROA structure.

### Missing stage investigation (2026-05-14)
- **Root cause:** The converter depends on explicit stage copy per route. The 129 incomplete tables trace back to legacy records where the original duration strings only described a subset of routes (e.g., “15‑30 min (smoked)” with no oral counterpart) or omitted particular stages entirely. Because no “general” fallback text existed for those stages, the migrated per-route tables legitimately remain blank.
- **Scope:** 109 articles affected. Canonical route hotspots:
  - Rectal: 28 onset gaps (plus 5 total-duration omissions) caused by records that only ever described insufflated/oral timings.
  - Insufflated: 28 onset + 20 total-duration gaps, typically research chemicals with only oral timings documented.
  - Sublingual & oral: onset missing where copy focused on alternate delivery (e.g., lozenges referencing buccal absorption).
  - Intravenous: seven peak and five onset/total-duration gaps where legacy text only supplied “seconds” references for onset or combined IV/IM copy in a single clause that the parser split incorrectly.
  - Transdermal/buccal/intrathecal outliers stem from pharma entries whose source copy only listed therapeutic onset (“varies”).
- **Verification artefact:** Once the helper lands (see TODO below), run `node scripts/listMissingDurationStages.mjs` to regenerate a JSON/CSV report that matches the aggregate counts above whenever the dataset changes.

### Remediation plan
1. **Generate actionable report**
   - [ ] Add a helper script (e.g., `scripts/listMissingDurationStages.mjs`) that walks `articles.json`, emits `notes and plans/duration-missing-stage-report.json`, and groups the 129 gaps by article, route label, canonical route, and missing stage list. Re-run after every migration tweak.
2. **Triage by route family**
   - [ ] Prioritise the four heaviest buckets (rectal onset, insufflated onset/total, sublingual onset, IV peak). For each, review the legacy duration copy in `articles.json.pre-duration-migration.bak` to confirm whether data was never authored or whether the parser dropped a clause (e.g., IV/IM shared sentences).
   - [ ] If parser nuance caused the gap (e.g., `intravenous / intramuscular` clauses splitting incorrectly), extend `splitDurationByRoute.mjs` with targeted pattern handlers so subsequent runs populate both routes.
3. **Author or source missing copy**
   - [ ] Where the legacy dataset truly lacked timings, research authoritative sources (TripSit, clinical monographs) and author per-stage copy. Maintain citations in each article’s `citations` array when new data is introduced.
   - [ ] For pharmaceutical ER/IR variants, coordinate with dosage tables to ensure onset/peak phrasing mirrors the release-form distinctions already present.
4. **Validate updates**
   - [ ] After applying manual edits, rerun `node scripts/splitDurationByRoute.mjs` followed by the new reporting helper to confirm the gap count decreases.
   - [ ] Rebuild (`npm run build`, `npm run build:inline`) and spot-check representative articles (one per corrected bucket) to ensure UI renders complete tables.
5. **Document completion**
   - [ ] Log progress in this audit file (routes cleared, outstanding counts) until the missing-stage tally reaches zero, then remove the TODOs.

2. **Promote migrated dataset**
   - Once QA passes, replace `src/data/articles.json` with the migrated output, keeping the legacy backup and feature toggle in place for quick rollback.
   - Update release checklist to call out the new schema and ensure importer scripts consume the per-route durations.

3. **Resolve skip list**
   - Work through the 12 ambiguous articles and 23 route mismatches logged in `src/data/durationMigrationSkips.json`, clarifying copy or extending synonym rules so the splitter can onboard them.
   - Re-run `scripts/splitDurationByRoute.mjs` after each batch to keep the dry-run file current and shrink the manual queue.

4. **Doc & tooling polish**
   - Refresh `notes and plans/dosewiki-site-readme.md` and internal tooling docs to reflect the new editing flow and schema.
   - Add CLI helpers (or update existing scripts) to diff per-route duration tables alongside dosage tables during future audits.

## Migration tooling (2025-10-15)
- Added shared vocabulary files `src/data/routeSynonyms.json` + `routeSynonyms.ts` so scripts, `contentBuilder`, and Dev Tools canonicalise ROA labels in the same way.
- Implemented `scripts/splitDurationByRoute.mjs`; running `node scripts/splitDurationByRoute.mjs` performs a dry-run conversion of `src/data/articles.json`, writing:
  - Structured output to `src/data/articles.duration-migrated.json` (479 articles converted, 23 unstructured holdouts).
  - Skip metadata to `src/data/durationMigrationSkips.json` with timestamped ambiguous segments and route mismatches.
- `contentBuilder` now reads the structured schema (`duration.general` + `duration.routes_of_administration[]`) while preserving legacy flat strings as a fallback. Dev Tools form helpers persist untouched per-route durations in draft payloads.
- Updated the splitter to duplicate shared timings across every route and drop the `general` fallback; dry-run output now mirrors dosage tables with one duration block per ROA.
- Dev Tools dosage panel now mirrors runtime behaviour with per-route duration editors (copy-from-default action included) so editors can manage the new schema without touching raw JSON.

### Skip list snapshot
| List | Articles | Entries | Notes |
| --- | ---: | ---: | --- |
| Ambiguous segments | 12 | 23 | Primarily inhalation-only records (no matching dosage route) plus isolated intranasal-only pharma entries. |
| Route mismatches | 23 | 38 | Many correspond to inhaled vs. smoked/vaporized splits; remaining items flag missing IV/IM dosage shells. |

Structured migration total: 479 articles (out of 502). Legacy duration copy for the remaining 23 articles is untouched until manual fixes or bespoke parsing rules close the gap.

## Risks & Follow-up
- **Parsing accuracy**: While ~96% of route-tagged segments fit the identified patterns, the 27 ambiguous entries need manual judgement or custom handlers.
- **Route vocabulary drift**: Dosage data contains 80+ distinct route labels with qualifiers. We should centralise canonicalisation logic to avoid the duration parser and `contentBuilder` diverging.
- **Tooling debt**: Dev Tools now handle per-route editing, but we should backstop the new UI with regression tests once the testing harness lands.
- **Data duplication**: Duplicating shared timing across multiple routes increases maintenance overhead; introduce migration checks that flag diverging copies for future clean-up.
- **Data QA**: After migration, compare rendered dosage vs duration tables for outliers (e.g., oral duration showing on insufflated route) before shipping.

Next steps once approved: follow the Immediate Next Steps plan above, promote the migrated dataset behind a feature toggle, and run targeted QA on the edge-case queue before switching everything over.
