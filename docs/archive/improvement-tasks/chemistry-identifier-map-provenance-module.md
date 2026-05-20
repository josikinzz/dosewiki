# Chemistry Identifier Map Provenance Module

## Files

- `src/data/mappings/iupacSmilesMap.json`
- `src/data/mappings/titleIupacSmiles.json`
- `scripts/data/generateSmilesMap.mjs`
- `src/schema/substance/classification.ts`
- `src/data/schema/fieldOverrides/identification.ts`
- `src/features/dev/forms/OverviewFieldsRHF.tsx`
- `scripts/parsers/psychonautwiki/structured.ts`
- `scripts/parsers/sources/isomerdesign.ts`
- `scripts/parsers/sources/wikipedia.ts`
- `scripts/parsers/drugbank/chemistry.ts`
- `scripts/prepopulate/prepopulate-high-confidence.mjs`

## Problem

Chemical identifiers are spread across local maps, parser outputs, prepopulation scripts, schema field overrides, and editor inputs without one Module that owns identifier provenance. The IUPAC to SMILES map includes string, null, and mixture/component-style values, but callers do not get a typed Interface that explains whether a value is verified, unresolved, mixed, parsed, or editor-entered.

There is also a path mismatch in the generation workflow: `scripts/data/generateSmilesMap.mjs` writes `src/data/iupacSmilesMap.json`, while the scoped runtime mapping file lives at `src/data/mappings/iupacSmilesMap.json`. Because `src/data/` is backup/seed/export material and Convex is authoritative for live runtime data, this creates a shallow and risky Interface: maintainers must remember which local JSON files are artifacts, which are inputs, and how parsed chemistry identifiers should flow into article fields.

## Proposed deepening opportunity

Create a chemical identifier provenance Module that models IUPAC, SMILES, InChI Key, CAS, formula, molecular weight, and source/provenance state behind one Interface. The Module should expose operations such as:

- normalize parsed chemistry identifiers from source parsers
- merge high-confidence identifiers into an article draft without overwriting stronger provenance
- read/write identifier map artifacts through a named Adapter
- report unresolved/null/mixture SMILES explicitly

Keep `SubstanceArticle.identification` as the article storage shape, but stop treating local maps as direct caller-facing truth. The OPSIN map, title map, parser outputs, and editor form fields should become Adapters feeding the identifier provenance Module.

## Benefits

- **Module**: Gives chemical identifiers a dedicated Module instead of scattering field rules across maps, scripts, parsers, and forms.
- **Interface**: Makes provenance, unresolved values, and mixture values part of the Interface rather than hidden JSON conventions.
- **Implementation**: Concentrates OPSIN fetch results, map paths, parser normalization, and merge policy inside one Implementation.
- **Depth**: Adds Depth because callers can request normalized identifier decisions without knowing each source artifact.
- **Seam**: Creates a seam between parsed/source chemistry and article identification storage.
- **Adapter**: OPSIN maps, title maps, source parsers, and editor form fields become concrete Adapters.
- **Leverage**: New identifier sources can reuse the merge/provenance policy instead of adding another one-off prepopulation path.
- **Locality**: Path mismatches, null handling, and overwrite rules can be fixed in one place.

## Test plan

- Add unit tests for identifier normalization, null SMILES, mixture/component SMILES, and provenance ranking.
- Add tests for the OPSIN map Adapter proving it reads and writes the intended `src/data/mappings/` artifact path.
- Add parser fixture tests that feed chemistry extracts into the Module and assert normalized identifier output.
- Add prepopulation tests for "empty target field", "existing stronger value", and "unresolved source value" merge cases.

## Risk/rollout notes

Do not change live article data during the first pass. Wrap existing map/script behavior behind the Module, then fix artifact paths and merge policy in separate reviewable steps. Any Convex backfill should be planned as a data migration after the Interface is stable.
