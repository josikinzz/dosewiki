# UI kit

The UI kit is the set of shared components in `src/components/` and the editor kit in `src/features/dev/components/`. `/dev/kit` renders every shared export with its real variants, an import line, and usage notes. When this page and a rendered component disagree, the component source is right. Color, type, corner, height, and motion values live in the [visual style guide](visual-style-guide.md).

## Browse the catalog

Run `bun run dev` and open `/dev/kit`. The route is auth-gated like the rest of `/dev`.

The appearance cog has four independent controls: color scheme, visual style, surfaces, and accent. The catalog covers color scheme and visual style. Readers see the styles as **Vivid** and **Clinical**. Code and stylesheets call them `fun` and `pro`, carried as `data-visual-style`. The color scheme axis is `ColorScheme` in code and `data-theme` in the DOM.

## Tiers

Each tier has its own barrel.

| Tier | Path | Contents |
| --- | --- | --- |
| Primitives | `src/components/ui/` | Radix and shadcn building blocks: `Button`, `Badge`, `Surface` (with `ContentCard`, `InteractiveContentCard`, `NestedContentCard`, `StatusState`, `DangerCallout`), `Dialog`, `Select`, `Tabs`, `Input`, `Popover`, and more |
| Common | `src/components/common/` | Recipes on top of primitives: `Icon`, `IconBadge`, `SectionCard`, `StateCard`, `ExpandButton`, `DisclosureCard`, `ArticleSection`, public tokens |
| Layout | `src/components/layout/` | Public page shells and chrome: `Header`, `Footer`, `PageHeader`, public content and page primitives, segmented tabs |
| Editor kit | `src/features/dev/components/` | Dev tool components: `Notice`, `EditorSection`, `EditorField`, `EditorList`, `ConfirmDialog`, `SaveLine`, the unsaved-work registry, and shortcut hooks. Editor build only. |

```ts
import { Button, Badge, Surface, ContentCard } from "@/components/ui";
```

`Surface` is the shared card and panel shell. `SectionCard` composes `InteractiveContentCard` for public section content.

The `editor-guardrails/use-shared-guard-and-confirm` ESLint rule makes editor folders use the shared unsaved-work guard and `ConfirmDialog` instead of their own `beforeunload` handlers and `window.confirm` calls.

## Editor status and requests

Every dev tool reports loading, success, warning, and error through `Notice` (`tone`, `placement="page" | "inline"`, `dismiss`). Only `danger` is announced as an alert. Loading and every other tone are a polite status. With `dismiss`, an error stays until the editor dismisses it, and a success clears itself. Dev tool requests go through `devFetch()` in `src/features/dev/tools/devFetch.ts`, and each caller validates the fields it reads.

## Touch targets

Under a coarse pointer, compact controls reach 44px.

- The `Button` sizes `sm`, `pill`, `xs`, `chip`, and `quiet` carry `[@media(pointer:coarse)]:min-h-11`.
- `src/components/ui/touchTargets.ts` exports the other recipes. `TOUCH_ICON` sizes a standalone icon-only control, and `TOUCH_PILL` sets a height-only floor.
- `TOUCH_HALO` grows a centered `::before` hit area to 44px while the rendered box keeps its desktop geometry. `ExpandButton`, `ExpandIndicator` hosts, and controls nested in a chip or a prose row use it.
- `TOUCH_HALO_Y` grows only the height. Controls that sit side by side, such as citation backlink numerals, use it, and the row supplies coarse-pointer spacing so neighboring halos do not overlap.

The `sm` size of `Input`, `Textarea`, `EditorSelect`, and the Select trigger renders `text-[16px] md:text-sm`, so iOS does not zoom on focus.

## Disclosure

`ExpandButton` and `ExpandIndicator` (`src/components/common/ExpandButton.tsx`) draw the doubled ellipsis and chevron. The doubled cue reads as "there is more here" to an intoxicated reader where a lone chevron may not. `ExpandIndicator` goes inside a row or card header that is already a button. Selects, dropdown menus, mobile menus, and navigation disclosures keep their own chevron.

