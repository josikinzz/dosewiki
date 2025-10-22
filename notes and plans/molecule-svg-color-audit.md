# Molecule SVG Color Audit

Scope: scanned `molecule svg dataset/` (732 structures) for `fill`, `stroke`, and related attributes to catalogue the palette used by the newly added molecule artwork. Counts reflect raw attribute hits across files; "SVGs" denotes the number of unique diagrams containing each color. The first table preserves the legacy palette prior to recoloring, while the later sections document the applied brand-aligned scheme.

## Legacy Palette Snapshot (pre-recolor)

| Normalized | Alt representations | Attribute hits | SVGs | Description | Example molecules |
| --- | --- | --- | --- | --- | --- |
| #000000 | `black` keyword in `Pemoline.svg` | 15,360 | 732 | Solid black used for primary bond outlines, atom labels, and default text. | (1R,2R)-Tramadol, 1P-LSD, Pemoline |
| #333399 | `rgb(51,51,153)` in `Pemoline.svg` | 3,893 | 659 | Deep royal blue / indigo accent applied to heteroatom bonds and emphasis glyphs. | 1P-LSD, 2C-B, Pemoline |
| #ff0000 | `red` keyword in `Pemoline.svg` | 3,038 | 605 | Bright primary red highlighting oxygen atoms, charges, or reactive sites. | 1P-LSD, 2C-B, Pemoline |
| #ffffff | — | 2,045 | 545 | Pure white fill for background halos, labels, and masked circles. | (1R,2R)-Tramadol, 2C-T-7, 4-AcO-DMT |
| #996600 | — | 334 | 84 | Warm amber / goldenrod accents seen on halogen callouts and ring variants. | 2-FA, 2-FMA, 2-TFMDCK |
| #666600 | — | 285 | 84 | Muted olive green used for alternative ring shading in sulfur/halogen series. | 2C-T-10, 2C-T-14, 2C-T-21 |
| #009900 | — | 238 | 86 | Vivid medium green applied to amino sidechains and nitrogen markers. | 25C-NBOH, 2C-C, 3,4-CTMP |
| #333333 | — | 238 | 66 | Charcoal grey for secondary outlines, captions, and supporting geometry. | 1B-LSD, 1F-LSD, 1H-LSD |
| #660099 | — | 155 | 23 | Deep violet / royal purple accent for iodine-rich phenethylamines. | 25I-NBOH, 25x-NBOMe, 2C-I |
| #663333 | — | 60 | 28 | Dusky brick red / brown highlighting brominated derivatives. | 25B-NBOH, 2C-B-FLY, 2C-B-BUTTERFLY |
| #666633 | — | 32 | 8 | Drab olive-grey motif unique to chemical agent schematics. | Adamsite, Arsine, Diphenylcyanoarsine |
| #660000 | — | 3 | 1 | Dark maroon accent confined to the lithium carbonate illustration. | Lithium carbonate |
| #0000ff | — | 2 | 1 | Pure primary blue stroke appearing only in the sodium thiopental diagram. | Sodium thiopental |
| #ec0000 | — | 1 | 1 | Vivid scarlet with a slight orange cast, unique to the mCPP-labelled trazodone sheet. | Trazodone (mCPP moiety labelled) |

