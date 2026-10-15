# Visual style guide

This page lists the visual tokens dose.wiki uses and where each one lives. The [UI kit](ui-kit.md) covers the components that consume them, and `/dev/kit` renders both.

## Color

`src/styles/site-colors.css` holds every shared color. Each `--theme-*` variable has a dark value on `:root` and a light value on `html[data-theme="light"]`, side by side. `src/styles/*-tokens.generated.css` holds the compiled surface and accent layers, and `bun run generate:appearance-css` rebuilds them after a palette source changes. `src/theme/theme-token-interface.json` lists the `dose-*` Tailwind aliases.

Surface and Accent are independent appearance axes, and both work in Vivid and Clinical. Surface owns the canvas, panels, fields, borders, and material depth. Unsaved, every combination rests on neutral surfaces, and Clinical uses restrained material tints. Accent owns brand and interactive emphasis. Each visual style and color scheme pair has its own resting accent in `DEFAULT_APPEARANCE_COLORS` (`src/theme/appearanceChroma.ts`): Vivid dark rests on orchid, and Vivid light and Clinical rest on teal. Accented elements read `--theme-accent*`, so they follow whichever accent is live. Success, information, caution, unsafe, danger, evidence, and interaction colors do not follow the Accent control.

| Role | Tokens | Typical use |
| --- | --- | --- |
| Page canvas | `--theme-body-bg`, `--theme-page-start`, `--theme-page-mid`, `--theme-page-end` | Body backdrop and page gradient |
| Chrome rails | `--theme-frosted-control-on-panel-*`, `--theme-chrome-*` | Header, footer, mobile navigation |
| Selected controls | `--theme-selected-control-*` | Active routes, tabs, exclusive choices |
| Inline references | `--theme-inline-reference-*` | Citation markers and linked reference numbers |
| Passive information | `--theme-article-neutral-panel-*` | Reagent rows, table of contents, duration rows, data chips |
| Panels | `--theme-surface-*`, `--theme-frosted-panel-*`, `bg-dose-surface*` | Cards and primary surfaces |
| Compact controls | `--theme-frosted-control-*`, `--theme-frosted-control-on-panel-*` | Pills, chips, badges, nested controls |
| Accent and text | `--theme-accent-*`, `--theme-text-*`, matching `text-dose-*` aliases | Brand hierarchy, links, icons, emphasis |
| Evidence and risk | `--theme-evidence-*`, `--theme-success-*`, `--theme-semantic-*`, `--theme-danger-*`, `--theme-warning-*` | Evidence, success, interaction severity, warnings |
| Fields | `--theme-field-*` | Inputs, search, editor controls |
| Borders and focus | `--theme-border-*`, `--theme-card-border*`, `--theme-ring-*` | Outlines, separators, focus |

Raw `black/*` utilities appear only in media scrims over imagery. The dose and plateau tier tints live in `src/styles/utilities-theme.css` and read per-scheme tokens from `src/styles/site-colors.css`.

## Type

- `--font-family-body` is the readable sans stack for body copy, subsection titles, and dense data.
- `--font-family-display` and the `font-display` utility carry the site face for the wordmark, hero moments, and top-level headings. `src/app/_fonts/dosewiki.ts` is the dose.wiki face. [Font swap](font-swap-howto.md) explains how to change it.
- Uppercase microcopy has two recipes in `src/styles/utilities-typography.css`, both tracked at `--type-tracking-label` (0.16em): `type-meta-label` (12px) for standalone labels and group headings, and `type-chip-label` (11px) for text inside chips, pills, and badges.
- `--text-*` and `--type-size-*` follow the reader's Text size setting. A literal size such as `text-[13px]` does not scale. The 16px field text that stops iOS zooming is the one literal size.

## Geometry

Corners are role tokens in `src/styles/base.css`, and `src/styles/pro-theme.css` sets the Clinical values.

| Role | Used by | Vivid | Clinical |
| --- | --- | --- | --- |
| `rounded-chip` | Name chips, small tags | 4px | 3px |
| `rounded-control` | Buttons, fields, tabs, menu items | 5px | 4px |
| `rounded-card` | Cards, dialogs, popovers | 6px | 4px |
| `rounded-panel` | State and hero panels | 12px | 6px |
| `rounded-pill` | Capsules | 9999px | 9999px |

The roles nest in order, chip, control, card, panel, so an inner corner is never rounder than its container.

Controls that sit side by side share one height ladder:

| Height | Controls |
| --- | --- |
| 20px | Small pill |
| 24px | Badge, metadata pill |
| 28px | Chip, name chip (`Button` `chip` and `xs`) |
| 32px | Compact button, pill, quiet, toggle `sm`, tab trigger |
| 36px | Menu row (`.theme-menu-row`) |
| 40px | `Button` default and `icon`, `Input` and `Select` `sm` |
| 44px | `Button` `lg`, default field, coarse-pointer floor |
| 48px | Large field |

Chips and pills pin their height with `h-*`, so a ring or border does not change it.

## Light and material

Light comes from the upper left. Frosted surfaces place their radial highlight at `circle at 12% 0%`, blur with `--frost-blur` (14px), and take inset top highlights from the `--theme-frosted-*` recipes. Gradients run top-left to bottom-right (`135deg`, `to-br`). Drop shadows cast straight down with no x offset. Floating panels (Popover, DropdownMenu, Select, Dialog, Command) share `rounded-card` and `--theme-elevation-overlay`. Dialogs dim the page with `.theme-scrim`.

`src/styles/base.css` sets `accent-color`, the caret, `::selection`, `::placeholder` (faint tier at full opacity), and scrollbars from the palette.

## Motion

`src/styles/base.css` defines three durations and two curves.

| Token | Value | Used for |
| --- | --- | --- |
| `--motion-fast` | 180ms | Color, border, and opacity. A bare `transition` utility uses it. |
| `--motion-base` | 240ms | Transform, shadow, and surface lifts |
| `--motion-slow` | 420ms | Section entrances |
| `--ease-out` | `cubic-bezier(0.25, 1, 0.5, 1)` | Every transition |
| `--ease-loop` | `cubic-bezier(0.45, 0, 0.55, 1)` | Infinite loops |

The entrance utilities live in `src/styles/utilities-theme.css`, and each one respects `prefers-reduced-motion`.

| Utility | Behavior |
| --- | --- |
| `theme-section-card-enter` | `SectionCard` entrance over `--motion-slow` with a tokenized delay |
| `theme-tab-panel-enter` | Index panel and route-of-administration content, a 240ms fade with a 4px upward settle |
| `theme-reveal-enter` | A 180ms, 2px content entrance |
| `theme-overlay-enter` | A 180ms, 4px anchored panel entrance |
| `theme-feedback-enter` | A fade over `--motion-fast` |
| `theme-navigation-target` | A brief neutral background emphasis on citation and report-phase anchor targets |

Menu highlights are instant so they keep pace with arrow keys. `Button` settles 1px on press, and reduced motion keeps it still. At 768px and above, public route pills draw a canvas-colored circle behind the selected icon that scales from 0.55 to 1 over `--motion-base` while the glyph stays fixed.

## Icons

`Icon` from `src/components/common/Icon.tsx` renders Iconify names such as `lucide:search` and local `custom:` icons. `src/data/config/categoryIcons.ts` resolves category keys, and [category tag icons](category-tag-icons.md) explains how to change one.
