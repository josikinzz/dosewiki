# Molecule depiction data and static SVG generation

The canonical runtime molecule set lives in Convex `moleculeOverrides`: one MOL block and one
brand-coloured SVG per substance. Both `/dev` → Molecules and public substance pages use that
same row. The tracked `public/molecules/*.svg` set remains a legacy fallback and downloadable art
pack; it is not the source of truth for live article depictions.

The baseline Convex set is generated from each live `substanceIndex.identification.smiles` with
the editor's exact OpenChemLib path (`smilesToMolblock.ts`: `fromSmiles` +
`inventCoordinates`) and exact OpenChemLib brand renderer (`renderMoleculeSvg.ts` — the same
engine that draws the editing canvas). `npm run molecules:rerender-convex` regenerates every
stored SVG from its stored MOL block on that renderer (dry-run by default; live writes require
`--write --confirm-molecule-rerender` plus the data-ops production-write flags).

## Legacy static renderer

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

1. `identification.smiles` inline in `src/data/SubstanceIndex.json` (incl. multi-component
   `{components:{...}}` preparations — the principal/first component is drawn).
2. `src/data/mappings/generatedSmiles.json` — gap-fill SMILES found via PubChem/Wikipedia for
   substances missing inline data. For plants/preparations/brands, `represents` names the active
   molecule drawn (e.g. Salvia → Salvinorin A, Datura → Scopolamine, Marinol → dronabinol/THC).
3. `titleIupacSmiles.json` / `iupacSmilesMap.json` (legacy maps).

Coverage: **572 / 577** substances. The 5 without art have no single representable molecule
(Cake = fictional; K-2c-B / K-2c-I / K-IVP = undocumented; Sentia = proprietary blend).

## Seed the canonical Convex set

Dry-run is the default. It reads the configured Convex target, never overwrites an existing row,
and writes a JSON summary plus up to five `.mol`/`.svg` samples under `tmp/molecule-seed/`:

```bash
npm run molecules:seed-convex -- --dry-run --limit 5
```

The deliberate live command is:

```bash
npm run molecules:seed-convex -- --write --confirm-molecule-seed
```

Use `--limit N` for a bounded live batch and `--report PATH` to relocate the local report. Writes
use the existing `editorArticleWrite` admin intent and the guarded
`moleculeOverrides.seedMissing` mutation. The mutation checks `by_slug` again transactionally, so
it cannot replace a row created after the initial read. Seeded rows carry `source: "seeded"` and
`updatedBy: "seed-convex-molecules"`; the first editor save changes `source` to `"editor"`.

## Regenerate the legacy static fallback and download pack

```bash
npm run molecules:setup-venv     # one-time: create .venv-molecules with RDKit
npm run molecules:merge-smiles   # rebuild generatedSmiles.json from gap-fill batch outputs (optional)
npm run molecules:generate       # coverage -> render SVGs -> recolour -> rewrite mapping -> manifest
npm run molecules:generate-ei    # recolour only: brand/standard art -> public/molecules-ei/
npm run molecules:check-ei       # fail if public/molecules-ei/ is out of date (no writes)
npm run molecules:pack           # zip public/molecules -> public/dosewiki-molecules.zip
```

`molecules:generate` writes:
- `public/molecules/<slug>.svg` (one per substance with SMILES, brand colours)
- `src/data/molecules/molecules-standard/<slug>.svg` (same set in standard textbook colours —
  RDKit default palette; git-ignored, only shipped inside the download ZIP)
- `public/molecules-ei/<slug>.svg` + `public/molecules-ei/classes/<key>.svg` (the Effect Index
  colourway — CPK hues desaturated into the Effect Index theme; tracked, served only by the
  `NEXT_PUBLIC_SITE_FLAVOR=effectindex` build)
- `src/data/mappings/moleculeSvgMappings.json` (article → SVG)
- `public/dosewiki-molecules.json` (download manifest)

`molecules:pack` zips both dose.wiki colourways into `public/dosewiki-molecules.zip`
(`molecules/` = brand, `molecules-standard/` = standard). The Effect Index colourway is a
site-theme asset rather than a published artwork colourway, so it is deliberately not packed.

The Effect Index recolour is a pure string substitution over the SVG bytes, defined once in
`src/data/mappings/moleculePalette.ts` and shared with the serve-time recolour applied to
Convex `moleculeOverrides` rows by `src/app/api/molecules/**`. It needs no Python env.

Override the interpreter with `MOLECULE_PYTHON=/path/to/python npm run molecules:generate`.

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
- Convex rows do **not** land in `src/data/molecules/overrides/`. That directory affects only the
  legacy Python fallback pipeline.

`render_molecules.py` honors a tracked override on every run: if `overrides/<slug>.mol` exists it is
drawn **verbatim** (`useMolBlockWedging`, no re-layout) instead of the scaffold auto-layout. The
Python auto-layout starting points are emitted to `src/data/molecules/base/<slug>.mol` (generated,
git-ignored) for fallback-pipeline inspection. The live editor's Revert to auto uses OpenChemLib
directly from Convex SMILES. Flags: `--overrides <dir>`, `--base-outdir <dir>` (the orchestrator
passes both).

## Hand-fixing a class structure

Chemical-class Markush structures use the same `/dev` → Molecules editor in **Classes** mode.
Saving writes a Convex override under `class:<class-key>` and the class detail page serves that
stored SVG. Static generation uses `src/data/molecules/class-overrides/<class-key>.mol`: when a
file exists there, `render_class_structures.py` draws that MOL block verbatim instead of deriving
the class skeleton from `chemicalIndexManual.json`. The orchestrator and
`npm run molecules:generate-classes` both pass `--overrides src/data/molecules/class-overrides`.

## Files

- `render_molecules.py` — the renderer (palette, scaffolds, drawing options).
- `validate_smiles.py` — stdin JSON array of SMILES → JSON array of booleans (parseable?).
- `../data/resolveSmilesCoverage.mjs` — resolve a SMILES per substance.
- `../data/mergeGeneratedSmiles.mjs` — merge gap-fill batches → `generatedSmiles.json`.
- `../data/generateMoleculeSvgs.mjs` — orchestrator.
- `../data/buildMoleculeMappings.mjs` — rewrite the article→SVG mapping.
- `../data/buildMoleculeDownloadPack.mjs` — build the download manifest.
