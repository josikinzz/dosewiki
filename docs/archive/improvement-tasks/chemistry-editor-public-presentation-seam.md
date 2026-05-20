# Chemistry Editor Public Presentation Seam

## Files

- `src/features/dev/forms/ChemistryFieldsRHF.tsx`
- `src/features/dev/forms/ChemistryFieldsRHF.test.tsx`
- `src/features/dev/forms/OverviewFieldsRHF.tsx`
- `src/features/dev/forms/ReagentPreviewFieldsRHF.tsx`
- `src/features/article/components/sections/HeroSection.tsx`
- `src/features/article/components/sections/ReagentSection.tsx`
- `src/data/builders/contentBuilder.ts`
- `src/schema/substance/classification.ts`
- `src/data/schema/fieldOverrides/identification.ts`

## Problem

The editor and public article do not have a clear chemistry presentation seam. The file named `ChemistryFieldsRHF.tsx` is actually a pharmacology editor: it edits pharmacodynamics, receptor profile, pharmacokinetics, metabolites, and route bioavailability/half-life. Core chemistry identifiers such as IUPAC, SMILES, CAS, formula, molecular weight, and InChI Key are edited in `OverviewFieldsRHF.tsx`, while reagent preview lives in a separate form module and public molecule display lives in the hero.

This creates a shallow Module shape around "chemistry": the Interface is a file name, field placement conventions, generated prompt behavior, and public rendering assumptions rather than an explicit article chemistry model. The test named `ChemistryFieldsRHF.test.tsx` verifies generated pharmacology application, which increases navigation friction and makes future chemistry-specific work likely to touch the wrong Module.

## Proposed deepening opportunity

Define an article chemistry presentation Module that owns the chemistry-facing view of a substance:

- structural identifiers for editor and public detail display
- molecule asset availability
- reagent-testing preview/display eligibility
- chemistry field grouping labels and ownership
- distinction between chemistry, pharmacology, and reagent testing

Then align editor Modules to those concepts. `ChemistryFieldsRHF.tsx` should either become a pharmacology Module or the chemistry identifiers should move behind a true chemistry editor Interface. Public article sections should receive chemistry view-model data from `contentBuilder.ts` rather than resolving pieces independently in hero/reagent components.

## Benefits

- **Module**: Replaces misleading chemistry/pharmacology file ownership with Modules named after the article concepts they implement.
- **Interface**: Makes the chemistry Interface explicit: identifiers, molecule assets, reagent testing, and public display eligibility.
- **Implementation**: Keeps form placement, generated pharmacology application, molecule display, and reagent display in their proper Implementations.
- **Depth**: Adds Depth because editor/public callers consume article chemistry presentation data instead of rediscovering fields.
- **Seam**: Creates a seam between raw `SubstanceArticle.identification` fields and editor/public chemistry presentation.
- **Adapter**: Existing RHF forms and public article sections become Adapters over the same chemistry presentation model.
- **Leverage**: New chemistry fields can be added once to the model and surfaced consistently in editor and public views.
- **Locality**: Naming fixes, field moves, and public display policy changes stay local to chemistry/pharmacology presentation Modules.

## Test plan

- Add tests for the chemistry presentation model covering identifiers present/missing, molecule asset present/missing, and reagent data present/loading/missing.
- Rename or split the existing pharmacology generator test so it verifies a pharmacology Module, not a chemistry Module.
- Add editor smoke tests for chemistry identifier fields and reagent preview consuming the shared presentation model.
- Add public article tests asserting hero/reagent visibility is driven by the presentation model rather than independent field checks.

## Risk/rollout notes

Start with naming and view-model extraction before moving UI fields. Keep route-visible behavior unchanged. Any editor layout change should be staged separately because it can affect contributor workflows even if the underlying article shape stays the same.