| `ExpandButton` variant | Use |
| --- | --- |
| `inline` | Icon only, with no container. Inside chips, badges, inline prose, and compact value rows. Legality country rows and the History and Culture preview pair it with `theme-text-muted`. |
| `chip` | The whole chip is the control, with its label and the indicator in one capsule |
| `count` | Hidden-list counts such as `+3`: aliases, report lists, references, reagent rows |
| `floating` | A standalone section reveal that needs its own weight |
| `card` | A contained reveal inside a larger card |

## Name chips and pills

`PublicNameChip` renders names of public entities and concepts: subjective effects, interaction substances and compound groups, classifications, index categories, source pages, and contributors. It renders as a link, button, or span. When the chip itself expands content, it renders as a button with `ExpandIndicator` inside. When a linked name has a separate expansion, the chip holds the link and an `inline` `ExpandButton`. Source-attribution pills such as TripSit and PROtestkit use `theme-external-source-pill`, which shares the name-chip surface tokens. `Badge` carries status and severity, `PublicChipNav` carries navigation and filter chips, and `PublicPill` carries metadata.

## Index panels

`IndexPanelGrid` and `IndexPanelMasonry` lay out substance, effect, category, and article panels. Both prefer 320px columns, shrink only when the container is narrower, and use 20px gaps below `lg` and 24px at `lg`. Responsive grouped grids pass the `ref`, `count`, and `gate` from `useResponsiveColumnCount`, so column counts follow the content box instead of the viewport. `resolveEffectCategoryIcon` in `src/features/effects/pages/effectsIndexConfig.ts` resolves effect category titles, slugs, and labels to icons.

## Menus and focus

`DropdownMenu`, `Select`, and `Command` rows use `.theme-menu-row`, and group headings use `.theme-menu-label`. `focusRingClassName` and `theme-focus-ring` draw a 1px neutral keyboard-focus cue. `theme-field-focus` emphasizes a text field's or select's existing border without an outside ring.

## Accent utilities

Accent color resolves through theme tokens, so the appearance cog's hue slider repaints every accented pixel.

| Element | Utility |
| --- | --- |
| Section headings | `.theme-accent-heading` or `text-[var(--theme-section-heading)]` |
| Accented `<strong>` | `.theme-accent-emphasis`, or `.theme-accent-emphasis-scope` on a container |
| Accent icons | `.theme-icon-accent`, or `text-dose-accent-strong` where a Tailwind variant such as `hover:` is needed |
| Link underlines | `.theme-accent-underline` |
| Rings, gradients, color mixes | `--theme-*` tokens, the `dose-*` Tailwind aliases, or `rgb(var(--c-*))` channel seeds |

## Dividers

- `theme-horizontal-divider` separates article content, expanded detail blocks, menu groups, and rich text. It draws `--theme-horizontal-divider-image`. `theme-gradient-divider` is an older name for the same image.
- `theme-section-group-divider` marks major article group transitions, such as subjective-effect families. It owns its top spacing and hides itself on the first group.
- `theme-horizontal-divider-block` draws matching top and bottom rules.
- Plain token borders and `divide-y` separate table rows, dense lists, and card internals.

## CSS placement

A `.theme-*` class that one feature uses lives in that feature's sheet inside `@layer utilities`, for example `src/features/dev/dev-tools.css` or `src/app/china/china.css`. A class that two features or the shared tiers use lives in `src/styles/utilities-theme.css`. Values that differ between dark and light are `--theme-*` tokens with a value per scheme in `src/styles/site-colors.css`.

## Add a story

Each runtime export from `ui/`, `common/`, `layout/`, and `src/features/dev/components/index.ts` has a catalog story.

1. Export the component from its tier's barrel.
2. Add or update a story in `src/app/dev/kit/stories/`. Use the `StoryDef` contract in `src/app/dev/kit/registry/types.ts`, list every runtime symbol in `exports`, and show each one in an example.
3. Register the story in `src/app/dev/kit/registry/index.ts`.
4. Open `/dev/kit` and confirm that the story renders.
