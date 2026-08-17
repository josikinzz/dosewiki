# UI System Ownership

This is the ownership authority for shared UI extraction. Keep shared components
small, data-shaped, and tokenized; route policy, feature data, and editor
workflows stay with their owning feature. Use [`docs/ui-kit.md`](ui-kit.md) for
the live catalog and component how-to.

## Shared UI Inventory

| Component or layer | Owner | Intended consumers | Exposed API | Promotion criteria | Migration notes |
| --- | --- | --- | --- | --- | --- |
| [`Surface`](../src/components/ui/surface.tsx), `ContentCard`, `InteractiveContentCard`, `NestedContentCard`, `StatusState`, `DangerCallout` | `src/components/ui/` | Shared/common, public pages, article sections, dev wrappers | Semantic surface variants, padding, radius, interactive state | Reused visual shell, tokenized styling, no route or feature data | Prefer these recipes before adding raw card shells. |
| [`Button`](../src/components/ui/button.tsx) | `src/components/ui/` | All UI layers | Primitive tone, size, shape, and icon affordances | Variant names describe primitive behavior, not a route, feature, or composed recipe | Existing recipe variants are temporary and tracked below. |
| [`Badge`](../src/components/ui/badge.tsx) | `src/components/ui/` | Public, article, dev status chips | Tone/status variants only | Shared semantic tone with stable text and focus behavior | Feature-specific labels wrap `Badge` instead of adding variants. |
| `Icon`, `IconBadge`, `PublicOverline`, `PublicPill`, `PublicNameChip`, `PublicChipNav` | `src/components/common/` | Public/common, article, dev adapters | Icon names, compact public tokens, named-entity chips, chip navigation | Second runtime consumer, no feature-domain import, tokenized styling | `Icon` is the canonical shared icon abstraction. |
| [`ExpandButton`](../src/components/common/ExpandButton.tsx), `ExpandIndicator` | `src/components/common/` | Public/common, article, effects, reports | Intent variants for inline, floating, count, chip, and card expansion affordances | Reused content-reveal behavior with accessible names and consistent icon language | Use semantic variants by container intent; do not hand-roll `...` plus chevron pairs. |
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

## Name Chip Policy

Use `PublicNameChip` for compact badges that contain names of public entities or concepts: subjective effects, interaction substances or compound groups, classifications, index categories, source-page names, contributor names, and effect catalog links. It owns the subjective-effect badge treatment: `rounded-lg`, quiet translucent fill in dark mode, paper-white fill in light mode, `ring-1`, normal-case medium text, and the same hover/focus behavior across article and effects surfaces. Source-attribution pills such as TripSit and PROtestkit should use `theme-external-source-pill`, which draws from the same name-chip surface tokens while preserving its prefix/favicon layout.

`PublicNameChip` may render as a link, button, or span. When the chip itself expands content, render it as a button and place `ExpandIndicator` inside the chip. When a linked name has a separate expansion affordance, keep the linked text and use `ExpandButton` variant `inline` inside the same chip; do not add a nested control capsule.

Do not use `PublicNameChip` for status or severity labels, quantitative hidden-list controls such as `+3`, standalone section expanders, navigation/filter chips, dates, featured labels, search metadata, or other metadata pills. Those remain owned by `Badge`, `ExpandButton`, `PublicPill`, `PublicChipNav`, or the feature-specific status component.

## Expand Affordance Policy

Use `ExpandButton` for reusable content-reveal controls and `ExpandIndicator` when the whole row or card header is already a button. Normal selects, dropdown menus, mobile menus, and navigation disclosure controls may keep their own chevron-only treatment because they do not mean "show more article content."

Variant intent:

- `inline`: icon-only `...` plus chevron with no pill/container styling. Use inside badge-like parents, chips, inline prose, and compact value rows such as interaction badges, subjective effect badges, bioavailability, half-life, and dosage plateau rows. Do not nest a pill inside another pill.
- `chip`: the whole control is a badge/chip, with label text and the inline `...` plus chevron inside the same outer capsule. Use for subjective effect chips where the chip itself is the expandable surface.
- `count`: quantitative hidden-list controls like `+3` plus chevron. Use for aliases, report lists, references, reagent rows, and other collapsed list counts.
- `floating`: standalone centered or inline section reveal pills. Use for whole-section text previews and list reveals when the control is not inside another badge-like surface.
- `card`: contained mini reveal controls inside larger cards or expanded inline cards where a visible control capsule helps the action read clearly.

If a new expand affordance needs the `...` plus chevron symbol, add or reuse one of these semantic variants instead of composing `Icon` instances locally.

## Divider Policy

Use `theme-horizontal-divider` for standalone horizontal rules that separate article content, expanded detail blocks, menu groups, or rendered rich-text content. It draws from `--theme-horizontal-divider-image`, so dark and light themes stay coordinated.

Use `theme-section-group-divider` for major article-content group transitions where the divider is part of the reading hierarchy, such as subjective-effect families. It owns the top spacing, hides itself on the first group, and adds a restrained accent lead-in over the shared horizontal divider image.

Use `theme-horizontal-divider-block` when a content block needs matching top and bottom horizontal rules. Use `theme-gradient-divider` only as the legacy compact class name; it maps to the same shared divider image.

Use plain token borders or `divide-y` only for table-like rows, dense lists, card internals, and vertical separators where the separator should be quiet structure rather than a content transition.

Do not hand-roll new `from-fuchsia` divider gradients for article hierarchy. Add or adjust a theme utility instead so dark and light themes stay coordinated.

## Dependency Ownership

Icons: shared UI should import `Icon` from `src/components/common/Icon`. That abstraction owns `@iconify/react`, local `custom:` icons, and Iconify names such as `lucide:search`. Direct `lucide-react` imports are legacy or route-local only; do not add new direct imports in `src/components/common`.

Motion: shared primitives prefer CSS transitions, tokenized animations, and reduced-motion-safe classes. `framer-motion` is allowed only in components that need presence, gesture, or layout animation; `src/components/ui/motion-card.tsx` and article animation sections are current owners during migration.

Editor code and diff: `react-simple-code-editor` and `prismjs` are protected dev dependencies owned by `src/features/dev/components/JsonEditor.tsx`. Human-readable diff generation via `diff` is owned by data/editor changelog utilities such as `src/utils/data/changelog.ts`. These dependencies should not move into public/common primitives.

## Guardrails

`src/components/ui/ownership.test.ts` enforces the common import boundary, keeps
dev editor widgets out of the common barrel, blocks feature-named `Button`
variants, and checks that temporary recipe variants remain documented here. It
runs in Vitest as a verification check, not as part of the build itself.

Current common-boundary allowlist: `src/components/common/GlobalSearch.tsx` and `src/components/common/useGlobalSearchSuggestions.ts` may import the `SearchMatch` type from `src/data/builders/search` until a route-neutral search result type is extracted.
