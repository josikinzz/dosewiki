# Promoted Substance Subsection Pipeline Tracker

Last updated: 2026-06-17

## Scope

This tracks the 28 promoted substances that were previously low-priority/homepage-hidden and were checked against the excerpt-to-subsection pipeline described by the visual explainer.

Target Convex deployment: `https://glad-minnow-656.convex.cloud`.

Tracked slugs:

`alcohol`, `tobacco`, `nitrous`, `lisdexamfetamine`, `sertraline`, `bupropion`, `hydroxyzine`, `promethazine`, `salvia`, `khat`, `lean`, `mdpv`, `a-pvp`, `4-ho-met`, `4-ho-mipt`, `2c-p`, `psilocin`, `phenazepam`, `zaleplon`, `melatonin`, `clobazam`, `nitrazepam`, `kanna`, `noopept`, `piracetam`, `phenylpiracetam`, `theanine`, `u-47700`.

`ald-52` exists and was included in the priority bump, but it was not part of this 28-drug subsection pipeline pass.

## Final Result

- Priority bump: all 28 tracked slugs are now `priority: "normal"` in public Convex. `ald-52` is also now `normal`.
- Eligible source-backed drugs: 27 of 28 have Convex `articleSources` packets and were run through quote extraction plus generation for the supported script-backed sections.
- Blocked drug: `zaleplon` has no Convex `articleSources` packet and no quote docs, so the strict excerpt-to-subsection pipeline could not be run for missing sections.
- Manual-only section: `subjective_effects` is excluded from generation per user instruction. An accidental extraction run created quote docs for `alcohol`, `tobacco`, and `lisdexamfetamine`; those three generated `subjective_effects` quote docs were deleted.
- Dosage/duration: existing public dosage/duration content was preserved. This pass did not regenerate dosage/duration because the current shared quote extractor has no dosage-duration extraction prompt; the existing dosage-duration generator is local-file oriented.
- Citation queue: updated in the external workbench tracker so the promoted batch is prioritized immediately after the active `nitrous` run.

## Completed Pipeline Work

| Section | Result |
|---|---|
| `summary` | Quote extraction and summary generation completed for all 27 source-backed slugs. |
| `harm_potential` | Harm quote docs and regenerated harm sections completed for all 27 source-backed slugs. This included a late fill for `tobacco`, `sertraline`, `theanine`, and `u-47700`. |
| `legality` | Legality quote docs and regenerated legality sections completed for all 27 source-backed slugs. `khat` and `kanna` generated empty legality because the quote docs did not contain usable legal material. `u-47700` was filled in a late pass. |
| `pharmacology` | Manual quote extraction plus pharmacology generation completed for all 27 source-backed slugs. |
| `history_culture` | Manual quote extraction plus history/culture generation completed for all 27 source-backed slugs. |
| `tolerance` | Tolerance quote extraction plus generation completed for all 27 source-backed slugs. Some outputs are intentionally empty where source quotes did not support tolerance claims. |
| `subjective_effects` | Manual-only; no generated subsection work retained. |
| `dosage_duration` | Not regenerated in this pass; no current shared extraction prompt. Existing public dosage/duration content remains. |

## Per-Substance Status

