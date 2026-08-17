# Molecule depiction data and static SVG generation

The canonical molecule set lives in Convex `moleculeOverrides`: one MOL block and one
brand-coloured SVG per substance. It is the **only** source of substance depictions —
`/dev` → Molecules, public substance pages, the chemical-class comparison rows, and the
download pack all read that same row set. The retired static substance SVGs are gone; the
only static molecule art left is the chemical-class Markush skeletons
(`public/molecules/classes/`, Effect Index colourway in `public/molecules-ei/classes/`).

The baseline Convex set is generated from each live `substanceIndex.identification.smiles` with
the editor's exact OpenChemLib path (`smilesToMolblock.ts`: `fromSmiles` +
`inventCoordinates`) and exact OpenChemLib brand renderer (`renderMoleculeSvg.ts` — the same
engine that draws the editing canvas). `npm run molecules:rerender-convex` regenerates every
stored SVG from its stored MOL block on that renderer (dry-run by default; live writes require
`--write --confirm-molecule-rerender` plus the data-ops production-write flags).

## Drawing engine (RDKit, class skeletons only)

`render_molecules.py` no longer renders substances; it survives as the style/orientation
engine that `render_class_structures.py` imports to draw the class skeletons. The style
contract it implements (and that `renderMoleculeSvg.ts` mirrors for Convex rows):

