# DoseWiki-owned OpenChemLib fork

DoseWiki owns a self-contained OpenChemLib package for the protected molecule depiction editor. The application resolves `openchemlib` from `vendor/openchemlib`; it does not clone an upstream repository, follow a Git submodule, or compile Java/GWT during a normal install, Next.js build, or deployment.

## Provenance and license

The fork starts from:

- `openchemlib-js` 9.23.0, commit `d0157013aef3bb3e0057804491d4acc2192fe283`
- Java OpenChemLib, commit `94f77815728907829087ef350bf069ce241b54c1`

The imported code is BSD-3-Clause licensed. Keep the fork's `LICENSE` and provenance document with source and binary distributions. The package's local modifications ledger distinguishes DoseWiki changes from imported behavior.

## Runtime ownership

The local package keeps the upstream `openchemlib` module contract, so existing molecule, MOL-block, and CanvasEditor imports do not need an application adapter. Browser-ready JavaScript, resources, and type declarations are committed under the package's distribution directory. These generated files are intentional runtime inputs, unlike disposable root build output.

The DoseWiki-specific CanvasEditor extension is fine rotation:

- package default: legacy coarse rotation
- DoseWiki editor default: fine rotation enabled
- runtime control: the editor may toggle fine rotation without recreating the canvas
- changed behavior: horizontal pointer movement below the legacy 20-pixel rotation dead zone becomes a proportional angle
- preserved behavior: angle sensitivity, pointer-selected origin, selected-only transformation, vertical zoom dead zone, repaint, and molecule-change events

Fine rotation is not angle snapping, exact alignment, numeric angle entry, keyboard nudging, or a changed zoom curve.

The second DoseWiki extension is bold bonds:

- `Molecule.setBondBold(bond, bold)` / `Molecule.isBondBold(bond)` mark a bond as depiction-bold; the flag lives in the molecule's per-bond flag word, survives editing operations, and is never written to any file format
- `AbstractDepictor` draws marked bonds at ~3× the standard line width; both wedge kinds flare to 70% of the upstream width. The full bold-ribbon treatment (wedge-corner joints, join discs, transparent crossing gap) is composed in the application's SVG renderer post-processing
- `toSVG`'s `strokeWidth` option re-bases only the standard line width instead of flattening every stroke, so deliberately different widths survive a custom base width

See `vendor/openchemlib/LOCAL_MODIFICATIONS.md` for the authoritative ledger.

## Ordinary application workflow

Install and validate normally:

```bash
bun install
npm run openchemlib:verify
npm run verify:app
```

`openchemlib:verify` checks local package resolution, rejects nested Git metadata, and compares the checked-in source and distributable fingerprints with the artifact manifest. It does not invoke Java or GWT and must leave a clean checkout unchanged. It does not run the fork tests; that is the separate lane below.

## Fork test lane

`npm run openchemlib:test` runs the package's own Vitest suite (`vendor/openchemlib/tests`): the imported upstream tests plus the DoseWiki delta tests under `vendor/openchemlib/tests/dosewiki`. The artifact manifest records this lane under `verification.testLane`.

Prerequisite: only the package-local dev dependencies. The repository ignores npm lockfiles, so install without one:

```bash
npm --prefix vendor/openchemlib install --ignore-scripts
npm run openchemlib:test
```

The lane resolves `#lib` and `#lib_debug` to the committed `dist/openchemlib.js` and `dist/openchemlib.debug.js` (see `vendor/openchemlib/vitest.config.ts`), so it exercises exactly the bundles the application ships and needs neither a JDK, GWT, nor the ignored `lib/java` intermediate. After `npm run openchemlib:build` the same lane validates the rebuilt bundles.

The delta tests fail if a local change is reverted:

- `bold_bonds.test.ts`: `setBondBold`/`isBondBold` round trip, survival through copying and bond-table compaction, absence from molfiles and idcodes, and the 0.116 × AVBL stroke width of a marked bond against the 0.06 × AVBL standard width
- `wedge_flare.test.ts`: solid wedge half-width of 0.7/9 × AVBL and hashed wedge growth of 0.7/128 × AVBL per side per step
- `svg_stroke_width.test.ts`: `toSVG({ strokeWidth })` rewrites only the standard width and leaves bold strokes and hit targets alone
- `fine_rotation.test.ts`: drives the real `CanvasEditor` under jsdom; a horizontal drag below the legacy 20-pixel dead zone rotates by 1/50 rad per pixel when fine rotation is on, the package default stays coarse, the runtime toggle works without recreating the editor, and the sensitivity and vertical zoom dead zone are preserved

`library.test.ts` snapshots the public prototypes and asserts that `Molecule.isBondBold`, `Molecule.setBondBold`, and `CanvasEditor.setFineRotationEnabled` stay exported. Root `vitest` does not collect `vendor/`; the fork lane is the only runner for these files.

## Rebuilding the fork

Rebuilding is a maintainer operation, not part of an application build. Prerequisites:

- JDK 21
- GWT 2.13.0
- the fork's npm development dependencies

The build resolves tools in this order:

- `JAVA_HOME` and `GWT_HOME`
- ignored local tools under `vendor/openchemlib/.tools/jdk` and `vendor/openchemlib/.tools/gwt`

Prepare the package-local dependencies and tools, then run:

```bash
npm --prefix vendor/openchemlib install --ignore-scripts
JAVA_HOME=/path/to/jdk-21 \
GWT_HOME=/path/to/gwt-2.13.0 \
npm run openchemlib:build
npm run openchemlib:verify
npm run openchemlib:test
```

The root build command compiles minified and debug JavaScript, bundles the CanvasEditor wrapper, copies type declarations, rebuilds resources, and updates the deterministic artifact manifest. Review every source, distributable, type, resource, and manifest diff together. Do not hand-edit committed distribution files.

## Updating from upstream

There is no automatic upstream merge workflow. To evaluate a later release:

1. Clone or download upstream outside this repository.
2. Record the candidate `openchemlib-js` tag/commit and Java OpenChemLib commit.
3. Compare upstream source with the currently recorded baseline and the local modifications ledger.
4. Import the new source without nested Git metadata or a submodule.
5. Reapply the smallest possible DoseWiki delta, including the fine-rotation Java field/setter, GWT export, CanvasEditor option/runtime method, and types.
6. Update provenance, license material if required, and the modifications ledger.
7. Rebuild through `npm run openchemlib:build`.
8. Run `npm run openchemlib:test`, the complete molecule editor/integration tests, lint, type checking, artifact verification, and the production build.
9. Manually verify coarse and fine pointer rotation in the protected editor before shipping.

Do not broadly reformat imported source. A narrow delta keeps later provenance review and security comparison tractable.

## Repository hygiene

Tracked and intentional:

- imported Java and JavaScript source
- BSD license and provenance
- local modifications ledger
- generated browser bundles, resources, and type declarations
- artifact manifest

Ignored and disposable:

- package-local `node_modules`
- GWT/JDK tool downloads
- GWT compiler work directories and caches
- generated intermediate JavaScript under the package's library work directory
- logs

The artifact verifier also fails if `.git` or `.gitmodules` appears inside the fork.
