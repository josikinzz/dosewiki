# Lexend — dyslexic-friendly type face

Lexend is the face behind dose.wiki's dyslexic-friendly type picker
(`data-font="dyslexic"`, `src/styles/font-type.css`). The dose.wiki build self-hosts
this committed WOFF2 through `next/font/local` as the non-preloaded `dyslexicFont`
(`--font-dyslexic`); an untoggled reader fetches none of it. Effect Index offers no such
picker and registers nothing from here. No build-time or runtime Google Fonts request is
required.

Obtained on the Titillium workflow (`../titillium-web/README.md`): the file is Google's
`latin` split, downloaded from fonts.gstatic.com via
`https://fonts.googleapis.com/css2?family=Lexend:wght@400;600;700&display=swap` with a
woff2-capable User-Agent. Google serves Lexend as a single VARIABLE font (`wght` 100–900),
so unlike Titillium one file covers every weight the sheets use — 400/600/700 under
`base.css`'s `font-synthesis: none` — and it is registered with `weight: "100 900"`.

Lexend has no italic. With synthesis off, italic runs render upright in the same face,
which suits the toggle's readability purpose. Only the `latin` split is committed: the
face module registers one file (`next/font` has no per-source `unicode-range`), nothing
else serves the other splits, and codepoints outside latin fall back to the
metric-matched fallback `next/font` derives.

Weights: variable 100–900, normal only. Licence: SIL Open Font License 1.1
(<https://fonts.google.com/specimen/Lexend/license>).
