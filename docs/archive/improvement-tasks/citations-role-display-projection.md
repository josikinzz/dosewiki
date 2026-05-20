# Citation Role And Display Projection

## Files

- `src/schema/substance.schema.ts`
- `convex/schema.ts`
- `src/features/dev/forms/SourceCitationsFieldsRHF.tsx`
- `src/features/dev/forms/CitationsFieldsRHF.tsx`
- `src/features/dev/forms/schema/fields/CitationField.tsx`
- `src/features/article/components/sections/CitationsSection.tsx`
- `src/features/effects/components/EffectCitationsSection.tsx`
- `src/features/effects/vcode/components/Reference.tsx`
- `scripts/migrate/migrate-citations-to-sources.mjs`
- `scripts/migrate/migrate-citations-convex.mjs`
- `scripts/data/syncArticleCitations.mjs`

## Problem

The codebase has several citation shapes and role rules without a single citation Module. Substance articles split `source_citations` from `citations`, while effect articles use `citations`, `external_links`, and `see_also` with different field names and anchor behavior. The editor renders `SourceCitationsFieldsRHF`, `CitationsFieldsRHF`, and `CitationField` separately even though they mostly expose the same Interface. Public article and effect pages then rebuild similar link, favicon, numbering, and collapsed-list behavior from their own local assumptions.

The migration scripts encode a source-vs-further-reading classification policy with domain patterns, but the runtime editor and display paths do not call through that policy. That makes the citation role Interface shallow: callers must know whether a citation is a source, reference, further-reading item, external link, or VCode reference, plus which shape and display rules each route expects.

## Proposed Deepening Opportunity

Introduce a citation role and display projection Module. Its Interface should accept raw substance citations, raw effect citations, external links, and see-also links, then return normalized citation groups for editor and public display: primary sources, further reading, references, external links, and internal related links. The Implementation should own role classification, duplicate URL handling, title/name/text normalization, favicon metadata, numbering, collapsed-list counts, and stable anchor IDs.

Editor fields should use a small role-aware citation field Adapter instead of separate source and further-reading components. Public article and effect sections should consume the normalized projection rather than rebuilding citation display rules locally.

## Benefits

- **Module**: citation role and display behavior becomes a Module instead of repeated field and route logic.
- **Interface**: callers ask for normalized citation groups and display metadata without knowing the raw source shape.
- **Implementation**: role classification, duplicate handling, label fallback, favicon lookup, numbering, and anchors are local.
- **Depth**: a compact projection Interface gives leverage across editor forms, substance articles, effect articles, VCode references, and migrations.
- **Seam**: raw data shapes meet public display through one projection seam.
- **Adapter**: substance citations, effect citations, external links, and migration inputs become Adapters into the citation projection.
- **Leverage**: changing the source/further-reading policy updates editor warnings, migrations, and public rendering together.
- **Locality**: citation display bugs and role drift become projection-module bugs rather than scattered route and form issues.

## Test Plan

- Add projection tests for source citations, further-reading citations, effect references with `from`, external links, see-also links, duplicate URLs, empty labels, and missing URLs.
- Add editor field tests that a citation role Adapter emits the same raw shape currently saved for `source_citations` and `citations`.
- Add public rendering tests for article and effect citation sections using the same projection fixture.
- Add a migration-policy fixture proving standard source domains classify consistently in local and Convex migration paths.

## Risk/Rollout Notes

- Preserve existing persisted field names during the first rollout; this should be a projection refactor before a storage migration.
- Keep public ordering stable: substance sources before further reading, effect see-also/external-links/references in the current order unless intentionally changed.
- Use snapshot fixtures for representative existing article and effect citation data before deleting route-local display logic.
