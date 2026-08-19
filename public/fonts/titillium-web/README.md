# Titillium Web — Pro visual style faces

Titillium Web is the Pro visual style's display and body face. Both publication builds
self-host these committed WOFF2 files through `next/font/local`: Effect Index uses them
as its always-on `siteFont`, while dose.wiki registers them as the optional, non-preloaded
`proFont`. No build-time or runtime Google Fonts request is required.

The Theme Lab also exposes Titillium Web as a Fun-palette font choice. It loads the same
files through stable public URLs only after an editor selects the face.

Google's `latin` and `latin-ext` subsets are committed here. The application font modules
register the Latin files for 400/600/700 normal and 400 italic. The Theme Lab registers
both subsets with their matching `unicode-range` values from
`src/features/theme-lab/paletteTokensFonts.ts`.

The fallback metrics in that face table keep the lazy Theme Lab swap from reflowing the
page. The application path receives equivalent metric-matched fallbacks from `next/font`.

Weights: 400/600/700 normal, 400 italic. Licence: SIL Open Font License 1.1
(<https://fonts.google.com/specimen/Titillium+Web/license>).
