# Article Section Primitives And Citation Text

## Objective

Standardize article/substance section shells, subsection cards, expandable previews, citation text, citation lists, source footers, and section states around existing article anchors.

## Scope

- `src/components/common/ArticleSection.tsx`
- `src/features/article/components/CitedText.tsx`
- `src/features/article/components/sections/`
- Public article bridge sections under `src/app/_components/public-routes`

## Source findings

- `article-substance-ui.md`
- `shared-ui-and-tokens.md`
- `effects-and-reports-ui.md`

## Affected files/modules

Article sections, citations section, pharmacology, legality, tolerance, subjective effects, interactions, reagent testing, trip reports section, effect replications bridge.

## Proposed component/API shape

```tsx
<ArticleSection id icon heading spacing="article">
  <ArticleSection.Group icon heading headingLevel="h3" />
</ArticleSection>

<ArticleInfoCard tone icon title accessory />
<ArticleKeyValueRows rows={rows} density="compact" />
<ExpandableList collapsedCount ariaLabelBase />
<ExpandableText maxLines ariaLabelBase />
<ArticleText cited article tone="body" />
<CitationSup label href />
<ArticleCitationList citations={citations} />
<ArticleSourceFooter align="end" />
<ArticleSectionState kind="loading" />
```

## Migration steps

1. Convert `CitationsSection` and local source shells to `ArticleSection`.
2. Replace local h3 header blocks with `ArticleSubsectionHeader`.
3. Add `ArticleInfoCard` and migrate tolerance/interactions before legality.
4. Add `ExpandableList` for count-based lists, then `ExpandableText` for legality notes.
5. Export citation superscript rendering as a named component.
6. Add `ArticleText` only after citation marker behavior is covered by tests.
7. Standardize source footers and visible section loading states.

## Tests/verification

- Citation rendering tests for adjacent markers, unknown references, and anchor destinations.
- Focused tests for `ExpandableList`/`ExpandableText` collapsed and expanded states.
- Visual review on a substance page with citations, legality, pharmacology, reagent data, and related reports.

## Dependencies

- Task 01.
- Task 02.
- Task 03.

## Non-goals

- Do not change citation evidence semantics.
- Do not add citations or alter article content.
- Do not migrate dosage, duration, effects, or classification content into citation scope.