| Requirement | Mechanism (RDKit) |
| --- | --- |
| Each molecule fills its container | Tight, flexible canvas (`MolDraw2DSVG(-1,-1)`): the viewBox hugs the molecule's bounding box (no square letterboxing), so `object-contain` in the hero's fixed box fills the container to the molecule's limiting dimension (max width OR max height). A modest viewBox floor (`_floor_viewbox`, 2.0×`bondLength`) stops 2-3 atom molecules (nitrous, ethanol, …) from over-zooming, without padding them into a sea of whitespace. |
| Uniform drawing style | `fixedBondLength` + `bondLineWidth` (1.1) + `scaleBondWidth=False` keep the bond:stroke:label proportions identical across the whole set, so every molecule is drawn in the same weight/style. (On-screen scale necessarily varies in fill mode — a compact molecule zooms more than a long one.) |
| Polished, light line style | Thin bonds with **rounded caps + joins** (`_round_strokes` rewrites RDKit's default `butt`/`miter`): bonds meeting at each carbon vertex blend into soft curved corners instead of sharp, heavy miters — the modern ChemDraw / PubChem look. |
| Aesthetic, textbook layouts | CoordGen (`SetPreferCoordGen(True)`) — Schrödinger's coordinate generator with built-in ring templates. |
| **Class-standard orientation** | Per-class canonical orientation tuned by eye against the legacy artwork and the depictions people recognise from Wikipedia/PubChem (`SCAFFOLD_DEFS` + `align()` in `render_molecules.py`, ~40 scaffolds). Each scaffold has a `rot`/`flip` and a `rigid` flag: rigid fused-ring cores (ergoline, morphinan, salvinorin, THC) lay out consistently via CoordGen directly, while flexible cores (phenethylamines, tryptamines, cathinones, benzodiazepines, quinazolinones, xanthines, racetams, synthetic cannabinoids, …) are hard-constrained to the scaffold with `GenerateDepictionMatching2DStructure`; both then get the class rotation. Scaffold order matters: generic cores (phenylpiperidine, benzylpiperazine, xanthine, benzamide) sit late in the list so they don't steal morphinans, benzhydryl piperazines, fenethylline, etc. from their proper classes — see the inline comments before reordering. |
| **Unmatched-molecule orientation** | Molecules matching no scaffold get a deterministic fallback (`canonicalize_default_orientation`): principal axis (PCA) rotated horizontal, ring-system centroid mirrored to the left half, heteroatom centroid mirrored to the upper half. Long molecules read left-to-right with rings left and O/N labels up (aspirin, ibuprofen, nicotine, … land in their textbook orientations) instead of whatever angle CoordGen picks. |
| **Per-substance tweaks** | `SUBSTANCE_ORIENT` maps slug → extra `(rot, flip)` applied after layout + class rotation, for one-offs whose familiar depiction differs from the deterministic result (e.g. haloperidol, moclobemide drawn horizontal). |
| Element colour-coding | Brand atom palette (`updateAtomPalette`): C/H fuchsia, N violet, O rose, S lime, F/P amber, Cl emerald, Br rose, I fuchsia. Decoded from the legacy `recolorMolecules.mjs` palette so new art matches old. |
| Transparent background | `clearBackground=False`. |

## SMILES sources (priority order)

Used by `molecules:smiles-coverage` and the Convex seeder:

1. `identification.smiles` inline in `src/data/SubstanceIndex.json` (incl. multi-component
   `{components:{...}}` preparations — the principal/first component is drawn).
2. `src/data/mappings/generatedSmiles.json` — gap-fill SMILES found via PubChem/Wikipedia for
   substances missing inline data. For plants/preparations/brands, `represents` names the active
   molecule drawn (e.g. Salvia → Salvinorin A, Datura → Scopolamine, Marinol → dronabinol/THC).
   Rebuild it from reviewed gap-fill batches with `npm run molecules:merge-smiles`.
3. `titleIupacSmiles.json` / `iupacSmilesMap.json` (legacy maps).

For current depiction coverage, query `api.moleculeOverrides.listSlugs`. To
compare that live row set with the live substance corpus, run
`npm run molecules:seed-convex -- --dry-run` and inspect
`tmp/molecule-seed/report.json`.

## Seed the canonical Convex set

Dry-run is the default. It reads the configured Convex target, never overwrites an existing row,
and writes a JSON summary plus up to five `.mol`/`.svg` samples under `tmp/molecule-seed/`:

```bash
npm run molecules:seed-convex -- --dry-run --limit 5
```

The deliberate production command is:

```bash
npm run convex:doctor
TARGET_CONVEX_URL=https://glad-minnow-656.convex.cloud \
  npm run molecules:seed-convex -- --write --confirm-molecule-seed \
  --confirm-write=seed-canonical-molecule-depictions \
  --expected-deployment=glad-minnow-656
```

Use `--limit N` for a bounded live batch and `--report PATH` to relocate the local report. Writes
use the existing `editorArticleWrite` admin intent and the guarded
`moleculeOverrides.seedMissing` mutation. The mutation checks `by_slug` again transactionally, so
it cannot replace a row created after the initial read. Seeded rows carry `source: "seeded"` and
`updatedBy: "seed-convex-molecules"`; the first editor save changes `source` to `"editor"`.

## Build the download pack (from Convex)

The public download pack is built straight from the canonical Convex depiction set — no
Python env and no static SVGs (chemical-class skeletons excepted):

```bash
npm run molecules:pack           # Convex -> public/dosewiki-molecules.{json,zip}
npm run molecules:pack -- --check  # exit 1 if the committed manifest drifted (no writes)
```

`scripts/data/buildMoleculePack.ts` reads every `moleculeOverrides` row over the public
queries, ships the stored brand SVG verbatim under `molecules/` (class rows under
`molecules/classes/`, plus any static `public/molecules/classes/*.svg` without a Convex
override), re-renders each substance MOL block in the standard textbook palette
(`OCL_COLOR_TO_STANDARD`) under `molecules-standard/`, and writes the
`dosewiki-molecules.json` manifest into both the ZIP and `public/`. Any render failure
fails the run — a partial pack is never shipped. The Convex URL comes from
`--convex-url=` / `SOURCE_CONVEX_URL` / `CONVEX_PUBLIC_READ_URL` /
`VITE_CONVEX_URL` / `NEXT_PUBLIC_CONVEX_URL`, defaulting to production; the npm script
disables bun's implicit `.env.local` loading so a no-env run always packs production.
Staged files get a fixed mtime, so the ZIP is byte-identical until the depiction
set changes. Saving a Convex row does not rewrite the committed pack. Run
`npm run molecules:pack` to update both public files locally; the nightly
`.github/workflows/molecule-pack-nightly.yml` workflow runs the same command and
commits changes. The updated downloads become public when that commit is
deployed.

## Regenerate the static class structures

```bash
npm run molecules:setup-venv        # one-time: create .venv-molecules with RDKit
npm run molecules:generate-classes  # chemicalIndexManual.json -> public/molecules/classes/<key>.svg
npm run molecules:generate-ei       # recolour classes -> public/molecules-ei/classes/
npm run molecules:check-ei          # fail if public/molecules-ei/classes/ is out of date (no writes)
```

The Effect Index recolour is a pure string substitution over the SVG bytes, defined once in
`src/data/mappings/moleculePalette.ts` and shared with the serve-time recolour applied to
Convex `moleculeOverrides` rows by `src/app/api/molecules/**`. It needs no Python env.

Override the interpreter with `MOLECULE_PYTHON=/path/to/python npm run molecules:generate-classes`.

## Editing a published depiction

Automatic layout sometimes draws **wedge/hash stereo bonds** badly (overlapping, pointing into
rings) for stereochemically complex molecules. Fix one by hand in the **`/dev` → Molecules** tab
(works locally and on the admin host):

- The editor (OpenChemLib canvas) loads the molecule's MOL block, you reposition atoms and
  reassign wedge/hash bonds, and a live preview rendered by the same OpenChemLib engine + an
  RDKit-backed InChI **stereo guard** confirm you only changed the *drawing*, not the *chemistry*.
- The editor starts from the Convex MOL block, including rows created by the seed. **Revert to
  auto** regenerates the SMILES layout in the canvas only; the public article does not change
  until **Save depiction** is pressed.
- Saving writes the MOL block plus pre-rendered SVG to `moleculeOverrides` through
  `/api/dev/molecule-override`, then revalidates the article path. Versioned image URLs use
  `updatedAt` and immutable caching, so a refreshed article requests the new asset URL. There can
  still be a short platform revalidation propagation delay after Save.
- Convex rows are the whole story: there is no static substance pipeline behind them.

## Hand-fixing a class structure

Chemical-class Markush structures use the same `/dev` → Molecules editor in **Classes** mode.
Saving writes a Convex override under `class:<class-key>` and the class detail page serves that
stored SVG. Static generation uses `src/data/molecules/class-overrides/<class-key>.mol`: when a
file exists there, `render_class_structures.py` draws that MOL block verbatim instead of deriving
the class skeleton from `chemicalIndexManual.json`. The orchestrator and
`npm run molecules:generate-classes` both pass `--overrides src/data/molecules/class-overrides`.

## Files

- `render_molecules.py` — the drawing engine (palette, scaffolds, drawing options); imported
  by the class renderer, no longer run for substances.
- `render_class_structures.py` — render the chemical-class Markush skeletons.
- `validate_smiles.py` — stdin JSON array of SMILES → JSON array of booleans (parseable?).
- `seed-convex-molecules.ts` / `rerender-convex-molecules.ts` — seed and re-render the
  canonical Convex set.
- `../data/resolveSmilesCoverage.mjs` — resolve a SMILES per substance.
- `../data/mergeGeneratedSmiles.mjs` — merge gap-fill batches → `generatedSmiles.json`.
- `../data/generateEffectIndexMoleculeColorway.ts` — recolour the class skeletons into the
  Effect Index colourway.
- `../data/buildMoleculePack.ts` — build the download manifest + ZIP from Convex.
