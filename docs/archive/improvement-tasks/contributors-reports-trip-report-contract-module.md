# Contributors Reports Trip Report Contract Module

## Files

- `convex/schema.ts`
- `convex/tripReports.ts`
- `lib/convex/publicData.shared.ts`
- `lib/convex/publicData.reports.ts`
- `src/types/tripReport.ts`
- `src/app/reports/page.tsx`
- `src/app/contributors/[profileKey]/page.tsx`
- `src/features/reports/pages/TripReportsPage.tsx`
- `src/features/reports/pages/TripReportDetailPage.tsx`
- `src/features/reports/components/ReportCard.tsx`
- `src/features/reports/components/SubjectInfoCard.tsx`

## Problem

The trip report shape is duplicated across Convex schema definitions, the `bulkImport` validator, public read records, UI types, route-level mapping, and report feature components. The reports index and contributor page adapt `PublicReportPreview` back into partial `TripReport` objects by filling `onset`, `peak`, `offset`, and `tags` with empty arrays. Detail pages receive richer records from a different public-data path.

This is a shallow set of Modules because each caller must know which fields are real, which are preview placeholders, and which optional fields are safe for a detail-only component. The Interface exposed to UI code is the broad `TripReport` type, but the Implementation often only has preview data. That weakens Locality: adding a report field, changing timeline phase rules, or tightening import validation requires checking several files that repeat the same contract.

## Proposed deepening opportunity

Create a trip report contract Module that owns the stored report contract, import input contract, public preview contract, and public detail contract. Its Interface should expose explicit adapters such as `toPublicReportPreview`, `toPublicReportDetail`, and `toReportCardModel` rather than asking routes to manufacture partial `TripReport` records.

Convex validators, public-data types, and feature props should consume the contract Module or generated types from it. UI Modules should receive smaller presentation models for report cards, subject context, substances, and timelines. The full `TripReport` Interface should be reserved for places that truly have full detail data.

## Benefits

- **Module**: collects trip report schema, validation, and projection rules into one report contract Module.
- **Interface**: callers choose preview, detail, card, subject, or timeline contracts instead of relying on a broad shape with placeholders.
- **Implementation**: import validation, default handling, trimming, optional field policy, and timeline phase shape are implemented once.
- **Depth**: a small set of contract adapters hides the differences between stored, imported, preview, and detail records.
- **Seam**: public routes and Convex reads meet at explicit projection seams instead of inline object reconstruction.
- **Adapter**: Convex validators, public-data reads, and React feature props become adapters over the same contract.
- **Leverage**: new report metadata or stricter timeline validation can propagate through reports, contributor pages, and substance report embeds predictably.
- **Locality**: report shape changes stop requiring route-by-route audits for empty-array placeholders and optional field assumptions.

## Test plan

- Add contract tests for import input validation, stored report normalization, public preview projection, and public detail projection.
- Add tests proving preview models cannot be passed to timeline/detail-only adapters without explicit conversion.
- Add fixture tests for reports with missing introduction, empty timelines, optional subject fields, PDF URLs, multiple substances, and featured status.
- Add route/component tests for reports index and contributor page using card models instead of partial full reports.
- Run `npm run typecheck` and the report feature test target.

## Risk/rollout notes

The main risk is changing public report rendering by altering placeholder defaults. Preserve current visible behavior first: empty timeline sections should remain hidden, card ordering should remain stable, and optional subject fields should render only when present. Roll out by adding presentation models alongside `TripReport`, then migrate index cards and contributor cards before touching detail pages or Convex import validation.
