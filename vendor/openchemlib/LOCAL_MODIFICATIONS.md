# DoseWiki local modifications

Keep this ledger small and update it whenever the fork diverges from the imported baselines recorded in `PROVENANCE.md`.

## Packaging and ownership

- Removed the upstream Git submodule and nested repository metadata.
- Treat the copied Java source as the authoritative local build input.
- Publish the package to the DoseWiki application through a local file dependency.
- Commit browser-ready JavaScript bundles, resources, and type declarations so normal application builds do not require Java or GWT.
- Resolve Java and GWT build tools from environment variables or an ignored local tool directory.

## Fine rotation

- CanvasEditor exposes an opt-in `fineRotation` constructor option and `setFineRotationEnabled()` runtime method.
- Fine rotation removes only the 20-pixel horizontal rotation dead zone. It retains the existing angle sensitivity, pointer-selected origin, selected-only behavior, molecule-change lifecycle, and vertical zoom dead zone.
- The package-level default remains legacy coarse rotation. DoseWiki enables fine rotation explicitly in its editor.

## Bold bonds

- `Molecule` gains a depiction-only per-bond bold marker (`isBondBold` /
  `setBondBold`, flag bit `0x00040000` in `mBondFlags`), exported through the
  JS API and type declarations. The flag survives editing operations like other
  bond flags and is not written to any file format.
- `AbstractDepictor` draws bonds marked bold at ~3× the standard line width
  (0.116 × AVBL) in every depictor. The full ribbon treatment (wedge-corner
  joints, join discs, transparent crossing gap) lives in the application's SVG
  post-processing; the canvas shows width parity.
- Both wedge kinds flare to 70% of the upstream width (solid: ±length×0.0778
  per side; hashed slope ×0.70), hand-tuned against printed references.
- `toSVG`'s `strokeWidth` option re-bases only the standard line width instead
  of flattening every stroke to one value, so deliberately different stroke
  widths survive a custom base width.

## Verification

- `tests/dosewiki/` holds the DoseWiki delta tests (bold-bond state and
  width, wedge flare, SVG stroke-width re-basing, fine rotation). The root
  `npm run openchemlib:test` lane runs them with the upstream tests against
  the committed `dist/` bundles; `vitest.config.ts` aliases `#lib` and
  `#lib_debug` to `dist/` so the lane needs no JDK, GWT, or `lib/java`.
- `jsdom` is a package-local dev dependency for the editor-driven fine
  rotation test.

## Not changed

- No horizontal/vertical alignment command.
- No numeric angle entry or keyboard nudge.
- No changed zoom sensitivity or zoom dead zone.
- No automatic upstream synchronization.
