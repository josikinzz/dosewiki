# Titillium Web — Theme Lab lazy faces

Titillium Web is the Effect Index flavor's display/body face. That flavor gets it from
`next/font/google` at build time (`src/app/_fonts/effectindex.ts`), which self-hosts it into
that build only — a dose.wiki build ships no Titillium bytes at all.

The Theme Lab offers the same face as a font choice on dose.wiki, so it needs the files as
plain static assets it can point an `@font-face` at *after* a visitor picks it. These are
those files: the exact woff2 subsets `next/font/google` produced for the Effect Index build,
copied out of `.next/static/media` and given stable names.

Subsets are Google's `latin` and `latin-ext` splits; the matching `unicode-range` for each
lives beside the face table in `src/features/palette-lab/paletteTokensFonts.ts`. The metric
overrides on the `Titillium Web Fallback` face in that same table are `next/font`'s computed
values for this face — they are what keeps the lazy swap from reflowing the page.

Nothing links these files. They are fetched only when a rendered element actually resolves to
Titillium Web, which cannot happen until the visitor selects it in the Theme Lab.

Weights: 400/600/700 normal, 400 italic. Licence: SIL Open Font License 1.1
(<https://fonts.google.com/specimen/Titillium+Web/license>).
