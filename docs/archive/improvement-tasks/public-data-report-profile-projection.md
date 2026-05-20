# Public Data Report Profile Projection

## Files

- `lib/convex/publicData.reports.ts`
- `lib/convex/publicData.contributors.ts`
- `lib/convex/publicData.shared.ts`
- `src/app/reports/[slug]/page.tsx`
- `src/app/contributors/[profileKey]/page.tsx`
- `src/app/_components/public-routes/SubstanceTripReportsSection.tsx`

## Problem

Trip report profile resolution is spread across report reads and contributor helpers. `getPublicReports`, `getReportsByAuthor`, `getPublicReportBySlug`, and `getPublicReportsBySubstanceNames` each know some combination of report projection, contributor lookup, avatar fallback, author profile key assignment, and report sorting.

The module is shallow because callers receive different shapes depending on which report helper they call, while the implementation repeats the same domain rule: a report subject may resolve to a public contributor profile, and profile data should enrich report previews/details consistently.

## Proposed deepening opportunity

Create a report/profile projection module whose interface exposes report preview and report detail projection in public-route terms. Put contributor profile collapse, author matching, avatar fallback, profile key assignment, and sort policy behind that seam.

`publicData.reports.ts` should become an adapter that fetches raw report and contributor data, then delegates to the projection module. The projection module can be tested with plain fixtures and should define the invariant for how report subjects become public contributor links.

## Benefits using skill vocabulary

- **Depth**: a small projection interface hides several public author/profile rules.
- **Leverage**: every report list and detail read gets identical author enrichment and fallback behavior.
- **Locality**: changes to alias matching, avatar precedence, or public contributor link rules happen in one module.
- **Seam**: report projection can be tested without Convex, App Router, or page rendering.
- **Deletion test**: deleting the projection module would force profile matching and fallback behavior back into every report helper, so the module would earn its keep.

## Test plan

- Add fixture tests for author exact matches, alias matches, collapsed alias profiles, missing profiles, report-provided avatars, and profile-provided avatars.
- Add tests for report preview sorting and detail enrichment.
- Add a contract-style test that `getPublicReports`, `getReportsByAuthor`, and substance report reads use the same projection rules.
- Run `npm run typecheck` and relevant unit tests.

## Risk/rollout notes

- Profile identity is public-facing. Preserve existing author names, avatar precedence, and encoded contributor route keys unless intentionally changed.
- Roll out by adding the projection module first, then switching report helpers one at a time.
- Watch for subtle shape differences between preview records and detail records.
