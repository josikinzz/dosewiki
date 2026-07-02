# Molecule depiction editor — design notes

## What this is

A `/dev` → **Molecules** tool for hand-fixing the wedge/hash stereo depiction of a
molecule's skeletal diagram when RDKit's automatic layout draws it badly. Edits are
saved as a per-molecule **MOL block override** plus a pre-rendered SVG.

- **Edit surface:** OpenChemLib `CanvasEditor` (`OclEditor.tsx`) — reposition atoms
  (lasso tool; the default tool draws bonds), set per-bond wedge/hash stereo. Neutral
  canvas. The canvas is pointer-only — OpenChemLib exposes no keyboard or AT
  affordance, an accepted limitation for this editor-only tool.
- **Live preview:** RDKit.js renders the brand-styled SVG in-browser (`renderMoleculeSvg.ts`,
  `useRdkit.ts`).
- **Guard:** `stereoGuard.ts` compares edited vs original InChI so a wedge edit that
  silently inverts a stereocenter (a *different molecule*) is flagged.
- **Persistence:** Save POSTs `{ slug, molblock, svg }` to the editor-gated
  `/api/dev/molecule-override` route, which writes the `moleculeOverrides` Convex table
  and revalidates the public substance page — so the editor works on the deployed admin
  host too. The public article serves the stored (in-browser-rendered) SVG for any slug
  with an override. Note: these Convex overrides do **not** land in the tracked
  `src/data/molecules/overrides/` directory, so the local Python pipeline
  (`npm run molecules:generate`) does not see them; copy a MOL block there by hand if a
  fix should also survive a full static re-render.

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
works on the deployed admin host); the canonical Python render is only what the static
pipeline (`npm run molecules:generate`) produces for non-overridden molecules.
