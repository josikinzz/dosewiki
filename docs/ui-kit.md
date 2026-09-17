# UI Kit

The dose.wiki UI Kit is the catalog and how-to authority for shared UI building
blocks. **Before building UI, browse the kit and reuse an existing component.
Do not hand-roll a button, badge, card, input, dialog, or surface that already
exists.**

Use these companion references for decisions outside the catalog:

- [`docs/ui-system.md`](ui-system.md) — ownership boundaries, promotion criteria,
  and dependency policy.
- [`notes-and-plans/guides/dosewiki-visual-style-guide.md`](../notes-and-plans/guides/dosewiki-visual-style-guide.md) — brand and visual language.

## Browse it live: `/dev/kit`

The catalog renders each shared primitive with its real variants and properties.
It also provides an import line and use guidance.

The appearance cog contains four independent controls: color scheme, visual style,
surfaces, and accent. The catalog sweep covers color scheme and visual style.
The appearance matrix tests cover all 196 supported combinations.

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

`Surface` is the meta-primitive — most card/panel shells should compose a `Surface`
variant before reaching for a raw `<div>` with border + background classes.

Import from the barrels:

```ts
import { Button, Badge, Surface, ContentCard } from "@/components/ui";
```

## Rules

1. **Reuse first.** Check `/dev/kit` and this guide before writing new UI. If a
   primitive almost fits, extend it through props or variants rather than forking
   it. Consult `docs/ui-system.md` when deciding which layer owns the result.
2. **Keep variants primitive.** Button and Badge variant names describe visual
   behavior (tone, emphasis, shape, icon affordance), never a feature or route.
   Feature-named variants are blocked by `src/components/ui/ownership.test.ts`.
3. **Promote intentionally.** Keep feature-local components beside their feature
   until they have multiple real consumers and a stable, data-shaped API. The
   promotion criteria live in `docs/ui-system.md`.
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
8. **Focus is quiet, not an accent frame.** Use `focusRingClassName` or
   `theme-focus-ring` for a 1px neutral keyboard-focus cue. Use
   `theme-field-focus` for text fields and selects, which emphasize their
   existing border without an outside ring. Do not add thick accent outlines,
   `ring-2`, or ring offsets for clicking, focusing, or loading states in any
   visual style or color variation. Preserve semantic validation borders and
   system high-contrast focus indicators.

## Accent usage rules

Accent color always resolves through theme tokens so the appearance cog's hue
slider repaints every accented pixel. In shared and feature UI:

- **Section headings** color from `--theme-section-heading` — either
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
and `raw-accent-hex`) enforces the last rule.

## Public page loading

- Keep substance narrative and safety warnings, and effect article prose, in
  server-rendered components. `SubstanceSecondarySections` and
  `EffectArticleServer` compose secondary data behind separate Suspense boundaries;
  editor builds retain resolved enrichment for mutable draft previews. ISR routes
  still await the complete render on a cold miss, so these boundaries alone do
  not guarantee early HTTP streaming.
- Use `SmartLink` for secondary navigation and documentation links. Its default
  prefetch is driven by hover or focus, not viewport visibility. Reserve eager
  prefetch for deliberate high-intent destinations.
- Keep `AppearancePanel` behind the settings popover's dynamic import and Theme
  Lab styles with the lazy lab component. Opening controls must remain usable
  after their code arrives.
- Replication showcases keep a responsive poster until video data is ready.
  Muted autoplay uses an existing preview rendition where available; explicit
  playback or sound intent selects the full work. Preserve viewport,
  reduced-motion, data-saver, and `preload="none"` behavior.
  While the poster or initial motion frame loads, use the index thumbnail's
  shared shimmer treatment, not an unavailable-media card. Reserve error
  placeholders for confirmed failures, stop shimmer when media is ready, and
  respect reduced motion without adding an artificial loading delay.
- Gallery SSR and API pagination share `getGalleryBrowsePage`. The default artist
  view opens with 16 rails and at most 14 previews per rail; focused and filtered
  grids retain 64-work pages. Hydration must reuse a matching bootstrap rather
  than replace it. Cursor identity includes query, locale, and corpus revision;
  stale or mismatched cursors recover through a fresh first page.
- Effect membership uses the compact native SQL projection and revision-aware
  cache, not complete substance documents. Effect media reads are scoped to the
  requested effect; replication details and effect order metadata use batched
  native lookups. Preserve the complete viewer collection and publication guards.
- Documentation Mermaid code loads only when a diagram approaches within 400px
  of the viewport. Retain reserved space, theme updates after activation, stale
  render guards, and immediate rendering when IntersectionObserver is unavailable.

## Adding or changing a shared component

Two Vitest checks keep the catalog aligned with the shared barrels:

- `src/app/dev/kit/registry/completeness.test.ts` checks that every runtime export
  from `ui/`, `common/`, and `layout/` has one catalog story.
- `src/app/dev/kit/registry/render.test.tsx` server-renders every example in all
  four appearance combinations and catches missing providers or other render failures.

These are verification checks, not build-time checks. They run with the Vitest
suite, including the `npm run test` step inside `npm run verify:app`.

To add or change a shared component:

1. Place it in the tier selected by `docs/ui-system.md` and export it from that
   tier's barrel.
2. Add or update a story in `src/app/dev/kit/stories/`. Use the `StoryDef`
   contract in `src/app/dev/kit/registry/types.ts`, list every runtime symbol in
   `exports`, and show each one in an example.
3. Register the story in `src/app/dev/kit/registry/index.ts`.
4. Run `npm run test -- src/app/dev/kit/registry/completeness.test.ts src/app/dev/kit/registry/render.test.tsx`.

Catalog source layout:

```
src/app/dev/kit/
  page.tsx                      # gated route entry
  KitCatalog.tsx                # catalog shell + token showcase + appearance controls
  components/CatalogPrimitives.tsx  # StoryCard / PropsTable / copyable import
  registry/
    types.ts                    # StoryDef contract
    index.ts                    # the registered story list
    completeness.test.ts        # shared-barrel drift check
    render.test.tsx             # story render check
  stories/*.story.tsx           # catalog story modules
```

## Scope

The completeness test compares the registered stories with the runtime exports
of all three shared barrels: `ui/`, `common/`, and `layout/`. Read the barrels
and the registry for the current inventory rather than maintaining a second list
here.

Feature-local article, effects, reports, and editor components stay beside their
features unless they meet the promotion criteria in `docs/ui-system.md`.
