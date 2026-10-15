# Display Font Swap Workflow

Use this workflow to change a flavor's display face while keeping the font token
contract stable.

## Current sources

- `src/app/fonts.ts` exports the selected `@site-font` module.
- `next.config.ts` maps `@site-font` from `NEXT_PUBLIC_SITE_FLAVOR`.
- `src/app/_fonts/dosewiki.ts` owns the local dose.wiki face and its asset paths.
- `src/app/_fonts/effectindex.ts` owns the Effect Index face.
- `src/app/layout.tsx` applies `siteFont.variable`; `src/styles/base.css` exposes it
  as `--font-family-display`; `tailwind.config.mjs` maps `font-display` to that
  token.

Those files hold the current family, weights, and formats.

## Change a face

1. Edit the module for the target flavor. For a local face, add its optimized
   assets under `public/fonts/` and update the literal `next/font/local` entries.
   For a Google face, update the literal `next/font/google` configuration.
2. Keep the module export named `siteFont` and its CSS variable named
   `--font-display`, because `src/app/layout.tsx` and `src/styles/base.css`
   read those names.
3. Include every weight and style the UI uses. Remove an old asset once no
   font module references it.

## Verify

1. Run `bun run dev` with the target `NEXT_PUBLIC_SITE_FLAVOR`.
2. Open `/dev/kit` and a public article. Confirm the wordmark and top-level
   headings use the new face, body copy keeps the sans stack, and no font request
   fails in the browser network panel.
3. Switch between dark and light themes and check narrow and wide viewports for
   clipping, fallback flashes, and changed line wrapping.
4. Run `bun run build` to catch font loading errors.
