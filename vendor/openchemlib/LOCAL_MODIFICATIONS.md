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
- `AbstractDepictor` draws bonds marked bold as wide as a solid wedge's broad
  end (2/9 of the average bond length) in every depictor — the editor canvas,
  images, and SVG identically.
- `toSVG`'s `strokeWidth` option re-bases only the standard line width instead
  of flattening every stroke to one value, so bold bonds keep their absolute
  (wedge-matching) width under a custom base width.

## Not changed

- No horizontal/vertical alignment command.
- No numeric angle entry or keyboard nudge.
- No changed zoom sensitivity or zoom dead zone.
- No automatic upstream synchronization.
