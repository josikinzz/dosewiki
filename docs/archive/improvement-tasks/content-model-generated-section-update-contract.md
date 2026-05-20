# Content Model Generated Section Update Contract

## Files

- `src/features/dev/forms/ArticleSectionGenerator.tsx`
- `src/features/dev/forms/{DosageDuration,HarmPotential,Legality,Chemistry,Interactions,Tolerance}FieldsRHF.tsx`
- `src/features/dev/forms/pharmacologyApplyGenerated.ts`
- `src/features/dev/tools/substance-editor/yamlParser*.ts`
- `scripts/batch/{dosage-duration,harm-potential,legality,pharmacology}/{parser,lib,persist}.mjs`
- `scripts/prepopulate/prepopulate-{dosage-duration,high-confidence,interactions-tripsit,tolerance,legality,pharmacology}.mjs`
- `scripts/prepopulate/dosage-duration/`
- `src/schema/substance.schema.ts`
- `src/schema/substance/`

## Problem

Generated section output is applied through several unrelated paths. The dev form parses YAML and calls `setValue` field by field for dosage, duration, harm potential, legality, interactions, tolerance, and pharmacology. Pharmacology has a more explicit helper because generated route-level bioavailability and half-life values also update dosage and duration routes. Batch generators parse generated YAML in section-local parser/persist modules. Prepopulate scripts transform parsed source records into article sections with another set of merge and overwrite rules.

The result is a shallow generated-update Interface: each caller must know the generated YAML wrapper shape, legacy compatibility fields, overwrite-vs-merge policy, route matching, empty defaults, validation expectations, and which neighboring sections may be touched. Bugs have weak Locality because the same section update can behave differently in the dev editor, batch generator, and prepopulate workflow.

This is not just persistence orchestration. The friction sits before writing: "given generated or imported section content, what article patch is valid, what existing data is preserved, and what diagnostics should be reported?"

## Proposed deepening opportunity

Create a generated section update Module for substance article sections. Its Interface should accept:

- the current `SubstanceArticle`
- a section key such as `dosage_duration`, `harm_potential`, `legality`, `tolerance`, `interactions`, or `pharmacology`
- a source Adapter for generated YAML, parsed source data, or already-normalized section data
- an update mode such as preview, editor apply, batch apply, or prepopulate apply

It should return an article patch or next article plus diagnostics: fields changed, fields preserved, skipped data, validation errors, route additions, legacy field normalization, and neighboring sections touched. The Implementation should own section-specific merge policy, including pharmacology-to-dosage/duration route updates and dosage/duration route matching.

Dev forms would apply returned patches to React Hook Form. Batch persist modules would pass the patch to the persistence Module. Prepopulate scripts would become source Adapters that produce normalized update input instead of owning article mutation policy.

## Benefits

- **Module**: generated section application becomes one Module rather than form-local, batch-local, and prepopulate-local mutation code.
- **Interface**: callers provide current article, section key, source Adapter, and mode; they do not need to know YAML wrappers, legacy fields, route merge rules, or neighboring-section effects.
- **Implementation**: parsing normalization, merge policy, validation, and diagnostics are local to the generated update Implementation.
- **Depth**: dev, batch, and prepopulate callers get consistent section mutation behavior from a small Interface.
- **Seam**: generated content crosses a clear update seam before it reaches Convex, local exports, or public rendering.
- **Adapter**: OpenRouter YAML, parsed source records, TripSit combos, legality source data, and manual editor paste become Adapters into the same update contract.
- **Leverage**: adding a new generated section or changing overwrite policy benefits editor preview, batch generation, and prepopulate workflows together.
- **Locality**: compatibility bugs in harm potential LD50 fields, legality country records, tolerance arrays, interactions rationale strings, or pharmacology route maps are fixed once.

## Test plan

- Add section-update fixtures for dosage/duration, harm potential, legality, tolerance, interactions, and pharmacology using the same current article input across editor, batch, and prepopulate modes.
- Test wrapper and unwrapped YAML parsing, legacy harm-potential `ld50`, empty-string defaults, empty-array defaults, and validation failures.
- Test pharmacology route maps updating existing dosage/duration routes and adding missing routes without dropping dose ranges or duration stages.
- Test that generated updates never write `editorial_review` unless the section key is explicitly editor-only and the mode allows it.
- Keep existing batch and dev form tests as Adapter parity tests, then run `npm run typecheck`.

## Risk/rollout notes

Roll out section by section. Start with tolerance or interactions because they have small shapes, then legality, harm potential, dosage/duration, and pharmacology. Keep current dev form handlers and batch parsers as compatibility Adapters during migration. Do not change persistence target behavior in this task; generated section updates should produce patches that existing save paths can consume.
