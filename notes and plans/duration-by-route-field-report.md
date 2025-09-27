# `duration_by_route` Field Report

## Overview
The KnowDrugs articles historically included an optional `drug_info.duration_by_route` object. Unlike the top-level `duration` block—which supplies a single set of timing estimates shared across the UI—`duration_by_route` stores a nested map keyed by route of administration (e.g., `oral`, `sublingual`). Each route contains its own `total_duration`, `onset`, `peak`, `offset`, and `after_effects` strings. In the current dataset, only the LSD entry defines this structure:

```json
"duration_by_route": {
  "oral": {
    "total_duration": "8-12 hours",
    "onset": "20-90 minutes",
    "peak": "2-6 hours",
    "offset": "6-12 hours",
    "after_effects": "Up to 24 hours"
  },
  "sublingual": {
    "total_duration": "6-10 hours",
    "onset": "15-60 minutes",
    "peak": "2-5 hours",
    "offset": "5-10 hours",
    "after_effects": "Up to 20 hours"
  }
}
```

## Current Usage
- The front-end relies on `contentBuilder.ts` to derive normalized `duration` information. That helper ignores `duration_by_route`, instead pairing a single `duration` object with each dosage card.
- No other modules import or reference `duration_by_route`. As a result, the field is effectively dormant data shipped in the JSON payload.

## Potential Applications
1. **Route-specific duration cards**: Extend `buildRoutes` to prefer route-level timing when available (falling back to global `duration`). LSD could show oral vs. sublingual phase ranges directly in the dosage tabs.
2. **Dose/duration comparison tables**: Generate a dedicated “Duration by Route” section under the dosage card, aligning nicely with the existing Markdown-enabled Notes section.
3. **Search and filtering metadata**: `library.ts` could index per-route timing for comparison views or filters (e.g., “show psychedelics with <1h onset when taken sublingually”).

## Integration Considerations
- **Schema consistency**: Today only one article ships `duration_by_route`. A migration script could populate missing entries by copying the global `duration` block to each route until granular data is available.
- **UI real estate**: Presenting two timing tables may crowd the dosage card. Consider a collapsible panel, tooltip, or secondary tab.
- **Data completeness**: Ensure ingestion scripts capture route-specific timing whenever new articles are added to avoid inconsistent UX.

## Recommendation
Document the field in data ingestion notes and decide whether future JSON drops should omit it entirely or expand coverage. If granular route timings are valuable, prioritize a UI enhancement that surfaces them alongside the existing dosage information and update `contentBuilder` accordingly.
