# UI Component Standardization Tracker

## Skills read

- impeccable extract: `/Users/josie/.agents/skills/impeccable/SKILL.md`

## Executive summary

The audits point to a mature but uneven UI foundation. The repo already has the right anchors: `Surface`, `Button`, `Badge`, `ArticleSection`, `SectionCard`, and `StateCard`. The standardization work should extract repeated recipes around those anchors, not create a new design system.

The highest-value work is to make reusable patterns, components, tokens, variants, naming conventions, and migration path explicit. Public/common primitives should cover article pages, public chrome, effects, reports, search, taxonomy, skeletons, citations, and attribution. Protected editor tooling should get a separate dev-owned component layer under `src/features/dev/components/` so dense admin workflows do not leak into public UI primitives.

## Design-system strategy

- Keep `Surface` as the low-level surface primitive and promote repeated public/common card recipes through existing common components before adding new primitives.
- Keep `Button` primitive-focused. Move recipe-like variants such as list rows, cards, suggestions, tabs, icon action clusters, and removable tags into owning components over time.
- Keep `Badge` as the small-label primitive. Add public article/status/chip wrappers for repeated tone maps instead of expanding `Badge` with route-specific variants.
- Keep `ArticleSection`, `ArticleSubsectionCard`, and `ArticleSubsectionHeader` as the article-lane anchor, then split subsection primitives only when ownership becomes clearer.
- Keep `SectionCard` and `StateCard` for public/common cards and feedback states. Do not stretch `SectionCard` into the protected editor panel system.
- Create protected dev/editor primitives separately: `EditorPanel`, `EditorField`, `EditorToolbar`, `EditorNotice`, code/diff surfaces, tag tokens, and editor tabs.
- Convert token audit from informational to enforced baseline. Use it to prevent new raw color/card/letter-spacing escapes while migration reduces existing global light-theme override shims.

## Task index

| Task | File | Area | Depends on |
| --- | --- | --- | --- |
| 01 | [Token baseline and semantic public tokens](tasks/01-token-baseline-and-semantic-public-tokens.md) | Shared tokens | None |
| 02 | [Surface and card recipe consolidation](tasks/02-surface-and-card-recipe-consolidation.md) | Shared public/common surfaces | 01 |
| 03 | [Button, badge, chip, and label variants cleanup](tasks/03-button-badge-chip-and-label-variants-cleanup.md) | Shared controls | 01 |
| 04 | [Article section primitives and citation text](tasks/04-article-section-primitives-and-citation-text.md) | Article/substance UI | 01, 02, 03 |
| 05 | [Public page shell, headings, people, search, and taxonomy](tasks/05-public-page-shell-headings-people-search-taxonomy.md) | Public pages/chrome | 01, 02, 03 |
| 06 | [Public effects and reports content primitives](tasks/06-public-effects-and-reports-content-primitives.md) | Effects/reports | 01, 02, 03, 04 |
| 07 | [Public loading, status, attribution, and media surfaces](tasks/07-public-loading-status-attribution-and-media-surfaces.md) | Cross-public states/media | 01, 02, 04 |
| 08 | [Protected dev editor component layer](tasks/08-protected-dev-editor-component-layer.md) | Dev/editor UI | 01 |
| 09 | [Ownership docs, tests, and dependency policy](tasks/09-ownership-docs-tests-and-dependency-policy.md) | Governance | 01, 02, 03, 08 |

## Dependency order

1. Establish token audit baseline and semantic public/editor tokens.
2. Consolidate surfaces/cards and control variants against those tokens.
3. Migrate public article/page/effects/report surfaces incrementally, beginning with low-risk wrappers and repeated headings.
4. Build the protected editor layer separately, using common controls but dev-owned layout recipes.
5. Add ownership tests and documentation once APIs stabilize enough to enforce without churn.

## Validation plan

- Run token-audit baseline checks after task 01 and after each public/common migration.
- Run focused component tests for migrated primitives before broad suites.
- For article citation text changes, run citation rendering tests around adjacent markers, unknown references, and anchor destinations.
- For effect citation changes, run `EffectCitationsSection` tests before broad UI tests.
- For report cards, verify both full list cards and compact substance-related cards.
- Run visual review on representative pages: `/`, `/search/[query]`, `/category/[categoryKey]`, `/[slug]`, `/effects/[effectSlug]`, `/reports`, `/reports/[slug]`, and `/dev`.
- Run `npm run lint:scripts`, `npm run test`, and `npm run typecheck` only when touched code scope justifies broad validation.

## Explicit immaterial gaps

- No app code was changed in this synthesis.
- No browser visual QA was performed; the source findings were documentation-only audits.
- Bundle size and runtime performance were not measured.
- Generated files were intentionally not inspected or modified.
- Exact prop names are proposed API shape, not final implementation contracts.
- The task list does not require deleting all raw Tailwind classes in one pass; it defines a migration path and enforcement strategy.
- Public typography and font ownership are covered at the token/control level, but a full brand typography redesign is out of scope.
