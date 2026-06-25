# Molecule depiction overrides

Authored, **tracked** V2000 MOL blocks — one `<slug>.mol` per molecule whose skeletal
diagram was hand-fixed in the `/dev` → **Molecules** editor.

Each file stores explicit 2D atom coordinates **and** per-bond wedge/hash stereo flags.
`scripts/chemistry/render_molecules.py` draws an override **verbatim** (`useMolBlockWedging`,
no re-layout) instead of the automatic per-class scaffold layout, so a human's stereo-depiction
fixes survive `npm run molecules:generate`.

- Created / updated by `POST /api/dev/molecule-layout` (local dev only).
- Removed by the editor's "Remove" action (`DELETE /api/dev/molecule-layout`).
- The matching `../base/<slug>.mol` files are the *generated* auto-layout starting points
  (git-ignored, rebuilt by the pipeline) — do not edit those by hand.
