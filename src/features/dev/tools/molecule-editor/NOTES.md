# Molecule depiction editor — design notes

## What this is

A `/dev` → **Molecules** tool for maintaining the canonical Convex molecule depiction set.
Each substance row stores a re-editable MOL block plus its pre-rendered brand SVG; the editor and
public article use the same row. Static `public/molecules/*.svg` files are fallback/legacy assets.

- **Edit surface:** OpenChemLib `CanvasEditor` (`OclEditor.tsx`) — reposition atoms
  (lasso tool; the default tool draws bonds), set per-bond wedge/hash stereo. Neutral
  canvas. The canvas is pointer-only — OpenChemLib exposes no keyboard or AT
  affordance, an accepted limitation for this editor-only tool.
- **Live preview:** RDKit.js renders the brand-styled SVG in-browser (`renderMoleculeSvg.ts`,
  `useRdkit.ts`).
- **Guard:** `stereoGuard.ts` compares edited vs original InChI so a wedge edit that
  silently inverts a stereocenter (a *different molecule*) is flagged.
- **Starting structure:** The editor loads `moleculeOverrides.molblock`, including `source:
  "seeded"` baselines. **Revert to auto** runs `smilesToMolblock` from the article SMILES in the
  canvas only. It does not delete or publish anything; the article changes only on Save.
- **Persistence:** Save POSTs `{ slug, molblock, svg }` to the editor-gated
  `/api/dev/molecule-override` route, which writes the `moleculeOverrides` Convex table
  and revalidates the public substance page. Save marks the row `source: "editor"`. The public
  article and chemical-class comparison panels serve the stored SVG through a URL versioned by
  `updatedAt`; the image response is immutable because every save creates a new URL. A short CDN
  revalidation propagation delay can remain. Convex rows do **not** update the legacy Python
  fallback pipeline or download pack.

## Prototype verdict (the `molecule-flow.prototype.ts` that used to live here)

A throwaway Node prototype validated the data flow before the UI was built. It has been
deleted; its findings are now covered by the `*.integration.test.ts` files. Key results:

- RDKit.js inits in Node via `locateFile`; `width/height:-1` yields a tight viewBox (not
  250²); `atomColourPalette` applies (RDKit emits **uppercase** hex, e.g. `#F0ABFC`);
  transparent bg via `backgroundColour:[…,0]` → `#FFFFFF00`.
- `useMolBlockWedging:true` + `prepareMolsBeforeDrawing:false` draw the saved coords +
  wedges verbatim — this is what makes a human's per-bond stereo edits stick.
- OpenChemLib round-trips a MOL block preserving wedge flags.
- InChI guard distinguishes a re-depiction (same InChI) from an inverted stereocenter
  (`/t14-,18-` vs `/t14-,18+`).

### The one real fidelity gap

RDKit.js MinimalLib has **no FreeType**, so atom labels render as baked `<path>` vector
glyphs — there is **no `<text>` and no `font-family`** in the output. The originally-planned
CSS `@font-face` mitigation is therefore **moot**. Consequence: the in-browser SVG's
heteroatom glyph *shapes* differ slightly from the Python (FreeType TTF) output. The live
Convex-backed save flow publishes the **in-browser SVG** as the public asset (so the editor
works on the deployed admin host); Python output is now only the static fallback/download set.

## Class mode

The same tab can edit chemical-class Markush/R-group structures. Class starts come from
`chemicalIndexManual.json` entries with `structure.smiles`; saved overrides use the same Convex
table under the namespaced slug `class:<class-key>`, so a class such as `amphetamine` cannot collide
with the substance page slug.

RDKit starts from the class SMILES; the R positions stay plain dummy atoms (`*`/`R`) with V2000
atom-map numbers — the only spelling both RDKit and OpenChemLib survive. (Labeled pseudoatom
symbols like `RN` do NOT work: RDKit reads them as elements — radon! — and OCL case-mangles them.)
Display labels (`R2`, `Rα`, `RN`, ...) are injected at draw time only, via RDKit's `atomLabels`
draw option keyed by atom index (`classAtomLabels`). Greek positional letters hit a second RDKit
limitation — the FreeType layer walks label strings byte-by-byte, so multi-byte characters bake as
tofu in any font. Both renderers therefore draw an ASCII stand-in (`Rα` -> `Ra`) and swap the
stand-in's baked glyph path for a real SVG `<text>` element afterwards (`swapGreekLabelGlyph` here,
`_greekify` in the Python pipeline); browsers render that `<text>` with system fonts. OCL rewrites dummy symbols to `?` and zeroes
atom maps on every round-trip, so each editor emit is passed through `normalizeClassMolblock`,
which restores the dummy atoms' chemistry tails from the source MOL block while keeping the edited
coordinates (OCL preserves atom order). InChI does not support dummy atoms, so class mode compares
canonical RDKit SMILES between the starting and edited MOL blocks instead. Static class render
promotion is manual: copy the saved MOL block to `src/data/molecules/class-overrides/<class-key>.mol`
before rerunning class SVG generation (the Python side re-applies labels from the atom maps).

## Class template mode

Orientation templates are plain scaffold molecules stored in the separate
`moleculeClassTemplates` Convex table by canonical chemical class key. A new template must be
initialized from pasted SMILES or a class member substance's current stored molblock; saved templates
reload through the editor-gated `/api/dev/molecule-class-template` route into the same OpenChemLib
canvas used above. Saving a template only updates its template row: it does not write
`moleculeOverrides`, revalidate a public route, or apply coordinates to class members.
