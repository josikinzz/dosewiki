# dose.wiki Visual Style Guide

_Visual language reference for dose.wiki. Use the [UI kit](ui-kit.md) and `/dev/kit` as the catalog and implementation how-to; its [Ownership](ui-kit.md#ownership) section owns component boundaries._

## 1. Design Principles
- **Data-first clarity**: Every surface should foreground structured measurements, timelines, or definitions. Use typography and spacing to keep complex datasets scannable.
- **Mirrored theme system ("reverso")**: Every shared color has a dark value on `:root` and a light value on `html[data-theme="light"]`, defined side by side in `src/styles/site-colors.css`. New UI consumes these `--theme-*` variables directly, through `theme-*` utilities, or through the `dose-*` Tailwind aliases generated from `src/theme/theme-token-interface.json`.
- **Independent surfaces**: The Surfaces control selects canvas and component materials. Orchid is the default Fun surface. Pro uses restrained material tints.
- **Independent accents**: The Accent control selects brand and interactive emphasis. Default uses fuchsia in Fun and muted plum in Pro.
- **Semantic color**: Success, information, caution, unsafe, and danger colors do not follow the Accent control. This separation preserves their meanings.
- **One lighting model**: Light comes from the upper left. Frosted surfaces place their radial highlight at `circle at 12% 0%`, use 14px backdrop blur, and take inset top highlights from the `--theme-frosted-*` recipes.
- **Measured motion**: Reuse the kit's motion patterns, including `theme-section-card-enter` through `SectionCard`. Add shared motion only when the existing patterns cannot express the state change, and keep reduced-motion behavior intact.

> **Legacy utilities note**: Existing markup still contains raw `white/*` and `fuchsia-*` utilities supported by remaps in `src/styles/theme-light-mode.css`. Treat those classes as migration sites. New shared and public UI starts with theme tokens and UI Kit components.

## 2. Color System

The base colors live in `src/styles/site-colors.css`.
The compiled surface and accent layers live in `src/styles/*-tokens.generated.css`.
Run `npm run generate:appearance-css` after a palette source changes.
`src/theme/theme-token-interface.json` exposes the supported `dose-*` Tailwind aliases.
Use these sources instead of resolved color values in component markup.

Surface and Accent are independent appearance axes. Surface owns the canvas,
panels, fields, borders, and material depth. Accent owns brand and interactive
emphasis. Both axes work in Fun and Pro. Semantic evidence, success, caution,
danger, and interaction colors do not change when a reader changes the Accent.

| Role | Preferred interface | Typical use |
| --- | --- | --- |
| Page canvas | `--theme-body-bg`, `--theme-page-start|mid|end` | Body backdrop and page gradient |
| Chrome rails | `--theme-frosted-control-on-panel-*`, `--theme-chrome-*` | Header, footer, mobile navigation |
| Selected controls | `--theme-selected-control-*` | Active routes, tabs, and exclusive choices |
| Inline references | `--theme-inline-reference-*` | Citation markers and linked reference numbers |
| Passive information | `--theme-article-neutral-panel-*` | Reagent rows, TOC, duration rows, data chips |
| Panels | `--theme-surface-*`, `--theme-frosted-panel-*`, `bg-dose-surface*` | Cards and primary surfaces |
| Compact controls | `--theme-frosted-control-*`, `--theme-frosted-control-on-panel-*` | Pills, chips, badges, nested controls |
| Accent and text | `--theme-accent-*`, `--theme-text-*`, matching `text-dose-*` aliases | Brand hierarchy, links, icons, and emphasis |
| Evidence and risk | `--theme-evidence-*`, `--theme-success-*`, `--theme-semantic-*`, `--theme-danger-*`, `--theme-warning-*` | Evidence, success, interaction severity, warnings |
| Fields | `--theme-field-*` | Inputs, search, editor controls |
| Borders and focus | `--theme-border-*`, `--theme-card-border*`, `--theme-ring-*` | Outlines, separators, focus treatment |

When a needed semantic role is missing, extend the token interface and both theme
definitions rather than introducing a raw color recipe.

## 3. Typography & Tone
- **Body typeface**: the readable sans stack exposed by `--font-family-body`.
- **Display typeface**: the active site face exposed by `--font-family-display` and `font-display`. The current dose.wiki module is `src/app/_fonts/dosewiki.ts`; follow `font-swap-howto.md` when changing it.
- **Hierarchy**: Use the type roles and sizes already demonstrated in `/dev/kit`. Page and section headings use accent/text tokens; body and metadata step down the `--theme-text-*` tiers.
- **Display scope**: Reserve `font-display` for the wordmark, hero moments, and top-level headings. Body copy, subsection titles, and dense data stay on the body stack.
- **Microcopy**: Short labels and metadata may use uppercase tracking when the shared component recipe does.
- **Monospace**: Code and structured editor surfaces use the editor-owned monospace treatment.
- **Links**: Reuse the link treatment owned by the surrounding shared or feature component. Preserve visible hover and focus states; long-form content keeps a visible text affordance.
- **Tone**: Concise, instructional copy that mirrors dataset language (e.g., “Dosage & Duration”, “Mechanism of action”).

## 4. Layout & Spacing
- **Start with the kit**: Choose the closest shell, `Surface` variant, public layout primitive, or common recipe in `/dev/kit` before adding layout classes.
- **Page rhythm**: Follow the existing page shell's container width and gutters. Group related content tightly and separate sections more generously.
- **Responsive layout**: Use grid, flex, or columns according to content order and reading behavior. Preserve logical DOM order and confirm the layout at narrow and wide viewports.
- **Geometry**: Reuse component radius and spacing variants rather than copying one route's class string.
- **Frosted material**: Use the `--theme-frosted-panel-*` family or the shared surface utility/component that consumes it. Compact controls use `--theme-frosted-control-*`; nested controls use `--theme-frosted-control-on-panel-*`.
- **Lighting**: Frosted surfaces share the upper-left highlight at `circle at 12% 0%`, 14px backdrop blur where blur is appropriate, and tokenized inset highlights. Both themes keep the same material structure while color values change.
- **Light theme hierarchy**: Titles use dark aubergine text through `--theme-accent-strong` or `--theme-text-primary`; body and metadata step down the text tokens. Keep text tinted toward the brand hue on pink and lilac surfaces.

## 5. Core Surfaces
- Use the primitives in `src/components/ui/`, the recipes in `src/components/common/`, and the page compositions in `src/components/layout/`.
- `Surface` and its exported recipes own shared card and panel shells. `SectionCard` composes `InteractiveContentCard` for public section content.
- Use `StateCard` and the cataloged status/safety surfaces for empty, loading, warning, and error states. Harm-reduction messages keep their semantic tone and prominence.
- Protected editor surfaces belong under `src/features/dev/components/`; they may be denser than public content but still consume shared tokens.
- Browse `/dev/kit` for current variants, imports, and examples instead of copying class strings from an existing route.

## 6. Navigation & Global Shell
- **Header and footer**: Use the shared layout components and their theme utilities. In dark mode they frame content with the darker chrome-rail tone; light mode uses the saturated chrome tokens.
- **Primary navigation**: Keep it focused on reader-facing destinations. Dev Tools is a protected utility surface, not a primary navigation item; reach it through its dedicated authenticated entry points.
- **Mobile navigation**: Preserve the same information architecture and accessible labels as desktop navigation. Use the shared responsive navigation component rather than a separate style recipe.
- **Active and focus states**: Let the shared navigation components own their tokenized emphasis, keyboard behavior, and touch targets.

## 7. Buttons, Badges & Chips
- Use `Button`, `Badge`, `IconBadge`, `PublicNameChip`, `PublicPill`, `PublicChipNav`, `PublicSegmentedTabs`, and `ExpandButton` from the shared kit according to their catalog guidance.
- Keep one dominant accent action per view when the hierarchy calls for it; secondary actions use the quieter variants already in the kit.
- Use `PublicSegmentedTabs` for mutually exclusive public views. Its selected
  state uses the current Accent on the current Surface; it must not assume a
  fixed violet treatment.
- Use `PublicNameChip` for public entity names, `Badge` for status or severity, and `ExpandButton` for content reveal. The ownership details live in the [UI kit ownership section](ui-kit.md#ownership).
- Extend a primitive with a route-neutral variant only when the catalog and ownership criteria support it. Feature-specific recipes stay with the feature.

## 8. Forms & Inputs
- Start with the cataloged `Input`, `Textarea`, `Select`, and `Label` primitives. Public forms use shared primitives; protected editor workflows may compose the editor primitives in `src/features/dev/components/`.
- Fields consume `--theme-field-*` tokens through their owning component. Keep label, help, validation, disabled, and focus states together.
- Preserve native semantics, visible labels, error association, keyboard operation, and comfortable touch targets.
- Build responsive field groups around reading order. A narrow viewport must not hide or reorder required information.

## 9. Data Displays
- **Dosage and duration**: Use the article-owned tier and route components. Preserve the semantic tier ramp and projected data; do not reproduce their styling inline.
- **Interactions and warnings**: Use the semantic safety tokens and shared safety surfaces. Severity and harm-reduction meaning outrank decorative consistency.
- **Search**: Use the search result and metadata primitives demonstrated in the kit; the dark results surface uses the chrome-rail tone.
- **Tier tints**: The current dose/plateau definitions live in `src/styles/utilities-theme.css` and `src/styles/theme-light-mode.css`. Change both themes together.
- **Index lists**: Homogeneous link collections prefer open, separated rows; use the shared divider and hover tokens rather than per-row slab cards.
- **Long-form notes**: Keep semantic lists and links intact. Avoid an extra card when the parent section already supplies the surface.

## 10. JSON & Structured Editors
- `src/features/dev/components/JsonEditor.tsx` owns the protected JSON editor presentation and behavior.
- Reuse that component for editor workflows rather than copying its code, token colors, sizing, or dependency setup.
- Changelog and diff utilities remain with their data/editor owners as documented in the [UI kit ownership section](ui-kit.md#dependency-ownership).

## 11. Interaction States & Accessibility
- **Keyboard focus**: Use the shared 1px neutral `:focus-visible` cue, not a thick accent outline. Text fields and selects emphasize their existing border with `theme-field-focus`; ordinary pointer clicks do not add an outside focus ring. This contract applies to Vivid, Pro, light, dark, and custom color variations. Keep system high-contrast focus indicators and semantic validation borders.
- **Hover and active states**: Keep state changes restrained and do not rely on color alone.
- **Reduced motion**: Preserve the reduced-motion behavior of shared animation utilities and avoid making motion necessary to understand a state change.
- **Pointer and touch**: Links and buttons need correct semantics, a visible state change, and adequate target size.
- **Contrast**: Check text, icons, controls, and safety states in both themes. Use the text and semantic token tiers rather than estimating contrast from opacity utilities.

## 12. Iconography & Imagery
- **Shared icons**: Render Iconify and local custom icons through `Icon` from `src/components/common/Icon`. Use `IconBadge` when the cataloged badge treatment matches the information hierarchy.
- **Category icons**: Resolve category keys through `src/data/config/categoryIcons.ts`; see `category-tag-icons.md` for the update and smoke-check workflow.
- **Imagery**: Keep molecule and replication media legible, attributed where required, and subordinate to safety-critical text.

## 13. Motion & Feedback
- **Entry animations**: `SectionCard` uses the reduced-motion-safe `theme-section-card-enter` utility and a tokenized delay. Reuse it instead of adding page-local entrance choreography.
- **Tab selection**: At desktop widths (768px and above), public route pills use a canvas-colored circle behind the selected icon. The circle scales from 0.55 to 1 over 240ms and fades over 160ms; the glyph stays fixed. Mobile index tiles retain a filled, rounded-square app-icon treatment without a circular cutout. Keep this in the shared CSS state hooks, without timers or animation dependencies. Reduced motion disables the transition.
- **Tab panels**: Substance and effect index panels and ROA content use `theme-tab-panel-enter`, a 240ms fade with a 4px upward settle based on the shared section entrance. Key the content boundary by the selected view, not the tab controls. Do not delay new content behind an exit animation or retain `will-change` after entry. Reduced motion shows the content immediately.
- **Small reveals and overlays**: Use `theme-reveal-enter` for a 180ms, 2px content entrance and `theme-overlay-enter` for a 180ms, 4px anchored panel entrance. Fade-only feedback uses `theme-feedback-enter` at 160ms. Keep glyphs stationary; disclosure indicators transition between ellipsis and chevron without moving the control.
- **Retained state**: Keep drafts, expanded detail rows, media players, and settled results intact through presentation changes. Hidden retained content must be inaccessible immediately. Reveal only newly appended rows, not the existing collection; never delay safety labels, focus, seeking, or new results behind exit choreography.
- **Navigation destinations**: Citation and report-phase targets use `theme-navigation-target` for a brief neutral background emphasis without an outline or layout movement. Preserve native anchors and legality's `hidden="until-found"` behavior.
- **Media and touch**: Poster handoffs wait for a usable video frame. Rails retain native scrolling, and thumbnail selection uses border and opacity rather than scaling. Touch capability does not disable transitions; `prefers-reduced-motion` does.
- **State feedback**: Use the shared status, notice, and safety components. Feedback must be announced accessibly and remain understandable without animation.

## 14. Content Alignment with Articles
Match article surfaces by reusing their shared section, metadata, chip, divider,
and safety primitives. Project article data into those components; keep schema
interpretation and harm-reduction policy with the article feature.

## 15. Implementation Checklist
1. Browse `/dev/kit` and choose the nearest shared component or recipe.
2. Use `src/styles/site-colors.css` and `src/theme/theme-token-interface.json` for every new color role.
3. Follow the [UI kit ownership section](ui-kit.md#ownership) when the work may cross a component ownership boundary.
4. Preserve semantic structure, keyboard access, visible focus, reduced-motion behavior, and harm-reduction priority.
5. Exercise the changed view at narrow and wide widths in both dark and light themes.
6. For a shared catalog change, run the focused Vitest checks documented in the [UI kit](ui-kit.md#adding-or-changing-a-shared-component). Before release, `npm run verify:app` runs the full verification sequence; the catalog checks themselves are not build-time checks.
