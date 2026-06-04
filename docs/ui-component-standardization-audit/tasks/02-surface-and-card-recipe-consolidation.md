# Surface And Card Recipe Consolidation

## Objective

Promote repeated public/common card and state recipes through `Surface`, `SectionCard`, and `StateCard` without introducing a parallel design system.

## Scope

- `src/components/ui/surface.tsx`
- `src/components/common/SectionCard.tsx`
- `src/components/common/StateCard.tsx`
- `src/components/common/ArticleSection.tsx`
- Public card consumers in `src/components/pages`, `src/features/article`, `src/features/effects`, and `src/features/reports`

## Source findings

- `shared-ui-and-tokens.md`
- `article-substance-ui.md`
- `public-pages-and-chrome.md`
- `effects-and-reports-ui.md`

## Affected files/modules

Surface variants, public card wrappers, article subsection cards, report cards, search result cards, taxonomy cards, skeleton/status cards.

## Proposed component/API shape

- Keep `Surface` low-level with variants such as `public`, `subtle`, `index`, `state`, `danger`, `articleHero`, and `moleculePanel`.
- Add or clarify recipe wrappers:
  - `ContentCard`
  - `InteractiveContentCard`
  - `NestedContentCard`
  - `StatusState`
  - `DangerCallout`
- Preserve `SectionCard` and `StateCard` as public/common anchors while aligning internals to tokenized surfaces.

## Migration steps

1. Replace shared component internals that hard-code raw surface classes.
2. Route `ArticleSubsectionCard` through the same nested card recipe.
3. Migrate simple public cards: category/classification cards, empty states, search result shells.
4. Migrate report and effect cards after their projection helpers are stable.
5. Delete corresponding light-mode override groups only after consumers no longer need them.

## Tests/verification

- Existing `surface.test.tsx` continues to cover `SectionCard`, `StateCard`, search/report cards, and banners.
- Add a focused test that public card recipes render correct variant classes.
- Visual review card-heavy public pages in light and dark modes.

## Dependencies

- Task 01.

## Non-goals

- Do not move route data logic into shared cards.
- Do not consolidate every card shape into one polymorphic component.
- Do not make `SectionCard` support protected editor-specific panel behavior.
