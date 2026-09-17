# UI Kit

The dose.wiki UI Kit is the catalog and how-to authority for shared UI building
blocks. **Before building UI, browse the kit and reuse an existing component.
Do not hand-roll a button, badge, card, input, dialog, or surface that already
exists.**

The second half of this document ([Ownership](#ownership)) is the authority for
shared UI extraction: ownership boundaries, promotion criteria, variant
vocabulary, and dependency policy. For brand and visual language, read the
[visual style guide](visual-style-guide.md).

## Browse it live: `/dev/kit`

The catalog renders each shared primitive with its real variants and properties.
It also provides an import line and use guidance.

The appearance cog contains four independent controls: color scheme, visual style,
surfaces, and accent. The catalog sweep covers color scheme and visual style.
The appearance matrix tests own the supported combination coverage.

Two vocabularies name the same axes. Readers see **Vivid** and **Clinical** in
the cog's Style picker; code and stylesheets call them `fun` and `pro`
(`data-visual-style`). Readers see dark and light; code calls the axis
`ColorScheme` and carries it as `data-theme`. The identifiers never change;
only the labels are reader-facing.

- Route: **`/dev/kit`** (auth-gated under `/dev`, like the rest of the editor surface).
- Run `npm run dev` and open `/dev/kit`. The catalog demonstrates the current
  component behavior; when prose and a rendered component disagree, inspect the
  component source and correct the catalog or guide.

## Where the kit lives

Three tiers, each with its own barrel and ownership boundary:

| Tier | Path | What lives here |
| --- | --- | --- |
| **Primitives** | `src/components/ui/` | Radix/shadcn building blocks: `Button`, `Badge`, `Surface` (+ `ContentCard`, `InteractiveContentCard`, `NestedContentCard`, `StatusState`, `DangerCallout`), `Dialog`, `Select`, `Tabs`, `Input`, `Popover`, etc. |
| **Common** | `src/components/common/` | Shared recipes on top of primitives: `Icon`, `IconBadge`, `SectionCard`, `StateCard`, `ExpandButton`, `DisclosureCard`, `ArticleSection`, public tokens. |
| **Layout** | `src/components/layout/` | Public page shells and chrome: `Header`, `Footer`, `PageHeader`, public content/feedback/page primitives, segmented tabs. |

`Surface` is the meta-primitive: most card/panel shells should compose a `Surface`
variant before reaching for a raw `<div>` with border + background classes.

Import from the barrels:

```ts
import { Button, Badge, Surface, ContentCard } from "@/components/ui";
```

## Rules

1. **Reuse first.** Check `/dev/kit` and this guide before writing new UI. If a
   primitive almost fits, extend it through props or variants rather than forking
   it. Consult [Ownership](#ownership) when deciding which layer owns the result.
2. **Keep variants primitive.** Button and Badge variant names describe visual
   behavior (tone, emphasis, shape, icon affordance), never a feature or route.
   Feature-named variants are blocked by `src/components/ui/ownership.test.ts`.
3. **Promote intentionally.** Keep feature-local components beside their feature
   until they have multiple real consumers and a stable, data-shaped API. The
   promotion criteria live under [Promotion criteria](#promotion-criteria).
   The same rule governs CSS: a `.theme-*` class one feature consumes lives in
   that feature's own sheet (`src/features/dev/dev-tools.css`,
   `src/app/china/china.css`), declared inside `@layer utilities`; a class two
   features or the shared tiers consume lives in
   `src/styles/utilities-theme.css`. `npm run theme:classes:check` reports
   classes nothing renders.
   Never key a component rule on `data-theme`: a value that differs between
   dark and light is a `--theme-*` token with a value per scheme in
   `src/styles/site-colors.css`. `src/theme/lightSheet.test.ts` holds that line.
4. **Disclosure affordances use the doubled ellipsis + chevron indicator.**
   Expand/collapse controls go through `ExpandButton`/`ExpandIndicator`
   (`src/components/common/ExpandButton.tsx`), never a bare chevron. The
   `⋯ ⌄` pair is an accessibility decision: dose.wiki readers may be heavily
   intoxicated, and the doubled cue stays legible as "there is more here"
   when a lone chevron does not.
5. **Touch targets are a public style contract.** Under a coarse pointer every
   compact control reaches 44px: the Button sizes `sm`, `pill`, `xs`, `chip`,
   and `quiet` carry `[@media(pointer:coarse)]:min-h-11`, and icon-only
   controls that stay compact on desktop append `TOUCH_ICON` from
   `src/components/ui/touchTargets.ts` (`TOUCH_PILL` for height-only floors).
   Fields keep 16px on phones so iOS does not zoom on focus: the `sm` size of
   `Input`, `Textarea`, `EditorSelect`, and the Select trigger renders
   `text-[16px] md:text-sm`. Tests may assert these two class recipes by name;
   `src/components/ui/touch-sizing.test.tsx` guards them.
6. **Index panels share one measure.** Use `IndexPanelGrid` or
   `IndexPanelMasonry` for substance, effect, category, and article panels.
   Both prefer 320px columns, shrink only when the container is narrower, and
   use 20px gaps below `lg` or 24px at `lg`. Responsive grouped grids pass the
   `ref`, `count`, and `gate` returned by `useResponsiveColumnCount` so column
   counts follow the actual content box rather than viewport width.
7. **Effect category icons follow the index registry.** Resolve category titles,
   slugs, or display labels with `resolveEffectCategoryIcon` from
   `src/features/effects/pages/effectsIndexConfig.ts`. Keep bespoke fallback icons
   only for sections that do not correspond to a canonical effect category.
8. **Corners are roles, not sizes.** Shared components ask for a corner role:
   `rounded-control` (buttons, fields, tabs, menu items), `rounded-chip`
   (name chips, small tags), `rounded-card` (cards, dialogs, popovers),
   `rounded-panel` (state and hero panels), `rounded-pill` (capsules). The
   roles are `--radius-*` tokens in `src/styles/base.css` with a value per
   visual style (`pro-theme.css` re-seats them), so Clinical squares every
   card without touching a component. `src/components/ui/ownership.test.ts`
   rejects a Tailwind radius size in the primitives tier; `rounded-full` and
   `rounded-none` stay allowed.
9. **Focus is quiet, not an accent frame.** Use `focusRingClassName` or
   `theme-focus-ring` for a 1px neutral keyboard-focus cue. Use
   `theme-field-focus` for text fields and selects, which emphasize their
   existing border without an outside ring. Do not add thick accent outlines,
   `ring-2`, or ring offsets for clicking, focusing, or loading states in any
   visual style or color variation. Preserve semantic validation borders and
   system high-contrast focus indicators.

## Accent usage rules

Accent color always resolves through theme tokens so the appearance cog's hue
slider repaints every accented pixel. In shared and feature UI:

- **Section headings** color from `--theme-section-heading`: either
  `text-[var(--theme-section-heading)]` or the `.theme-accent-heading` utility.
- **Prose emphasis** (accented `<strong>`) uses `.theme-accent-emphasis`, or
  `.theme-accent-emphasis-scope` on a containing element.
- **Accent icons** use `.theme-icon-accent`. Where a Tailwind variant is
  required (`hover:`, `group-open:`), use `text-dose-accent-strong` variants.
- **Link underlines** use `.theme-accent-underline`.
- **Never raw accents.** Raw `fuchsia-*`/`violet-*` utilities and accent hex
  literals are prohibited in component `className`/`style`. Reach accent
  through `--theme-*` tokens, the token-backed `dose-*` Tailwind aliases, or
  `rgb(var(--c-*))` channel seeds for rings, gradients, and color mixes.

The theme token audit (`npm run theme:tokens:check`, rules `raw-accent-utility`
and `raw-accent-hex`) enforces the last rule. The same audit's
`direct-theme-variable` rule diffs inline `var(--theme-*)` usage against
`src/theme/theme-token-audit-baseline.json`, so a new inline theme variable
fails the check until it is expressed as a utility or token alias.

## Public page loading

For article/server rendering, gallery pagination, media readiness or lazy runtime
loading changes, follow [Public page loading](../architecture/runtime-and-data.md#public-page-loading).

## Adding or changing a shared component

Two Vitest checks keep the catalog aligned with the shared barrels:

- `src/app/dev/kit/registry/completeness.test.ts` checks that every runtime export
  from `ui/`, `common/`, and `layout/` has one catalog story.
- `src/app/dev/kit/registry/render.test.tsx` server-renders every example in all
  four appearance combinations and catches missing providers or other render failures.

These are verification checks, not build-time checks. They run with the Vitest
suite, including the `npm run test` step inside `npm run verify:app`.

To add or change a shared component:

1. Place it in the tier selected by [Promotion criteria](#promotion-criteria) and export it from that
   tier's barrel.
2. Add or update a story in `src/app/dev/kit/stories/`. Use the `StoryDef`
   contract in `src/app/dev/kit/registry/types.ts`, list every runtime symbol in
   `exports`, and show each one in an example.
3. Register the story in `src/app/dev/kit/registry/index.ts`.
4. Run `npm run test -- src/app/dev/kit/registry/completeness.test.ts src/app/dev/kit/registry/render.test.tsx`.

The registry and `src/app/dev/kit/` own the current catalog layout; inspect them
when adding a story rather than maintaining a parallel directory inventory.

## Scope

The completeness test compares the registered stories with the runtime exports
of all three shared barrels: `ui/`, `common/`, and `layout/`. Read the barrels
and the registry for the current inventory rather than maintaining a second list
here.

Feature-local article, effects, reports, and editor components stay beside their
features unless they meet the [promotion criteria](#promotion-criteria).

## Ownership

Keep shared components small, data-shaped, and tokenized; route policy, feature
data, and editor workflows stay with their owning feature. The component
inventory and tier barrels are listed under [Where the kit lives](#where-the-kit-lives);
this section owns promotion criteria and the policies below, not a second
component catalog.
## Promotion criteria

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
| `listItem` | `PublicPagePrimitives` | Migrate into the taxonomy/list row component in the same Phase 2 work. |
| `suggestion` | `EffectTagInput` | Migrate into a search suggestion option component in the same Phase 2 work. |
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
