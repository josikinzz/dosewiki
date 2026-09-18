# Molecule depiction data

The canonical molecule set lives in the active data backend's
`moleculeOverrides` table: one MOL block and one brand-coloured SVG per row.
Production selects PlanetScale Postgres with `DATA_BACKEND=postgres`.
Authored handlers live in `server/`; operator tools use native data commands
and `DATA_ADMIN_TOKEN_*` scoped credentials. Persisted record IDs stay stable.

`/dev` → Molecules, public substance pages, chemical-class detail and comparison
views, and the download pack all read that same row set. There is no static
molecule art: the retired substance SVGs and class-skeleton pipeline are gone.
The baseline set is generated from each live
`substanceIndex.identification.smiles` with the editor's exact OpenChemLib path
and renderer. `npm run molecules:rerender-data` regenerates stored SVGs on
Postgres and defaults to dry run.
Writes retain `--write --confirm-molecule-rerender` plus the shared data-ops
production-write flags.

## SMILES sources (priority order)

Used by `molecules:smiles-coverage` and the historically named seeder:

1. `identification.smiles` inline in `public/SubstanceIndex.json` (including
   multi-component `{components:{...}}` preparations; the principal or first
   component is drawn).
2. `data/chemistry/generatedSmiles.json`, gap-fill SMILES found via
   PubChem/Wikipedia for substances missing inline data.
   For plants, preparations, and brands, `represents` names the active molecule
   drawn (for example, Salvia uses Salvinorin A).
   Rebuild it from reviewed gap-fill batches with `npm run molecules:merge-smiles`.
3. `titleIupacSmiles.json` / `iupacSmilesMap.json` (legacy maps).

For current depiction coverage, query `api.moleculeOverrides.listSlugs`. To
compare that live row set with the live substance corpus, run
`npm run molecules:seed-data -- --dry-run` and inspect
`tmp/molecule-seed/report.json`.

## Audit IUPAC names against live SMILES

`npm run audit:iupac-names` performs a read-only audit of the live production
`substanceIndex`. It converts stored SMILES to standard InChI with the project's
RDKit build, converts stored names through OPSIN and RDKit, and compares the
structures rather than the name strings. PubChem `IUPACName` values are retained
only as review candidates, and a candidate is recommended only when an
OPSIN → RDKit round trip reproduces the stored-SMILES InChI exactly.
Two reviewed parser exceptions are source-verified instead: nicomorphine against
PubChem CID 5362460 and scopolamine against FDA GSRS UNII DL48G20X8X. Each
decision is accepted only while the slug, stored name, and RDKit-computed
stored-SMILES InChIKey all remain exact; any change returns the row to review.

The command never calls a Postgres mutation. It writes its report and a 30-day
provider cache under `tmp/iupac-audit/`:

```bash
npm run audit:iupac-names
npm run audit:iupac-names -- --slug lsd --refresh
```

Use `--source-url` (or `SOURCE_POSTGRES_URL`) for the Postgres read source, and `--report` or `--cache` for local outputs. Remote reads retain the shared explicit-target and remote-host guards.
`--fail-on-review` makes a non-empty review queue fail for automation. Missing
identifiers, mixtures, preparations, salts, and representative active compounds
remain explicit coverage/review cases; the audit does not turn them into single
chemical entities or write generated names back to articles.

Approved corrections use the dedicated `substanceIndex:setIupacName` mutation
through `scripts/admin/data-admin.mjs`. The caller must provide the currently
stored name as `expected`; the mutation patches only
`identification.iupac_name` and refuses a concurrent change. Chemical
identifiers remain excluded from the review portal's generic inline editor.

## Seed the canonical molecule set

Dry-run is the default. It reads the explicitly selected backend, never
overwrites an existing row, and writes a JSON summary plus up to five
`.mol`/`.svg` samples under `tmp/molecule-seed/`:

```bash
npm run molecules:seed-data -- --dry-run --limit 5
```

The deliberate production sequence is:

```bash
export DATA_BACKEND=postgres
export TARGET_POSTGRES_URL="$POSTGRES_POOLED_URL"
export POSTGRES_IMPORT_CONFIRM=<postgres-host>
npm run postgres:check-env-isolation
npm run molecules:seed-data -- --dry-run --limit 5 --allow-remote
npm run molecules:seed-data -- --write --confirm-molecule-seed \
  --confirm-write=seed-canonical-molecule-depictions \
  --expected-deployment=<postgres-host>/<database> --allow-remote
```

The command name and `editorArticleWrite` intent-token name are unchanged.
`createDataClient()` selects Postgres from `DATA_BACKEND` and refuses a remote
target without `--allow-remote` plus `POSTGRES_IMPORT_CONFIRM`. Use `--limit N`
for a bounded batch and `--report PATH` to relocate the local report. The
transaction checks `by_slug` again, so it cannot replace a row created after
the initial read.

## Seed the class structures

Chemical-class taxonomy and canonical structures are authored in
`data/substances/chemicalIndexManual.json` (`classes[].structure.smiles` plus the
`rLabels` map naming each R position). The drawing itself lives in Postgres: seeding
generates each class MOL block from that SMILES (the same auto-layout the editor's
class-creation flow uses, with the R positions kept as plain dummy atoms carrying atom
maps), renders the brand SVG with the shared OpenChemLib renderer, and writes the
`class:<class-key>` row.

Dry-run is the default and never writes; it reports the plan (skipping existing rows)
under `tmp/molecule-class-seed/`:

```bash
npm run molecules:seed-classes-data
```

The deliberate production sequence is:

