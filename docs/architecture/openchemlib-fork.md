# DoseWiki-owned OpenChemLib fork

Last verified: 2026-07-18

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

`openchemlib:verify` checks local package resolution, rejects nested Git metadata, and compares the checked-in source and distributable fingerprints with the artifact manifest. It does not invoke Java or GWT and must leave a clean checkout unchanged.

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
npm --prefix vendor/openchemlib ci --ignore-scripts
JAVA_HOME=/path/to/jdk-21 \
GWT_HOME=/path/to/gwt-2.13.0 \
npm run openchemlib:build
npm run openchemlib:verify
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
8. Run fork tests, the complete molecule editor/integration tests, lint, type checking, artifact verification, and the production build.
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
