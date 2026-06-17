# ALD-52 Subsection Pipeline Tracker

Last updated: 2026-06-17

## Scope

Final verification for `ald-52` against the public Convex deployment:

`https://glad-minnow-656.convex.cloud`

This tracker records the completed subsection pipeline state for the supported script-backed sections. This final verification did not run extraction or generation scripts.

## Pipeline Constraints

- Convex is authoritative for live article data.
- The marker-only citation workbench citable surface is `summary`, `pharmacology`, `tolerance`, `harm_potential`, `history_culture`, and `legality`.
- Dosage, duration, subjective effects, comparisons, reagent testing, interactions, identification, and classification stay out of the citation-workbench pass.
- `subjective_effects` is manual-only and should not be generated.
- Dosage/duration should be preserved unless a separate user-approved manual rewrite path is requested.

## Final Result

ALD-52 is complete for the supported script-backed subsection pipeline. Public Convex now has populated article fields and quote documents for all six citable sections:

- `summary`
- `harm_potential`
- `legality`
- `pharmacology`
- `history_culture`
- `tolerance`

`subjective_effects` remains manual-only and was not required for quote extraction or generation. Dosage and duration remain present and preserved.

## Public Convex Verification

| Field | Verified state |
|---|---|
| Slug | `ald-52` |
| Title | `ALD-52` |
| Convex article id | `186` |
| Convex document id | `k9762cd6fwapcrmzcr2td7fegs7zs23d` |
| Priority | `normal` |
| `references` | present as an empty array |
| `source_citations` | 8 entries |
| `citations` | 4 entries |
| Article source packet | present, 4 public Convex article sources |

### Public Section Presence

| Section | Present | Shape / keys |
|---|---:|---|
| `summary` | yes | string, 510 chars |
| `harm_potential` | yes | `addiction`, `psychosis`, `seizure`, `toxicity` |
| `legality` | yes | `countries`, `international` |
| `pharmacology` | yes | `metabolites`, `pharmacodynamics`, `pharmacokinetics`, `receptor_profile` |
| `history_culture` | yes | `content`, `sections` |
| `tolerance` | yes | `baseline_tolerance`, `cross_tolerance`, `full_tolerance`, `half_tolerance` |
| `dosage` | yes | `plateau_dosing`, `routes`; preserved and out of citation-workbench generation scope |
| `duration` | yes | `routes`; preserved and out of citation-workbench generation scope |
| `subjective_effects` | yes | `cognitive`, `notes`, `physical`, `sensory`; manual-only |

### Convex Quote Docs

| Quote section | Present | Notes |
|---|---:|---|
| `summary` | yes | 4,648 chars, updated `2026-06-17T00:42:36.174Z` by `batch-extract-script`. |
| `harm_potential` | yes | 4,069 chars, updated `2026-03-10T20:08:38.365Z` by `sync-script`. |
| `legality` | yes | 2,857 chars, updated `2026-03-10T20:08:58.010Z` by `sync-script`. |
| `pharmacology` | yes | 13,488 chars, updated `2026-06-17T00:46:33.626Z` by `manual-extraction-worker`. |
| `history_culture` | yes | 9,430 chars, updated `2026-06-17T00:46:33.625Z` by `manual-extraction-worker`. |
| `tolerance` | yes | 966 chars, updated `2026-06-17T00:42:52.914Z` by `batch-extract-script`. |
| `dosage_duration` | not required | Out of the current shared citation-workbench pass; dosage/duration preserved. |
| `subjective_effects` | not required | Manual-only; do not generate or require quote docs. |

### Article Sources

Convex `articleSources` exists for `ald-52`.

| Source id | Display name | Tokens | Size |
|---|---|---:|---:|
| `isomerdesign` | Isomer Design | 224 | 500 |
| `psychonautwiki` | PsychonautWiki | 10,321 | 37,336 |
| `tripsit-factsheets` | TripSit Factsheets | 154 | 535 |
| `wikipedia` | Wikipedia | 2,769 | 10,577 |

Current public Convex source count: 4. The citation queue metadata was updated from 5 to 4 during final prioritization.

## Citation Workbench Queue

`ald-52` is prioritized in `/Users/josie/.codex/dosewiki-citation-workbench/trackers/citation-queue.json`.

