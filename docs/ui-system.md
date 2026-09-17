# UI System Ownership

This is the ownership authority for shared UI extraction. Keep shared components
small, data-shaped, and tokenized; route policy, feature data, and editor
workflows stay with their owning feature. Use [`docs/ui-kit.md`](ui-kit.md) for
the live catalog and component how-to.

## Shared UI Inventory

For the component inventory and tier barrels, use [Where the kit lives](ui-kit.md#where-the-kit-lives)
and the live catalog. This document owns promotion criteria and the policies below,
not a second component catalog.

## Promotion Criteria

Public/common promotion requires all of these:

- At least a second runtime consumer with the same UI intent.
- Stable, data-shaped props; no imports from `src/features`, `src/app`, schema modules, server data modules, or public route builders.
- Styling through shared tokens, `Surface`, `Button`, `Badge`, or existing public token classes.
- Accessible semantics are owned by the primitive when the behavior is reusable.

Article primitives may live in `src/components/common` when they serve more than one public content lane and receive projected display data. Feature-specific article policy, citation evidence projection, route loading, and schema interpretation stay under the owning feature or app route.

Public layout/content primitives live in `src/components/layout` when they compose common primitives for multiple public page families. They may depend on `next/link` and public helpers, but should not own route model decisions.

Protected dev/editor primitives live under `src/features/dev/components`. They may use editor-only dependencies and dense workflow language. Promotion out of dev requires removing protected-editor assumptions and satisfying the public/common criteria.

## Variant Axis Vocabulary

Every shared component that declares `cva` variants names its axes from this
list, so `tone` means the same thing on `Button`, `Badge`, and `Surface`:

| Axis | Meaning | Values |
| --- | --- | --- |
| `variant` | The visual recipe: tone, emphasis, and shape together, until a component splits them | Component-specific; primitive names only, per the Button policy below |
| `size` | Type size and control height | `sm`, `default`, `lg`, plus the touch-target recipes named in the kit |
| `tone` | Semantic color: status and severity | `StatusBadge` today: `red`, `rose`, `yellow`, `orange`, `blue`, `green`, `emerald`, `gray`, `white`. Color names, not meanings; the geometry and tone normalization in the kit polish plan renames them. |
| `selected` | Boolean selected state on a surface or control | `true`, `false` |
| `padding` | Inner spacing role on a surface | `none`, `xs`, `sm`, `md`, `lg`, `xl` |
| `radius` | Corner role on a surface | `none`, `md` (chip role), `lg` (control role), `xl` and `index` (card role), `state` and `compactState` (panel role); each resolves to a `--radius-*` role token |

Recorded exceptions: `Input`, `Select`, and `Textarea` carry `inputSize`,
`selectSize`, and `textareaSize` because `size` collides with the native
attribute on `<input>` and `<select>`, and the three field controls keep one
shape. `src/components/ui/ownership.test.ts` rejects any other axis name.

## Button Variant Policy

`Button` variants should describe primitive visual behavior: tone, emphasis, shape, icon-only affordances, and broad interaction state. Feature names and composed UI recipes belong in the owning component.

Keep route-specific and composed recipes in their owning components; name primitive variants only by the visual or interaction behavior they expose.

Composed-recipe variants still on the primitive, with a decision per row.
`tabPrimary`, `tabPrimaryDisabled`, and `tabSecondary` were removed once
`PublicSegmentedTabs` absorbed them.

| Variant | Consumers | Decision |
| --- | --- | --- |
| `card` | Public/search result cards, article section cards, catalog | Migrate into a public card-button component after geometry normalization (Phase 2 of the kit polish plan). |
| `listItem` | `PublicPagePrimitives` | Migrate into the taxonomy/list row component in the same Phase 2 ticket. |
| `suggestion` | `EffectTagInput` | Migrate into a search suggestion option component in the same Phase 2 ticket. |
| `suggestionActive` | `EffectTagInput` | Same as `suggestion`; the pair moves together. |
| `tagRemove` | Dev `TagToken` | Migrate into `TagToken`; it has one consumer and no public surface. |

Remove a row when its owning component absorbs the recipe. Do not add rows.

## Name Chip Policy

Use `PublicNameChip` for compact badges that contain names of public entities or concepts: subjective effects, interaction substances or compound groups, classifications, index categories, source-page names, contributor names, and effect catalog links. It owns the subjective-effect badge treatment: `rounded-lg`, quiet translucent fill in dark mode, paper-white fill in light mode, `ring-1`, normal-case medium text, and the same hover/focus behavior across article and effects surfaces. Source-attribution pills such as TripSit and PROtestkit should use `theme-external-source-pill`, which draws from the same name-chip surface tokens while preserving its prefix/favicon layout.

`PublicNameChip` may render as a link, button, or span. When the chip itself expands content, render it as a button and place `ExpandIndicator` inside the chip. When a linked name has a separate expansion affordance, keep the linked text and use `ExpandButton` variant `inline` inside the same chip; do not add a nested control capsule.

Use `Badge` or a feature status component for status/severity, `ExpandButton` for hidden-list counts and standalone expanders, `PublicChipNav` for navigation/filter chips, and `PublicPill` for metadata. Reserve `PublicNameChip` for entity and concept names.

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

Add or adjust a theme utility for article hierarchy dividers so dark and light themes remain coordinated.

## Dependency Ownership

Icons: shared UI should import `Icon` from `src/components/common/Icon`. That abstraction owns `@iconify/react`, local `custom:` icons, and Iconify names such as `lucide:search`. Direct `lucide-react` imports are legacy or route-local only; do not add new direct imports in `src/components/common`.

Motion: shared primitives prefer CSS transitions, tokenized animations, and reduced-motion-safe classes. `framer-motion` is allowed only in components that need presence, gesture, or layout animation; `src/components/ui/motion-card.tsx` and article animation sections are current owners during migration.

Editor code and diff: `react-simple-code-editor` and `prismjs` are protected dev dependencies owned by `src/features/dev/components/JsonEditor.tsx`. Human-readable diff generation via `diff` is owned by data/editor changelog utilities such as `src/utils/data/changelog.ts`. These dependencies should not move into public/common primitives.

## Guardrails

`src/components/ui/ownership.test.ts` guards the common import/export boundary
and primitive variant behavior. Editorial ownership review maintains the
temporary recipe migration table above; test assertions do not certify prose.

Current common-boundary allowlist: `src/components/common/GlobalSearch.tsx` and `src/components/common/useGlobalSearchSuggestions.ts` may import the `SearchMatch` type from `src/data/builders/search` until a route-neutral search result type is extracted.
