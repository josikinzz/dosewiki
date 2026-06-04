# UI System Ownership

Last verified: 2026-06-03

This is the ownership contract for shared UI extraction. Keep shared components small, data-shaped, and tokenized; route policy, feature data, and editor workflows stay with their owning feature.

## Shared UI Inventory

| Component or layer | Owner | Intended consumers | Exposed API | Promotion criteria | Migration notes |
| --- | --- | --- | --- | --- | --- |
| [`Surface`](../src/components/ui/surface.tsx), `ContentCard`, `InteractiveContentCard`, `NestedContentCard`, `StatusState`, `DangerCallout` | `src/components/ui/` | Shared/common, public pages, article sections, dev wrappers | Semantic surface variants, padding, radius, interactive state | Reused visual shell, tokenized styling, no route or feature data | Prefer these recipes before adding raw card shells. |
| [`Button`](../src/components/ui/button.tsx) | `src/components/ui/` | All UI layers | Primitive tone, size, shape, and icon affordances | Variant names describe primitive behavior, not a route, feature, or composed recipe | Existing recipe variants are temporary and tracked below. |
| [`Badge`](../src/components/ui/badge.tsx) | `src/components/ui/` | Public, article, dev status chips | Tone/status variants only | Shared semantic tone with stable text and focus behavior | Feature-specific labels wrap `Badge` instead of adding variants. |
| `Icon`, `IconBadge`, `PublicOverline`, `PublicPill`, `PublicChipNav` | `src/components/common/` | Public/common, article, dev adapters | Icon names, compact public tokens, chip navigation | Second runtime consumer, no feature-domain import, tokenized styling | `Icon` is the canonical shared icon abstraction. |
| [`ArticleSection`](../src/components/common/ArticleSection.tsx), article subsection cards, article info/key-value/source helpers | `src/components/common/` | Substance articles, effects, reports, public-route bridges | Article section spacing, subsection card/header/group, info cards, source footer | Reused by more than one public content lane and accepts projected props instead of article schema imports | Keep evidence/data projection in features; shared article primitives render only. |
| [`SectionCard`](../src/components/common/SectionCard.tsx) | `src/components/common/` | Public page sections and legacy dev panels | Public card shell and enter delay | Public/common consumer count plus tokenized surface recipe | New dev panels should move to protected editor primitives. |
| [`StateCard`](../src/components/common/StateCard.tsx) | `src/components/common/` | Empty, loading, and status states across public and dev UI | Tone, icon/status, badge, actions, footer, alignment, compact/loading | Shared state layout with no route or domain dependency | Use before introducing one-off empty panels. |
| Public layout/content primitives | `src/components/layout/` | Public pages, effects, reports, app route bridges | Page shell, section heading, contributor cards, taxonomy/search cards, detail hero, metadata/fact tiles, skeleton/media/status helpers, segmented tabs | Second public-page family consumer, route-neutral props, no direct app route policy | These are public composition primitives, not low-level `ui` variants. |
| Protected editor primitives | `src/features/dev/components/` | `/dev` and editor workflows | Editor panels, fields, toolbars, notices, navigation, tag tokens, `JsonEditor`, `DiffPreview` | Repeated protected-editor use, dense workflow semantics, editor-only dependency allowed | Do not promote to `src/components/common` until public-safe and dependency-free. |

## Promotion Criteria

Public/common promotion requires all of these:

- At least a second runtime consumer with the same UI intent.
- Stable, data-shaped props; no imports from `src/features`, `src/app`, schema modules, Convex data modules, or public route builders.
- Styling through shared tokens, `Surface`, `Button`, `Badge`, or existing public token classes.
- Accessible semantics are owned by the primitive when the behavior is reusable.

Article primitives may live in `src/components/common` when they serve more than one public content lane and receive projected display data. Feature-specific article policy, citation evidence projection, route loading, and schema interpretation stay under the owning feature or app route.

Public layout/content primitives live in `src/components/layout` when they compose common primitives for multiple public page families. They may depend on `next/link` and public helpers, but should not own route model decisions.

Protected dev/editor primitives live under `src/features/dev/components`. They may use editor-only dependencies and dense workflow language. Promotion out of dev requires removing protected-editor assumptions and satisfying the public/common criteria.

## Button Variant Policy

`Button` variants should describe primitive visual behavior: tone, emphasis, shape, icon-only affordances, and broad interaction state. Feature names and composed UI recipes belong in the owning component.

Forbidden new variant names include route or feature terms such as `searchOption`, `substanceListItem`, `categoryHeader`, `pickerListItem`, `generatePrimary`, and similar domain recipes.

Temporary composed-recipe allowlist during migration:

| Variant | Current owner to migrate toward |
| --- | --- |
| `card` | Public/search result card component |
| `listItem` | Taxonomy/list row component |
| `suggestion` | Search suggestion option component |
| `suggestionActive` | Search suggestion option component |
| `tabPrimary` | Public segmented tabs or feature tab trigger |
| `tabPrimaryDisabled` | Public segmented tabs or feature tab trigger |
| `tabSecondary` | Public segmented tabs or feature tab trigger |
| `tagRemove` | Dev `TagToken` or owning tag control |

Remove entries from this allowlist as owning components absorb each recipe.

## Dependency Ownership

Icons: shared UI should import `Icon` from `src/components/common/Icon`. That abstraction owns `@iconify/react`, local `custom:` icons, and Iconify names such as `lucide:search`. Direct `lucide-react` imports are legacy or route-local only; do not add new direct imports in `src/components/common`.

Motion: shared primitives prefer CSS transitions, tokenized animations, and reduced-motion-safe classes. `framer-motion` is allowed only in components that need presence, gesture, or layout animation; `src/components/ui/motion-card.tsx` and article animation sections are current owners during migration.

Lightbox/gallery: `yet-another-react-lightbox`, `lightgallery`, and `lg-*` plugins are owned by media/gallery features such as `src/features/effects/components/ReplicationGallery.tsx`. Shared media tiles and placeholders must stay dependency-light and receive callbacks or projected media props.

Editor code and diff: `react-simple-code-editor` and `prismjs` are protected dev dependencies owned by `src/features/dev/components/JsonEditor.tsx`. Human-readable diff generation via `diff` is owned by data/editor changelog utilities such as `src/utils/data/changelog.ts`. These dependencies should not move into public/common primitives.

## Guardrails

`src/components/ui/ownership.test.ts` enforces the common import boundary, keeps dev editor widgets out of the common barrel, and keeps `Button` feature variants from returning. Use narrow, documented allowlists only for existing migration debt.

Current common-boundary allowlist: `src/components/common/GlobalSearch.tsx` and `src/components/common/useGlobalSearchSuggestions.ts` may import the `SearchMatch` type from `src/data/builders/search` until a route-neutral search result type is extracted.