| Field | Value |
|---|---|
| Status | `ready_for_claude` |
| Command | `/cite ald-52` |
| Run dir | `runs/ald-52` |
| Target count | `6` |
| Section count | `6` |
| Queue priority bucket | `promoted_subsection_pipeline_20260617` |
| Queue priority rank | `29` |
| Queue priority index | `234` |
| Queue placement | Section 3A immediately after `u-47700`, before general Section 3B |
| `subsectionPipelinePriority.status` | `ready_after_pipeline_refresh` |
| `subsectionPipelinePriority.trackerPath` | `/Users/josie/Documents/Utilities/dose.wiki copy/docs/ald-52-subsection-pipeline-tracker.md` |
| Next action in queue | Open Claude Code in the browser terminal and type `/cite ald-52`. |

## Completed Work Items

| Work item | Status | Notes |
|---|---|---|
| Extract `summary` quote doc | complete | Saved to Convex quotes from Convex articleSources on `2026-06-17`. |
| Extract `pharmacology` quote doc | complete | Manual extraction saved to `tmp/manual-quotes/ald-52-pharmacology.md` from full Convex articleSources dump; Convex quote id `jn7at34161wfc8ha1pn6dpqx4x88vzzm`. |
| Extract `history_culture` quote doc | complete | Manual extraction saved to `tmp/manual-quotes/ald-52-history-culture.md` from full Convex articleSources dump; Convex quote id `jn72hv8zcedv7t2rrfrqpqq82s88tw2q`. |
| Extract `tolerance` quote doc | complete | Saved to Convex quotes from Convex articleSources on `2026-06-17`. |
| Verify existing `harm_potential` quote doc | complete | Existing Convex quote doc present and public article section populated. |
| Verify existing `legality` quote doc | complete | Existing Convex quote doc present and public article section populated. |
| Generate/review `summary` | complete | Public Convex verification found populated summary text. |
| Generate/review `harm_potential` | complete | Public Convex verification found populated `addiction`, `psychosis`, `seizure`, and `toxicity`. |
| Generate/review `legality` | complete | Public Convex verification found populated `countries` and `international`. |
| Generate/review `pharmacology` | complete | Public Convex verification found populated `pharmacodynamics`, `pharmacokinetics`, `receptor_profile`, and `metabolites`. |
| Generate/review `history_culture` | complete | Public Convex verification found populated `content` and generated `sections`. |
| Generate/review `tolerance` | complete | Public Convex verification found populated tolerance timing/cross-tolerance fields. |

## Manual / Preserved Sections

| Section | Status | Reason |
|---|---|---|
| `subjective_effects` | manual-only, preserved | User instruction: subjective effects should not be generated. Existing public content is present and should be preserved unless manually edited. |
| `dosage` / `duration` | preserved, out of scope | The citation-workbench citable surface excludes dosage and duration. Existing public content is present and should be preserved unless a separate user-approved path is requested. |
| `dosage_duration` quote doc | not required for this pass | The current shared citation pass does not require it, and dosage/duration was not regenerated. |

## Execution Checklist

- [x] Verify Convex article priority is `normal`.
- [x] Verify public article fields are present for `summary`, `harm_potential`, `legality`, `pharmacology`, `history_culture`, and `tolerance`.
- [x] Verify Convex quote docs exist for `summary`, `harm_potential`, `legality`, `pharmacology`, `history_culture`, and `tolerance`.
- [x] Reconcile Convex `articleSources` source count to 4 in queue metadata.
- [x] Extract missing `summary` quotes.
- [x] Extract missing `pharmacology` quotes.
- [x] Extract missing `history_culture` quotes.
- [x] Extract missing `tolerance` quotes.
- [x] Verify existing `harm_potential` and `legality` quote docs are present.
- [x] Generate/review script-backed public sections for `summary`, `harm_potential`, `legality`, and `tolerance`.
- [x] Generate/review script-backed public sections for `pharmacology` and `history_culture`.
- [x] Preserve `subjective_effects` as manual-only; do not generate it.
- [x] Preserve dosage/duration; do not generate it.
- [x] Promote `ald-52` in the citation workbench queue immediately after `u-47700`.

## Handoff Notes

- If the user asks for citation workbench rerun afterward, follow the fresh-run/preflight and `/cite ald-52` workflow from `docs/citation-workbench-tracker.md`.
- Run apply dry-run only after reviewed workbench output exists, unless the user explicitly requests a Convex write.