### Legacy Notes
- The palette is dominated by four core colors (#000000, #333399, #ff0000, #ffffff), which cover >90% of color declarations across the set.
- Legacy ChemDraw exports occasionally encode blue and red using CSS keywords (`black`, `red`) or `rgb()` values; only `Pemoline.svg` does this, but the hues align with the primary hex choices.
- Specialty arsenic/chemical agent diagrams introduce the muted olive-grey band (#666633), while lithium carbonate, sodium thiopental, and trazodone add single-file accent hues.

## Updated Palette (post-recolor)

After running `scripts/recolorMolecules.mjs`, every molecule in `molecule svg dataset/` and `public/molecules/` now uses the fuchsia-violet accents defined in the site style guide.

| Color | Attribute hits | SVGs | Applied role | Example molecules |
| --- | --- | --- | --- | --- |
| #f5d0fe | 15,360 | 732 | Primary bond strokes, labels, and defaults (matches inline link pink). | (1R,2R)-Tramadol, 1P-LSD, Pemoline |
| #c4b5fd | 3,893 | 659 | Heteroatom-linked bonds and emphasis glyphs (violet gradient stop). | 1P-LSD, 2C-B, Pemoline |
| #fda4af | 3,038 | 605 | Oxygen/charge highlights with softer danger tonality. | 1P-LSD, 2C-B, Pemoline |
| #eef2ff | 2,045 | 545 | Background halos and masked circles with muted bloom. | (1R,2R)-Tramadol, 2C-T-7, 4-AcO-DMT |
| #fbbf24 | 334 | 84 | Warm amber halogen annotations. | 2-FA, 2-FMA, 2-TFMDCK |
| #bef264 | 285 | 84 | Sulfur/halogen ring shading in luminous lime. | 2C-T-10, 2C-T-14, 2C-T-21 |
| #6ee7b7 | 238 | 86 | Amino side chains in the shared success green. | 25C-NBOH, 2C-C, 3,4-CTMP |
| #ffffff99 | 238 | 66 | Secondary outlines and captions in semi-transparent white. | 1B-LSD, 1F-LSD, 1H-LSD |
| #e879f9 | 155 | 23 | Iodine-rich phenethylamine accents. | 25I-NBOH, 25x-NBOMe, 2C-I |
| #fb7185 | 61 | 29 | Brominated derivatives and mCPP labels with rose warmth. | 25B-NBOH, 2C-B-FLY, Trazodone (mCPP) |
| #fcd34dcc | 32 | 8 | Chemical agent schematics in translucent brass. | Adamsite, Arsine, Diphenylcyanoarsine |
| #f43f5e | 3 | 1 | Lithium carbonate highlight with legible crimson. | Lithium carbonate |
| #a5b4fc | 2 | 1 | Sodium thiopental accent aligned to indigo shadows. | Sodium thiopental |

### Post-recolor Notes
- The applied palette keeps four dominant hues (#f5d0fe, #c4b5fd, #fda4af, #eef2ff) while replacing the remaining accents with brand-consistent greens and ambers.
- Both source (`molecule svg dataset/`) and served (`public/molecules/`) assets are updated, so running `scripts/syncMoleculeAssets.mjs` no longer overrides the new scheme.
- No legacy `black`/`red` keyword declarations remain; future SVGO passes retain the rewritten hex forms.

## Applied Palette Mapping
To keep the molecules legible against the dark cosmic canvas (#0f0a1f) and harmonise them with the brand accents described in `dosewiki-visual-style-guide.md`, the table below documents the replacements baked into `scripts/recolorMolecules.mjs`.

| Current color | Common usage | Dark mode issue | Applied token | Hex | Rationale |
| --- | --- | --- | --- | --- | --- |
| #000000 | Primary bond strokes, atom text | Drops to near-invisible against dark canvas | `text-fuchsia-200` | #f5d0fe | Matches inline link color, keeps bonds readable without overpowering panels. |
| #333399 | Heteroatom-linked bonds, emphasis glyphs | Feels colder than site palette and blends into violet gradients | `text-violet-300` | #c4b5fd | Moves the accent toward the fuchsia→violet gradient already used on cards. |
| #ff0000 | Oxygen/charged site callouts | Pure red is harsh on dark cards and clashes with risk badges | `text-rose-300` | #fda4af | Softer rose keeps the warning feel while aligning with existing danger tokens (`bg-red-500/10`, `text-red-300`). |
| #ffffff | Background halos, masked circles | Pure white halos bloom on the dark canvas | `bg-indigo-50` / `white/90` | #eef2ff | Slightly muted white keeps contrast yet matches translucent overlays used on SectionCards. |
| #996600 | Halogen annotations in stimulants | Reads as muddy brown, low contrast | `text-amber-400` | #fbbf24 | Warm amber ties into caution chip styling and pops against the fuchsia bonds. |
| #666600 | Alternate ring shading (sulfur sets) | Olive tone appears dull and dirty | `text-lime-300` | #bef264 | Fresh lime keeps the yellow-green cue but adds luminosity seen in interaction warnings. |
| #009900 | Nitrogen/amino side chains | Fully saturated green overshoots brand palette | `text-emerald-300` | #6ee7b7 | Shares the success/confirmation accent from Dev tools so nitrogen still reads as “cooling” without neon burn. |
| #333333 | Secondary outlines and captions | Too close to background after bonds shift lighter | `text-white/60` | #ffffff99 | Semi-transparent white mirrors card body copy hierarchy and separates from main fuchsia strokes. |
| #660099 | Iodine-rich phenethylamines | Dark purple crushes into background gradients | `text-fuchsia-400` | #e879f9 | Brighter fuchsia keeps iodine emphasis while staying inside primary accent ramp. |
| #663333 | Brominated derivatives | Low contrast brown | `text-rose-400` | #fb7185 | Warmer rose differentiates bromine series without diverging from site chroma. |
| #666633 | Chemical agent schematics | Reads as murky olive-grey | `text-amber-300` + `opacity-80` | #fcd34d | Adds readable brass tone consistent with hazard banners while remaining subdued with transparency. |
| #660000 | Lithium carbonate highlight | Maroon nearly black on dark background | `text-rose-500` | #f43f5e | Keeps deep red family but with enough luminance for legibility. |
| #0000ff | Sodium thiopental accent | Primary blue feels off-brand and saturates harshly | `text-indigo-300` | #a5b4fc | Aligns with existing indigo shadows and gradient bases. |
| #ec0000 | Unique mCPP label | Neon red screams against dark | `text-rose-400` | #fb7185 | Shares bromine mapping to stay consistent with revised oxygen/halogen language. |

### Implementation Notes
- When converting strokes/fills, bump stroke-width by 0.25–0.5px if the lighter palette appears thinner than the legacy black lines.
- Bias toward transparency (e.g. `stroke="rgba(245,208,254,0.88)"`) where SVGs rely on layering; this keeps bonds luminous without overwhelming adjacent text.
- Test both the default dark canvas and the Dev Tools light preview to ensure the new palette maintains >4.5:1 contrast for primary strokes and >3:1 for secondary annotations.
- Re-run `node scripts/recolorMolecules.mjs` after adding new molecule artwork so the palette stays aligned across source and published assets.
