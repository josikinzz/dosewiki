# Molecule depiction editor design notes

## What this is

A `/dev` → **Molecules** tool for maintaining the canonical molecule depiction set stored in the Postgres `moleculeOverrides` table.
Each substance row stores a re-editable MOL block plus its pre-rendered brand SVG; the editor and
public article use the same row. There are no static substance SVGs: an article without a
`moleculeOverrides` row shows no depiction.

**One drawing engine, end to end.** The repository-owned OpenChemLib fork draws the editing
canvas, the live preview, and the published article SVG from the same MOL block interpretation.
There is no second renderer to disagree with the canvas: no phantom stereo hydrogens (the old
RDKit renderer's `addChiralHs` default), no re-derived Kekulé patterns, and double-bond second
lines land on the same side everywhere. RDKit.js remains in the editor for exactly two jobs:
the InChI/canonical-SMILES stereo guards and class-template substructure alignment.

- **Edit surface:** the repository-owned OpenChemLib `CanvasEditor` fork (`OclEditor.tsx`): reposition atoms
  (lasso tool; the default tool draws bonds), set per-bond wedge/hash stereo. Neutral
  canvas. Fine rotation is enabled by default and removes only the upstream tool's
  20-pixel horizontal rotation dead zone; the control can restore legacy coarse behavior
  without changing molecule data. The canvas is pointer-only: OpenChemLib exposes no
  keyboard or AT affordance, an accepted limitation for this editor-only tool. Fork
  provenance, rebuilds, and artifact verification are documented in
  `docs/architecture/openchemlib-fork.md`.
- **Alignment tools:** two one-shot rigid rotations implemented app-side (no fork change),
  following the mirror-button flow: mutate coordinates, reload the canvas, emit a fresh MOL
  block. **Set bond vertical** rotates the whole depiction (by the smaller turn) so one bond
  is exactly vertical. The bond is chosen by click-to-pick: the button arms a canvas overlay,
  the hovered bond is highlighted, and the next click applies the rotation (Esc cancels). A
  single lasso-selected bond still applies immediately without entering pick mode. Pick-mode
  hit-testing needs no view transform because the editor molecule's atom coordinates live in
  the drawing canvas's device-pixel space: the same space the fork's pointer glue feeds to
  `Molecule.findBond` (see `lib/canvas_editor/events.js`); the overlay maps pointer positions
  with the drawing canvas's client rect (inside the open shadow root) and `devicePixelRatio`.
  **Straighten** removes a uniform tilt by rotating by the circular mean of every bond's
  deviation from the 30° drawing grid. Rigid rotation cannot invert a stereocentre, so
  neither tool needs the wedge/hash swap that mirroring does.
- **Bold bonds:** the **Bold bonds** button arms the same click-to-pick overlay in toggle mode:
  each clicked bond flips between normal and bold and the mode stays armed
  until Esc or the button. The published look was hand-tuned by Lyrea on a slider tool
  (revised 7 Aug 2026): bold body 3.25 px (~3× the brand line), rounded free ends, a joint
  that takes the adjacent solid wedge's own drawn corners (one connected shape), join discs
  at bold-to-bold elbows and free ends, and a 3.3 px see-through crossing gap that breaks
  plain bonds passing underneath (wedges cast none). The preview/article side is composed by `applyBoldRibbon`
  in `renderMoleculeSvg.ts` (a real SVG mask, so the gap is transparent on any background);
  the canvas draws bold at width parity via the fork (`Molecule.setBondBold`, ~3× line in
  `AbstractDepictor`) without the joint/gap dressing: the one known, accepted parity nuance.
  Both wedge kinds also flare to 70% of upstream width, per the same tuning. The indices persist as
  `moleculeOverrides.boldBonds` beside the MOL block (they are not part of the MOL format);
  structural edits keep flags attached to their bonds inside OpenChemLib, and the canvas
  re-emits the index list alongside every edit. Bold changes mark the editor dirty without
  changing the MOL block. All three modes have the tool: substance and class rows store
  `moleculeOverrides.boldBonds`, and templates store their own
  `moleculeClassTemplates.boldBonds` (editor-only cosmetics: applying a template copies
  coordinates to members, never bold, since member bond indices differ from the template's).
- **Live preview:** the OpenChemLib fork renders the brand-styled SVG in-browser
  (`renderMoleculeSvg.ts`, `useOcl.ts`): `toSVG` with `maxAVBL` 28 px bonds, autoCrop, and
  suppressed chiral/CIP/ESR annotations, then three pure post-processing passes: strip the
  invisible hit-target layer, map OCL's fixed CPK colors onto the brand palette (unknown
  elements fall back to the carbon color; class R-labels are recolored by their exact text),
  and floor the viewBox so tiny molecules don't over-zoom. Atom labels are real `<text>`
  elements (Greek included: no glyph hacks), and rounded line caps come from the engine.
- **Guard:** `stereoGuard.ts` (RDKit) compares edited vs original InChI so a wedge edit that
  silently inverts a stereocenter (a *different molecule*) is flagged.
- **Starting structure:** The editor loads `moleculeOverrides.molblock`, including `source:
  "seeded"` baselines. **Revert to auto** runs `smilesToMolblock` from the article SMILES in the
  canvas only. It does not delete or publish anything; the article changes only on Save.
  Two more starting points exist in substances mode, both replacing the canvas with a
  confirmation over unsaved work: **Start from another substance** loads any saved depiction as
  an analogue seed (the stereo guard then reports "molecule changed" until the drawing is edited
  into this substance's molecule), and **Start from pasted SMILES** loads an automatic layout as
  a rough starting point.
- **Tracing image:** an image can be dropped onto the canvas (or picked via **Trace an
  image…**) and shown OVER the canvas at reduced opacity: OpenChemLib paints an opaque white
  background, so an underlay would be invisible. "Adjust image" captures the pointer for
  dragging; off, the overlay is `pointer-events: none` and drawing goes straight through it.
  Fade and size are sliders. Session-only: the image lives in an object URL and is never
  uploaded or saved (`TracingLayer.tsx`).
- **Persistence:** Save POSTs `{ slug, molblock, svg, smiles?, boldBonds? }` to the editor-gated
  `/api/dev/molecule-override` route, which writes the Postgres `moleculeOverrides` table
  and revalidates the public substance page. Save marks the row `source: "editor"`. The public
  article and chemical-class comparison panels serve the stored SVG through a URL versioned by
  `updatedAt`; the image response is immutable because every save creates a new URL. A short CDN
  revalidation propagation delay can remain. A save does not rewrite the committed
  download pack immediately: run `npm run molecules:pack` to update it locally, or
  let `.github/workflows/molecule-pack-nightly.yml` rebuild and commit changed pack
  files. The updated downloads become public when that commit is deployed.
  `npm run molecules:rerender` regenerates every stored SVG from its stored
  MOL block (svg-only, provenance-preserving, race-guarded): used once for the
  RDKit→OpenChemLib engine switch and available for any future renderer change.

## Renderer verification notes

The OpenChemLib renderer was validated in Node before the switch (probe scripts, now covered by
`renderMoleculeSvg.integration.test.ts`):

- `toSVG` draws the MOL block verbatim: coordinates, wedges, and the explicit Kekulé pattern;
  with no sanitization step to re-derive any of them.
- No phantom hydrogen: a chiral pure hydrocarbon renders with no atom labels at all (the Fig. 1
  regression test).
- `maxAVBL` pins the drawn bond length (28 px brand length) inside a generous canvas;
  `autoCrop` then trims to a tight, non-zero-origin viewBox.
- OCL emits fixed CPK `rgb(...)` strings per element and real `<text>` labels; both are
  deterministic and post-processed by pure string passes.
- `setAtomCustomLabel` renders Greek natively, which retired the old RDKit glyph-swap hack.
- InChI guard distinguishes a re-depiction (same InChI) from an inverted stereocenter
  (`/t14-,18-` vs `/t14-,18+`).

## Class mode

The same tab can edit chemical-class Markush/R-group structures. Class starts come from
`chemicalIndexManual.json` entries with `structure.smiles`; saved overrides use the same `moleculeOverrides`
table under the namespaced slug `class:<class-key>`, so a class such as `amphetamine` cannot collide
with the substance page slug.

RDKit generates the class start from the class SMILES; the R positions stay plain dummy atoms
(`*`/`R`) with V2000 atom-map numbers: the only spelling both RDKit and OpenChemLib survive.
(Labeled pseudoatom symbols like `RN` do NOT work: RDKit reads them as elements, radon, and
OCL case-mangles them.) Display labels (`R2`, `Rα`, `RN`, ...) are injected at draw time only,
via `Molecule.setAtomCustomLabel` keyed by atom index (`classAtomLabels`); OpenChemLib renders
them as real `<text>` elements, Greek included, and `renderMoleculeSvg` recolors them to the
R-label violet by their exact text. OCL rewrites dummy symbols to `?` and zeroes
atom maps on every round-trip, so each editor emit is passed through `normalizeClassMolblock`,
which restores the dummy atoms' chemistry tails from the source MOL block while keeping the edited
coordinates (OCL preserves atom order). InChI does not support dummy atoms, so class mode compares
canonical RDKit SMILES between the starting and edited MOL blocks instead. Saved `class:` rows are
the only drawing source for class structures: there is no static render pipeline to promote into.

New R positions can be typed on the canvas: OCL's `?…` custom-atom dialog accepts `R1`–`R16`
(Greek can't be typed) and emits each as symbol `R#` + an `M  RGP` (atom, group) pair line.
After `normalizeClassMolblock`, `convertTypedRGroups` rewrites every `R#` atom whose group
number is an rLabels key into the canonical `*`+atom-map spelling (pruning its RGP pair);
the conversion runs after the tail restore so retyping an existing R position can't get its
old map stamped back. Unknown group numbers stay visible `R#` atoms. The preview labels the
converted atom from rLabels immediately; the canvas keeps showing the typed `R<n>` until the
next baseline load (save or reselect), when the normal draw-time label path takes over.

## Class template mode

Orientation templates are plain scaffold molecules stored in the separate
`moleculeClassTemplates` Postgres table by canonical chemical class key. A new template must be
initialized from pasted SMILES or a class member substance's current stored molblock; saved templates
reload through the editor-gated `/api/dev/molecule-class-template` route into the same OpenChemLib
canvas used above. Saving a template only updates its template row: it does not write
`moleculeOverrides`, revalidate a public route, or apply coordinates to class members.

Template application matches in two passes (`templateApplicationPlan.ts`): strict first (atoms
AND bond orders must match exactly), then a relaxed retry that flattens every bond to single on
both sides so the ring framework alone decides the match: a codeine-style extra ring double
bond no longer breaks a plain scaffold template. The member's real bond orders are restored into
the aligned output, and a canonical-SMILES comparison refuses any relaxed alignment that would
change the depicted molecule. Relaxed matches are labeled "aligned · bonds relaxed" in the apply
preview, and the preview's error count names the affected members. Applies never overwrite
`source: "editor"` rows (enforced in the mutation).
