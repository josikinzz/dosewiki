# Public Routes: Deepen Trip Report Index Rules

## Files

- `src/features/reports/pages/TripReportsPage.tsx`
- `src/features/article/components/sections/TripReportsSection.tsx`
- `src/features/reports/pages/TripReportDetailPage.tsx`
- `src/features/reports/components/ReportCard.tsx`
- `src/app/reports/page.tsx`
- `src/app/reports/[slug]/page.tsx`
- `src/app/_components/public-routes/SubstanceTripReportsSection.tsx`

## Problem

Trip report behavior is spread across several Modules:

- The reports index groups by title, author, or substance inside the client page.
- The substance article trip reports section separately sorts featured reports, separates single-substance reports from combinations, and applies collapsed visibility rules.
- The report detail page derives the back-button label by matching `from` query state, slugified report substances, and substance lookup data.
- The server route maps public report previews into partial `TripReport` objects with default timeline arrays.

These are related pieces of the same public trip report domain, but the Seam is not explicit. The current Interface of each UI Module forces callers and maintainers to know which flavor of report shape and grouping rule is active. The Implementation details are duplicated or split by presentation location, which lowers Locality.

## Proposed Deepening Opportunity

Create a trip report index/domain Module that owns report normalization, grouping, sorting, relation-to-substance matching, and back-link derivation. Its Interface can expose route and presentation-friendly operations such as `toTripReportPreview`, `groupTripReports`, `getSubstanceTripReportGroups`, and `getReportBackTarget`.

The UI Modules would become consumers of a deeper report Adapter. `TripReportsPage` would render pre-grouped sections for the selected view mode, `TripReportsSection` would render a prepared substance report model, and `TripReportDetailPage` would receive a resolved back target rather than reimplementing lookup rules.

This creates a real Seam because the same Interface can have at least two Adapters: full report detail records and report preview records. The Implementation can absorb the format differences between index pages, substance article embeds, and detail back-navigation.

## Benefits

- Increases Depth by hiding report grouping, sorting, and matching behavior behind a focused Interface.
- Improves Leverage because index, substance article, and detail pages share consistent report behavior.
- Improves Locality because changes to featured sorting, combination labeling, author grouping, or substance matching happen in one Module.
- Reduces the risk of preview records drifting from full `TripReport` records.
- Enables direct tests for report domain rules without rendering tabs, cards, or App Router pages.

## Test Plan

- Add tests for grouping by title, author, and substance with featured and combination reports.
- Add tests for substance matching using title, common name, alternative names, slugified report substance names, and exact normalized names.
- Add tests for back target derivation with valid `from`, missing `from`, unknown substance, and multi-substance reports.
- Run report page/component tests and `npm run typecheck`.

## Risk/Rollout Notes

The highest behavior risk is changing report ordering or back-link text. Snapshot the current grouped output for representative data before migrating UI Modules. Roll out by first adding the Module and tests, then replacing one caller at a time.
