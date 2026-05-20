# Chemistry Molecule Asset Resolution Module

## Files

- `src/data/mappings/moleculeAssets.ts`
- `src/data/mappings/moleculeSvgMappings.json`
- `src/types/content.ts`
- `src/data/builders/contentBuilder.ts`
- `src/features/article/components/sections/HeroSection.tsx`
- `scripts/data/syncMoleculeAssets.mjs`
- `public/molecules/`

## Problem

Molecule structure assets are resolved through a shallow Module whose Interface leaks storage details. `moleculeAssets.ts` knows the JSON file shape, title normalization, article id matching, URL encoding, cache lifecycle, and public URL policy. The public article hero then performs a client-side title lookup with `getMoleculeUrlByTitle(title)`, while `SubstanceContent` already has `moleculeAsset` and `moleculeAssets` fields that are not populated by `contentBuilder.ts`.

The asset sync script also hard-codes `src/data/moleculeSvgMappings.json`, while the runtime Module imports `src/data/mappings/moleculeSvgMappings.json`. That makes the generation/sync path and runtime path different Interfaces for the same molecule catalog. A maintainer has to know the JSON location, public folder convention, title matching behavior, and article view behavior to change one molecule asset rule.

## Proposed deepening opportunity

Create a molecule asset catalog Module with one route-ready Interface for resolving molecule assets from an article identity:

- article id, title, and identification fields in
- ordered `MoleculeAsset[]` plus provenance/status out
- no public component knowledge of JSON filenames, URL encoding, or fallback matching

Move the JSON import, validation, indexing, URL construction, and provenance interpretation behind that Module. Use the same Module or a shared manifest path Adapter from `scripts/data/syncMoleculeAssets.mjs` so the sync script and runtime agree on the catalog location and shape. `contentBuilder.ts` should populate `moleculeAssets` once, and `HeroSection` should receive the resolved asset through the article/content view model instead of starting its own client-side lookup.

## Benefits

- **Module**: Treats the molecule catalog as a real Module rather than a JSON helper plus component effect.
- **Interface**: Narrows molecule lookup to article identity and resolved assets, hiding mapping file details.
- **Implementation**: Keeps JSON loading, cache building, URL encoding, deduplication metadata, and sync-path policy inside one Implementation.
- **Depth**: Adds Depth because callers get molecule display data without learning catalog internals.
- **Seam**: Establishes a seam between article/content building and molecule asset storage.
- **Adapter**: The JSON manifest and `public/molecules/` folder become concrete Adapters behind the catalog Interface.
- **Leverage**: Future SVG, generated PNG, or remote molecule image sources can plug in without editing public article components.
- **Locality**: Broken mapping paths, title matching bugs, and asset provenance changes stay local to the catalog Module and sync script.

## Test plan

- Add unit tests for resolving by article id, title fallback, duplicate mappings, URL encoding, and missing/invalid entries.
- Add a script-level test or smoke check that `scripts/data/syncMoleculeAssets.mjs` reads the same manifest path used by runtime.
- Add a content builder test asserting `moleculeAssets` is populated for a fixture with a mapped article id.
- Add a HeroSection/component test confirming the hero renders a supplied resolved molecule asset without performing its own lookup.

## Risk/rollout notes

Start by wrapping the current JSON behavior behind the new Module and keeping output URLs identical. Then migrate `contentBuilder.ts` and `HeroSection.tsx` to consume resolved assets. Keep the old title lookup as a temporary Adapter during rollout if public pages still pass raw `SubstanceArticle` objects in some paths.