| Slug | Priority | Pipeline status |
|---|---|---|
| `alcohol` | normal | Complete for summary, harm, legality, pharmacology, history/culture, and tolerance. |
| `tobacco` | normal | Complete for summary, harm, legality, pharmacology, history/culture, and tolerance. |
| `nitrous` | normal | Complete for summary, harm, legality, pharmacology, history/culture, and tolerance. |
| `lisdexamfetamine` | normal | Complete for summary, harm, legality, pharmacology, history/culture, and tolerance. |
| `sertraline` | normal | Complete for summary, harm, legality, pharmacology, history/culture, and tolerance. |
| `bupropion` | normal | Processed; tolerance quote doc generated no supported tolerance output, so the structured tolerance fields remain empty. Other generated sections complete. |
| `hydroxyzine` | normal | Complete for summary, harm, legality, pharmacology, history/culture, and tolerance. |
| `promethazine` | normal | Processed; tolerance quote doc generated no supported tolerance output, so the structured tolerance fields remain empty. Other generated sections complete. |
| `salvia` | normal | Processed; tolerance quote doc generated no supported tolerance output, so the structured tolerance fields remain empty. Other generated sections complete. |
| `khat` | normal | Processed; legality quote doc generated no supported legality output, so legality remains empty. Other generated sections complete. |
| `lean` | normal | Complete for summary, harm, legality, pharmacology, history/culture, and tolerance. |
| `mdpv` | normal | Complete for summary, harm, legality, pharmacology, history/culture, and tolerance. |
| `a-pvp` | normal | Complete for summary, harm, legality, pharmacology, history/culture, and tolerance. |
| `4-ho-met` | normal | Complete for summary, harm, legality, pharmacology, history/culture, and tolerance. |
| `4-ho-mipt` | normal | Complete for summary, harm, legality, pharmacology, history/culture, and tolerance. |
| `2c-p` | normal | Complete for summary, harm, legality, pharmacology, history/culture, and tolerance. |
| `psilocin` | normal | Complete for summary, harm, legality, pharmacology, history/culture, and tolerance. |
| `phenazepam` | normal | Complete for summary, harm, legality, pharmacology, history/culture, and tolerance. |
| `zaleplon` | normal | Blocked: no Convex `articleSources` packet and no quote docs. Existing public pharmacology, harm, and dosage/duration content remains, but summary, legality, history/culture, and tolerance could not be generated through the strict excerpt pipeline. |
| `melatonin` | normal | Processed; tolerance quote doc generated no supported tolerance output, so the structured tolerance fields remain empty. Other generated sections complete. |
| `clobazam` | normal | Complete for summary, harm, legality, pharmacology, history/culture, and tolerance. |
| `nitrazepam` | normal | Complete for summary, harm, legality, pharmacology, history/culture, and tolerance. |
| `kanna` | normal | Processed; legality and tolerance quote docs generated no supported output, so those structured fields remain empty. Other generated sections complete. |
| `noopept` | normal | Processed; tolerance quote doc generated no supported tolerance output, so the structured tolerance fields remain empty. Other generated sections complete. |
| `piracetam` | normal | Complete for summary, harm, legality, pharmacology, history/culture, and tolerance. |
| `phenylpiracetam` | normal | Complete for summary, harm, legality, pharmacology, history/culture, and tolerance. |
| `theanine` | normal | Complete for summary, harm, legality, pharmacology, history/culture, and tolerance. |
| `u-47700` | normal | Complete for summary, harm, legality, pharmacology, history/culture, and tolerance. Harm and legality quote docs were filled in late passes before regeneration. |

## Verification Snapshot

Final live audit against public Convex:

- `not-normal`: none for the 28 tracked slugs plus `ald-52`.
- Missing quote docs among tracked slugs: only `zaleplon`, which has no article source packet.
- Source-backed slugs with intentionally empty generated fields:
  - `bupropion`, `promethazine`, `salvia`, `melatonin`, `noopept`: tolerance processed, no supported output.
  - `khat`: legality processed, no supported output.
  - `kanna`: legality and tolerance processed, no supported output.
- `ald-52`: priority bumped to normal; still outside this pipeline pass and only has harm/legal quote docs.

## Implementation Notes

- Patched target-safe persistence for generated section writes so public Convex updates apply to the current target article instead of stale local JSON.
- Patched Convex-backed summary/tolerance extraction and generation paths needed for this run.
- Added/used manual quote save utility for pharmacology/history quote docs.
- Patched harm extraction Convex save path to pass the quote migration admin key, then used it to fill missing harm quote docs.
- A broad accidental subjective-effects extraction was interrupted; generated `subjective_effects` quote docs for `alcohol`, `tobacco`, and `lisdexamfetamine` were deleted immediately.
