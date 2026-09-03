# Inter, the body face

Inter is the reading face: the first family in `--font-family-standard-body`
(`src/styles/base.css`), which every body-text token resolves through. Until it was
committed here, `Inter` in that stack was only a name: a reader with Inter installed
locally got it, everyone else fell through to `system-ui`, so Firefox on Linux or Windows
rendered the site in whatever the OS default sans is. The dose.wiki build self-hosts these
two committed WOFF2 files through `next/font/local` as `bodyFont` (`--font-body`,
`src/app/_fonts/dosewiki.ts`), so the face is the same on every platform. Effect Index
sets everything in Titillium and registers nothing from here. No build-time or runtime
Google Fonts request is required.

Obtained on the Titillium workflow (`../titillium-web/README.md`): the files are Google's
`latin` split, downloaded from fonts.gstatic.com via
`https://fonts.googleapis.com/css2?family=Inter:ital,opsz,wght@0,14..32,100..900;1,14..32,100..900&display=swap`
with a woff2-capable User-Agent. Google serves Inter 4 as two VARIABLE fonts, one upright
and one italic, each carrying `wght` 100 to 900 and `opsz` 14 to 32, so two files cover
every weight and both styles the sheets ask for under `base.css`'s `font-synthesis: none`.
Only the `latin` split is committed, on Lexend's reasoning: `next/font` has no per-source
`unicode-range`, and codepoints outside latin fall back to the metric-matched fallback it
derives.

Weights: variable 100 to 900, normal and italic. Version 4.001. Licence: SIL Open Font
License 1.1, the full text in `OFL.txt` beside these files
(<https://github.com/rsms/inter/blob/master/LICENSE.txt>).
