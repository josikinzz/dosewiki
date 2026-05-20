# Public Routes: About Page View Model Module

## Status

Proposed

## Files

- `src/app/about/page.tsx`
- `src/components/pages/AboutPage.tsx`
- `src/data/content/about.ts`
- `lib/convex/publicData.about.ts`
- `lib/convex/publicData.layouts.ts`
- `lib/convex/publicData.substances.ts`
- `src/features/dev/tools/about/AboutCopyEditors.tsx`

## Problem

The public About route constructs several different concepts inline: Convex-backed about copy, founder profile resolution, public overview counts, placeholder values, and article JSON preview records. `AboutPage` then owns a second layer of view-model work by reordering article fields, choosing an initial preview, rendering fallback preview JSON, and hard-coding the data download target.

This makes the current Module shallow. The route Interface looks simple, but callers and maintainers still need to know which counts are available, which placeholder keys exist, why some placeholder values are currently `"0"`, which raw substance records are safe to show in a public JSON preview, and how founder keys from site config become public profiles. The same placeholder vocabulary is also visible in the dev About copy editor, but the public route does not consume a shared placeholder Module.

The existing public route view model, public data read, route planning, and site metadata tasks cover broad route/data seams. They do not cover the About page's specific public content model: mission copy interpolation, founder projection, public data snapshot preview, and placeholder-key contract.

## Solution Plan

Create an About page view model Module whose Interface returns a route-ready model for public presentation. The Interface should expose domain terms such as mission markdown, founder profiles, public data counts, preview article snapshots, updated-at metadata, and data export target. The App Router page should call that Module and pass the resulting model to `AboutPage`.

Move placeholder construction behind the same Seam. The Implementation should own the allowed placeholder keys, how each count is derived, which missing values are allowed, and how Convex about markdown is interpolated. `src/features/dev/tools/about/AboutCopyEditors.tsx` should consume the same placeholder-key registry so editor copy and public rendering cannot drift.

Move public preview shaping behind the view model as well. `AboutPage` should receive ordered preview snapshots or a small preview Adapter instead of raw `SubstanceArticle` records plus a local field-order policy. If the JSON preview is meant to be a public data contract, encode that contract explicitly; if it is illustrative only, name it as a sample snapshot and keep hidden/internal fields out behind the Adapter.

## Benefits

- **Locality**: About copy placeholders, counts, founder projection, preview selection, and download target policy change in one Module instead of across the route, data helpers, and client page.
- **Leverage**: The same placeholder registry can support Convex-rendered public copy, the dev About editor, validation, and tests.
- **Testability**: The Interface becomes the test surface: fixtures can assert resolved markdown, count values, founder ordering, missing-profile behavior, and preview snapshot shape without mounting the full page.
- **Depth**: A compact About view model Interface hides several public content rules that currently leak through raw records and ad hoc placeholder maps.

## Implementation Notes

- Keep Convex as the source of truth for live About copy and founder profile keys.
- Preserve existing rendered copy and visible preview behavior in the first pass.
- Derive `chemicalClassCount`, `mechanismClassCount`, and related placeholder values from the same public library/layout data used by public routes, or explicitly mark unsupported placeholders in the placeholder Module instead of supplying route-local `"0"` strings.
- Keep article preview snapshots public-safe. Do not expose editor-only metadata such as `editorial_review`.
- Treat the client page as a rendering Adapter. Its Interface should not require knowledge of schema field order or raw substance record shape.

## Verification

- Add unit tests for the About view model with configured markdown, empty markdown, missing founder profiles, duplicate founder keys, and representative public overview counts.
- Add placeholder contract tests proving every key exposed in the dev About editor has a public rendering value or an explicit unsupported state.
- Add preview snapshot tests confirming field order, low-priority filtering, hidden/editor-only field exclusion, and stable fallback behavior when no preview articles exist.
- Run `npm run typecheck` and a smoke render of `/about`.
