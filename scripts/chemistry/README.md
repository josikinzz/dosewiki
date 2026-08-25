# Molecule depiction data

The canonical molecule set lives in Convex `moleculeOverrides`: one MOL block and one
brand-coloured SVG per row. It is the **only** source of molecule drawings — substance
rows are keyed by slug, and chemical-class Markush skeletons are keyed `class:<class-key>`.
`/dev` → Molecules, public substance pages, chemical-class detail and comparison views, and
the download pack all read that same row set. There is no static molecule art: the retired
substance SVGs and the retired static class-skeleton pipeline are both gone.

The baseline Convex set is generated from each live `substanceIndex.identification.smiles` with
the editor's exact OpenChemLib path (`smilesToMolblock.ts`: `fromSmiles` +
`inventCoordinates`) and exact OpenChemLib brand renderer (`renderMoleculeSvg.ts` — the same
engine that draws the editing canvas). `npm run molecules:rerender-convex` regenerates every
stored SVG from its stored MOL block on that renderer (dry-run by default; live writes require
`--write --confirm-molecule-rerender` plus the data-ops production-write flags).

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

## Audit IUPAC names against live SMILES

`npm run audit:iupac-names` performs a read-only audit of the live production
`substanceIndex`. It converts stored SMILES to standard InChI with the project's
RDKit build, converts stored names through OPSIN and RDKit, and compares the
structures rather than the name strings. PubChem `IUPACName` values are retained
only as review candidates, and a candidate is recommended only when an
OPSIN → RDKit round trip reproduces the stored-SMILES InChI exactly.

The command never calls a Convex mutation. It writes its report and a 30-day
provider cache under `tmp/iupac-audit/`:

```bash
npm run audit:iupac-names
npm run audit:iupac-names -- --slug lsd --refresh
```

Use `--convex-url`, `--report`, or `--cache` to override those defaults.
`--fail-on-review` makes a non-empty review queue fail for automation. Missing
identifiers, mixtures, preparations, salts, and representative active compounds
remain explicit coverage/review cases; the audit does not turn them into single
chemical entities or write generated names back to articles.

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

## Seed the class structures

Chemical-class taxonomy and canonical structures are authored in
`src/data/indexes/chemicalIndexManual.json` (`classes[].structure.smiles` plus the
`rLabels` map naming each R position). The drawing itself lives in Convex: seeding
generates each class MOL block from that SMILES (the same auto-layout the editor's
class-creation flow uses, with the R positions kept as plain dummy atoms carrying atom
maps), renders the brand SVG with the shared OpenChemLib renderer, and writes the
`class:<class-key>` row.

Dry-run is the default and never writes; it reports the plan (skipping existing rows)
under `tmp/molecule-class-seed/`:

```bash
npm run molecules:seed-classes-convex
```

The deliberate production command is:

```bash
npm run convex:doctor
TARGET_CONVEX_URL=https://glad-minnow-656.convex.cloud \
  npm run molecules:seed-classes-convex -- --apply --confirm-class-seed \
  --confirm-write=seed-class-molecule-depictions \
  --expected-deployment=glad-minnow-656
```

Existing `class:` rows are never overwritten unless `--force` is passed (forced rows are
backed up locally first). Use `--key KEY[,KEY]` to seed specific classes, `--limit N` for
a bounded batch, and `--report PATH` to relocate the report (default
`tmp/molecule-class-seed/report.json`).

## Build the download pack (from Convex)

The public download pack is built straight from the canonical Convex depiction set — no
Python env and no static SVGs:

```bash
npm run molecules:pack           # Convex -> public/dosewiki-molecules.{json,zip}
npm run molecules:pack -- --check  # exit 1 if the committed manifest drifted (no writes)
```

`scripts/data/buildMoleculePack.ts` reads every `moleculeOverrides` row over the public
queries, ships the stored brand SVG verbatim under `molecules/` (class rows under
`molecules/classes/`), re-renders each substance MOL block in the standard textbook palette
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

## Colorways

The Pro light and dark colourways are pure string substitutions over the stored SVG
bytes, defined once in `src/data/mappings/moleculePalette.ts` and applied at serve time
to Convex `moleculeOverrides` rows by `src/app/api/molecules/**`. They need no Python
env, and no recoloured static copies exist.

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

Chemical-class Markush structures use the same `/dev` → Molecules editor in **Classes**
mode. The editor loads the class's Convex MOL block when a `class:<class-key>` row exists;
a class with no row yet starts from an auto-layout of its `chemicalIndexManual.json`
SMILES. Saving writes the override row through `/api/dev/molecule-override` and the class
detail page serves that stored SVG — the Convex row is the whole story, exactly as for
substances.

## Files

- `validate_smiles.py` — stdin JSON array of SMILES → JSON array of booleans (parseable?);
  needs the RDKit venv (`npm run molecules:setup-venv`).
- `seed-convex-molecules.ts` / `rerender-convex-molecules.ts` — seed and re-render the
  canonical substance set.
- `seed-class-molecules.ts` — seed/refresh the `class:<class-key>` rows from
  `chemicalIndexManual.json`.
- `../data/resolveSmilesCoverage.mjs` — resolve a SMILES per substance.
- `../data/mergeGeneratedSmiles.mjs` — merge gap-fill batches → `generatedSmiles.json`.
- `../data/buildMoleculePack.ts` — build the download manifest + ZIP from Convex.
