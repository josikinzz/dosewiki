# Molecule depiction editor — design notes

## What this is

A `/dev` → **Molecules** tool for hand-fixing the wedge/hash stereo depiction of a
molecule's skeletal diagram when RDKit's automatic layout draws it badly. Edits are
saved as a per-molecule **MOL block override** that the render pipeline draws verbatim.

- **Edit surface:** OpenChemLib `CanvasEditor` (`OclEditor.tsx`) — drag atoms, set
  per-bond wedge/hash stereo. Neutral canvas.
- **Live preview:** RDKit.js renders the brand-styled SVG in-browser (`renderMoleculeSvg.ts`,
  `useRdkit.ts`).
- **Guard:** `stereoGuard.ts` compares edited vs original InChI so a wedge edit that
  silently inverts a stereocenter (a *different molecule*) is flagged.
- **Persistence:** `/api/dev/molecule-layout` writes `src/data/molecules/overrides/<slug>.mol`
  and re-renders `public/molecules/<slug>.svg` (canonical Python render when the RDKit venv
  is present, else the in-browser SVG). `render_molecules.py` honors the override on
  `npm run molecules:generate`.

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
CSS `@font-face` mitigation is therefore **moot**. Consequence: the in-browser preview's
heteroatom glyph *shapes* differ slightly from the Python (FreeType TTF) output. This is why
Save prefers the **canonical Python render** for the public asset (matching the rest of the
site), using the in-browser SVG only as a fallback when the venv is unavailable.
