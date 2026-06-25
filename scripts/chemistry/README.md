# Molecule SVG generation

Generates one **consistent, brand-coloured** skeletal-structure SVG per substance from its
SMILES, so every drug on the site shares the same fonts, line weights, colour-coding, and
class-standard orientation. Replaces the old, visually-inconsistent Wikipedia/ChemDraw scrape.

## How consistency is achieved

| Requirement | Mechanism (RDKit) |
| --- | --- |
| Each molecule fills its container | Tight, flexible canvas (`MolDraw2DSVG(-1,-1)`): the viewBox hugs the molecule's bounding box (no square letterboxing), so `object-contain` in the hero's fixed box fills the container to the molecule's limiting dimension (max width OR max height). A modest viewBox floor (`_floor_viewbox`, 2.0×`bondLength`) stops 2-3 atom molecules (nitrous, ethanol, …) from over-zooming, without padding them into a sea of whitespace. |
| Uniform drawing style | `fixedBondLength` + `bondLineWidth` (1.1) + `scaleBondWidth=False` keep the bond:stroke:label proportions identical across the whole set, so every molecule is drawn in the same weight/style. (On-screen scale necessarily varies in fill mode — a compact molecule zooms more than a long one.) |
| Polished, light line style | Thin bonds with **rounded caps + joins** (`_round_strokes` rewrites RDKit's default `butt`/`miter`): bonds meeting at each carbon vertex blend into soft curved corners instead of sharp, heavy miters — the modern ChemDraw / PubChem look. |
| Aesthetic, textbook layouts | CoordGen (`SetPreferCoordGen(True)`) — Schrödinger's coordinate generator with built-in ring templates. |
| **Class-standard orientation** | Per-class canonical orientation tuned by eye against the legacy artwork (`SCAFFOLD_DEFS` + `align()` in `render_molecules.py`). Each scaffold has a `rot`/`flip` and a `rigid` flag: rigid fused-ring cores (ergoline, morphinan) lay out consistently via CoordGen directly, while flexible cores (phenethylamines, tryptamines, cathinones, benzodiazepines, …) are hard-constrained to the scaffold with `GenerateDepictionMatching2DStructure`; both then get the class rotation. Result: lysergamides indole-down/amide-up, morphinans phenol-up, ketamines aryl-up, 2C-x ring-left/chain-up-right, etc. — every member of a class drawn alike. |
| Element colour-coding | Brand atom palette (`updateAtomPalette`): C/H fuchsia, N violet, O rose, S lime, F/P amber, Cl emerald, Br rose, I fuchsia. Decoded from the legacy `recolorMolecules.mjs` palette so new art matches old. |
| Transparent background | `clearBackground=False`. |

## SMILES sources (priority order)

1. `identification.smiles` inline in `src/data/SubstanceIndex.json` (incl. multi-component
   `{components:{...}}` preparations — the principal/first component is drawn).
2. `src/data/mappings/generatedSmiles.json` — gap-fill SMILES found via PubChem/Wikipedia for
   substances missing inline data. For plants/preparations/brands, `represents` names the active
   molecule drawn (e.g. Salvia → Salvinorin A, Datura → Scopolamine, Marinol → dronabinol/THC).
3. `titleIupacSmiles.json` / `iupacSmilesMap.json` (legacy maps).

Coverage: **572 / 577** substances. The 5 without art have no single representable molecule
(Cake = fictional; K-2c-B / K-2c-I / K-IVP = undocumented; Sentia = proprietary blend).

## Run it

```bash
npm run molecules:setup-venv     # one-time: create .venv-molecules with RDKit
npm run molecules:merge-smiles   # rebuild generatedSmiles.json from gap-fill batch outputs (optional)
npm run molecules:generate       # coverage -> render SVGs -> rewrite mapping -> manifest
npm run molecules:pack           # zip public/molecules -> public/dosewiki-molecules.zip
```

`molecules:generate` writes:
- `public/molecules/<slug>.svg` (one per substance with SMILES)
- `src/data/mappings/moleculeSvgMappings.json` (article → SVG)
- `public/dosewiki-molecules.json` (download manifest)

Override the interpreter with `MOLECULE_PYTHON=/path/to/python npm run molecules:generate`.

## Hand-fixing a depiction (per-molecule overrides)

Automatic layout sometimes draws **wedge/hash stereo bonds** badly (overlapping, pointing into
rings) for stereochemically complex molecules. Fix one by hand in the **`/dev` → Molecules** tab
(local dev only):

- The editor (OpenChemLib canvas) loads the molecule's post-layout MOL block, you drag atoms and
  reassign wedge/hash bonds, and a live RDKit.js preview + InChI **stereo guard** confirm you only
  changed the *drawing*, not the *chemistry*.
- Saving writes an authored override `src/data/molecules/overrides/<slug>.mol` (tracked) and
  re-renders `public/molecules/<slug>.svg`.

`render_molecules.py` then honors that override on every run: if `overrides/<slug>.mol` exists it is
drawn **verbatim** (`useMolBlockWedging`, no re-layout) instead of the scaffold auto-layout. The
auto-layout starting points are emitted to `src/data/molecules/base/<slug>.mol` (generated,
git-ignored) so the editor can load and "revert to auto". Flags: `--overrides <dir>`,
`--base-outdir <dir>` (the orchestrator passes both).

## Files

- `render_molecules.py` — the renderer (palette, scaffolds, drawing options).
- `validate_smiles.py` — stdin JSON array of SMILES → JSON array of booleans (parseable?).
- `../data/resolveSmilesCoverage.mjs` — resolve a SMILES per substance.
- `../data/mergeGeneratedSmiles.mjs` — merge gap-fill batches → `generatedSmiles.json`.
- `../data/generateMoleculeSvgs.mjs` — orchestrator.
- `../data/buildMoleculeMappings.mjs` — rewrite the article→SVG mapping.
- `../data/buildMoleculeDownloadPack.mjs` — build the download manifest.
