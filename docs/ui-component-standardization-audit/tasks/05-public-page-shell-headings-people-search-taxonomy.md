# Public Page Shell, Headings, People, Search, And Taxonomy

## Objective

Standardize public route wrappers, section headings, contributor visuals, grouped substance lists, search result cards, and filter/chip navigation.

## Scope

- `src/components/layout/PageHeader.tsx`
- `src/components/layout/Header.tsx`
- `src/components/layout/Footer.tsx`
- `src/components/pages/`
- `src/app/_components/RouteChrome.tsx`
- Public route adapters under `src/app/about`, `src/app/search`, `src/app/category`, `src/app/substances`, `src/app/interactions`, `src/app/contributors`

## Source findings

- `public-pages-and-chrome.md`
- `shared-ui-and-tokens.md`

## Affected files/modules

About page, user profile page, search results, category/classification/mechanism detail pages, public chrome, profile links, contributor cards, taxonomy list sections.

## Proposed component/API shape

```tsx
<PublicContentShell width="narrow|standard|wide" as="main" focusTarget />
<PublicSectionHeading variant="rule|card|action" icon title actions />
<ContributorAvatar size="sm|lg" imageUrl name glow />
<ContributorCard contributor href />
<IconPillLink icon label href external />
<TaxonomyGroupSection icon label groups items displayMode="list|grid" />
<SearchResultCard result highlightedQuery />
<SearchMetaChips items />
<PublicChipNav items activeId />
```

## Migration steps

1. Add `PublicContentShell` and migrate Search, Category, Classification, About, and UserProfile wrappers.
2. Add `PublicSectionHeading` and migrate About/Profile section headers and Category/Classification card headers.
3. Extract `ContributorAvatar` and `ContributorCard` from About and UserProfile.
4. Extract `TaxonomyGroupSection` for Category and Classification; evaluate Mechanism after.
5. Extract `SearchResultCard` and `SearchMetaChips`.
6. Extract `PublicChipNav` for Mechanism qualifier navigation.

## Tests/verification

- Route smoke tests render `main-content` once and preserve focus targets.
- Search result highlighting and navigation still work.
- Category/classification/mechanism routes preserve item links and empty states.
- Visual review About, profile, search, category, classification, and mechanism pages.

## Dependencies

- Task 01.
- Task 02.
- Task 03.

## Non-goals

- Do not move route model ownership out of `RouteChrome`.
- Do not import route builders into shared primitives.
- Do not redesign public page heroes; this task standardizes repeated structure.
