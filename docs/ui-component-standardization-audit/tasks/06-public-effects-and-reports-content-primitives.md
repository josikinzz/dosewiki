# Public Effects And Reports Content Primitives

## Objective

Extract public-content primitives shared by effect pages, report pages, and substance bridge sections while preserving existing article/report visual language.

## Scope

- `src/features/effects/`
- `src/features/reports/`
- `src/app/effects`
- `src/app/effect`
- `src/app/reports`
- `src/app/_components/public-routes`
- Related article sections under `src/features/article/components/sections`

## Source findings

- `effects-and-reports-ui.md`
- `article-substance-ui.md`
- `shared-ui-and-tokens.md`

## Affected files/modules

Effect hero, report hero, effect article page, trip report detail sections, report cards, compact report cards, fact tiles, metadata lists, timeline section, explorer tabs, related substances, citations and contributors sections.

## Proposed component/API shape

```tsx
<PublicDetailHero kind="effect|report" title metadata badges tags summary media />
<PublicContentSection layout="article|card|plain" spacing="article|effect|report|none" />
<TripReportCard density="full|compact" showSubstances showFeatured />
<PublicFactTile tone label icon value meta href />
<PublicMetadataList layout="grid|stack|inline" />
<PublicTimeline phase items />
<PublicAttributionSection type="contributors|related-links|citations" />
<PublicSegmentedTabs items activeId />
<ResponsiveMasonryColumns items columnCount />
```

## Migration steps

1. Extract low-risk subcomponents: tag chips, featured badge, inline dotted-link list, and section heading helper.
2. Normalize report detail cards and effect article sections around the shared section-header API.
3. Share trip report model projection, then migrate compact and full report card variants.
4. Normalize effect/report heroes onto `Surface variant="articleHero"` without visual redesign.
5. Extract fact tiles from report subject/substance cards.
6. Extract explorer tab trigger styling; leave report grouping and effect masonry logic local until stable.
7. Consider `PublicTimeline` after report section shell standardization.

## Tests/verification

- Visual review `/effects/[effectSlug]`, `/reports`, `/reports/[slug]`, and a substance page with bridge sections.
- Preserve scroll IDs used by report table of contents.
- Run effect citation tests when citation sections change.
- Cover both full and compact trip report card variants.

## Dependencies

- Task 01.
- Task 02.
- Task 03.
- Task 04 for article bridge alignment.

## Non-goals

- Do not force all effect/report pages into one layout.
- Do not change citation projection or numbering.
- Do not move feature data projection into shared UI components.
