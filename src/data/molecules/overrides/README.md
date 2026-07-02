# Molecule depiction overrides

Authored, **tracked** V2000 MOL blocks — one `<slug>.mol` per molecule whose skeletal
diagram was hand-fixed in the `/dev` → **Molecules** editor.

Each file stores explicit 2D atom coordinates **and** per-bond wedge/hash stereo flags.
`scripts/chemistry/render_molecules.py` draws an override **verbatim** (`useMolBlockWedging`,
no re-layout) instead of the automatic per-class scaffold layout, so a human's stereo-depiction
fixes survive `npm run molecules:generate`.

- The `/dev` → Molecules editor no longer writes here: it saves overrides (MOL block +
  pre-rendered SVG) to the `moleculeOverrides` Convex table via `/api/dev/molecule-override`,
  and the public article serves that stored SVG directly. To make a hand-fix also survive a
  full static re-render, copy its MOL block into this directory as `<slug>.mol` by hand.
- The matching `../base/<slug>.mol` files are the *generated* auto-layout starting points
  (git-ignored, rebuilt by the pipeline) — do not edit those by hand.