```bash
export DATA_BACKEND=postgres
export TARGET_POSTGRES_URL="$POSTGRES_POOLED_URL"
export POSTGRES_IMPORT_CONFIRM=<postgres-host>
npm run postgres:check-env-isolation
npm run molecules:seed-classes-data -- --dry-run --allow-remote
npm run molecules:seed-classes-data -- --apply --confirm-class-seed \
  --confirm-write=seed-class-molecule-depictions \
  --expected-deployment=<postgres-host>/<database> --allow-remote
```

Existing `class:` rows are never overwritten unless `--force` is passed; forced
rows are backed up locally first. Use `--key KEY[,KEY]`, `--limit N`, and
`--report PATH` to bound and record the plan.

## Build the download pack

The public download pack is built from the selected backend's canonical
depiction set, with no Python environment and no static SVG source:

```bash
DATA_BACKEND=postgres TARGET_POSTGRES_URL="$POSTGRES_POOLED_URL" \
  POSTGRES_IMPORT_CONFIRM=<postgres-host> \
  npm run molecules:pack -- --allow-remote
DATA_BACKEND=postgres TARGET_POSTGRES_URL="$POSTGRES_POOLED_URL" \
  POSTGRES_IMPORT_CONFIRM=<postgres-host> \
  npm run molecules:pack -- --check --allow-remote
```

`scripts/data/buildMoleculePack.ts` reads every `moleculeOverrides` row through
the compatibility-shaped public queries, ships the stored brand SVG verbatim
under `molecules/` (class rows under `molecules/classes/`), re-renders each
substance MOL block in the standard textbook palette under
`molecules-standard/`, and writes the manifest into both the ZIP and `public/`.
Any render failure fails the run; a partial pack is never shipped.

The nightly workflow must select `DATA_BACKEND=postgres`, set
`DATA_WRITES_FROZEN=1`, receive `POSTGRES_POOLED_URL` from the read-only
`POSTGRES_POOLED_READONLY_URL` secret, and receive the media base from the
`REPLICATION_MEDIA_BASE_URL` repository variable. Those CI values require owner
provisioning, so this runbook does not claim the nightly path is active. Staged
files use a fixed mtime, making the ZIP byte-identical until the depiction set
changes. Updating generated downloads locally does not deploy them.

## Colorways

The Pro light and dark colourways are pure string substitutions over the stored SVG
bytes, defined once in `src/data/mappings/moleculePalette.ts` and applied at serve time
to Postgres `moleculeOverrides` rows by `src/app/api/molecules/**`. They need no Python
env, and no recoloured static copies exist.

## Pre-rendered social cards

`npm run generate:social-cards` builds two immutable 1200×1200 PNG sets:

- Every production substance under `public/images/social/substances/`, using its optional
  `moleculeOverrides` row. The dark textbook molecule sits on a flat black background below
  the logo, title, and classification badges. A substance without molecule artwork still
  receives a branded title card.
- Tailored home, Substance Index, Subjective Effect Index, Replications, Chemical Class
  Index, and About cards under `public/images/social/pages/`. These mirror the public
  pages' mobile app-icon navigation and brand hierarchy.

`predev` and `prebuild` run both generators for dose.wiki; Effect Index builds skip them and
retain their publication-wide social card. Generated PNGs are ignored because every
deployment recreates them. The tracked `src/data/substanceSocialCardManifest.generated.json`
and `src/data/pageSocialCardManifest.generated.json` files map metadata identities to
digest-named assets. Substance card digests include article and molecule revisions; fixed
page card digests include their renderer sources and bundled visual assets. Any visual or
data revision therefore produces a new crawler URL on the next dose.wiki deployment rather
than relying on request-time rasterization.

## Editing a published depiction

Automatic layout sometimes draws **wedge/hash stereo bonds** badly (overlapping, pointing into
rings) for stereochemically complex molecules. Fix one by hand in the **`/dev` → Molecules** tab
(works locally and on the admin host):

- The editor (OpenChemLib canvas) loads the molecule's MOL block, you reposition atoms and
  reassign wedge/hash bonds, and a live preview rendered by the same OpenChemLib engine + an
  RDKit-backed InChI **stereo guard** confirm you only changed the *drawing*, not the *chemistry*.
- The editor starts from the Postgres MOL block, including rows created by the seed. **Revert to
  auto** regenerates the SMILES layout in the canvas only; the public article does not change
  until **Save depiction** is pressed.
- Saving writes the MOL block plus pre-rendered SVG to `moleculeOverrides` through
  `/api/dev/molecule-override`, then revalidates the article path. Versioned image URLs use
  `updatedAt` and immutable caching, so a refreshed article requests the new asset URL. There can
  still be a short platform revalidation propagation delay after Save.
- Postgres rows are the whole story: there is no static substance pipeline behind them.

## Hand-fixing a class structure

Chemical-class Markush structures use the same `/dev` Molecules editor in
**Classes** mode. The editor loads the class's stored MOL block when a
`class:<class-key>` row exists; a class with no row starts from an auto-layout
of its `chemicalIndexManual.json` SMILES.
Saving writes the override row through the unchanged
`/api/dev/molecule-override` endpoint, and the class detail page serves that
stored SVG from the active backend.

## Files

- `validate_smiles.py`: stdin JSON array of SMILES to JSON array of booleans;
  needs the RDKit venv (`npm run molecules:setup-venv`).
- `seed-data-molecules.ts` / `rerender-data-molecules.ts`: native Postgres
  commands that seed and re-render canonical molecule depictions.
- `seed-class-molecules.ts`: seed or refresh `class:<class-key>` rows from
  `chemicalIndexManual.json`.
- `../data/resolveSmilesCoverage.mjs`: resolve a SMILES per substance.
- `../data/mergeGeneratedSmiles.mjs`: merge gap-fill batches into
  `generatedSmiles.json`.
- `../data/buildMoleculePack.ts` - build the download manifest and ZIP from the selected data backend.
