# Public Loading, Status, Attribution, And Media Surfaces

## Objective

Unify public loading skeletons, full-page/in-page status shells, attribution footers, and media tile placeholders across route and section contexts.

## Scope

- `src/app/_components/RouteLoading.tsx`
- `src/app/_components/StatusPageShell.tsx`
- `src/app/_components/public-routes/EffectReplicationsSection.tsx`
- `src/app/_components/public-routes/SubstanceTripReportsSection.tsx`
- `src/features/effects/components/ReplicationGallery.tsx`
- `src/features/effects/components/ReplicationsPlaceholder.tsx`
- `src/features/article/components/sections/ReagentSection.tsx`
- `src/features/article/components/sections/InteractionsSection.tsx`
- `src/features/article/components/sections/SubjectiveEffectsSection.tsx`

## Source findings

- `public-pages-and-chrome.md`
- `article-substance-ui.md`
- `effects-and-reports-ui.md`

## Affected files/modules

Route loading skeletons, article section fallbacks, status pages, effect replication media, reagent/source footers, interaction source footers, subjective-effects contributor attribution.

## Proposed component/API shape

```tsx
<PublicSkeletonSurface density="card|section|route" />
<SkeletonPulse />
<SkeletonSection />
<StatusHeader icon title description />
<StatusActions actions />
<StatusFact label value />
<ArticleSourceFooter align="end" />
<ArticleContributorAttribution author text url avatarSrc />
<PublicMediaGallery media presentation emptyState />
<MediaTile mediaType title creator thumbnailUrl resourceUrl />
<MediaPlaceholder kind="empty|loading" />
```

## Migration steps

1. Promote `SkeletonPulse`, `SkeletonSection`, and a tokenized skeleton card surface from `RouteLoading`.
2. Update article-section fallbacks to use the same skeleton vocabulary.
3. Extract shared status header/action/fact subcomponents while keeping `StateCard` and `StatusPageShell` separate.
4. Extract `ArticleSourceFooter` from reagent and interactions sections.
5. Convert subjective-effects attribution to a richer attribution variant.
6. Extract media tile body from `ReplicationGallery`; keep lightbox behavior local at first.
7. Replace media placeholder and plain loading copy with one placeholder vocabulary.

## Tests/verification

- Loading pages and section fallbacks render without layout shift.
- Status pages keep action links and facts accessible.
- Media gallery image/video lightbox behavior remains unchanged.
- Visual review route loading, effect replication section, reagent/interactions footers, and status pages.

## Dependencies

- Task 01.
- Task 02.
- Task 04.

## Non-goals

- Do not rewrite lightbox behavior during first media tile extraction.
- Do not collapse full-page status and in-card state into one component.
- Do not add visible empty states where current product behavior intentionally returns `null`.
