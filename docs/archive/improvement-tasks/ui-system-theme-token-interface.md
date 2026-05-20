# UI System: Deepen Theme Token Interface

## Files

- `tailwind.config.js`
- `src/styles.css`
- `src/styles/base.css`
- `src/styles/components.css`
- `src/styles/theme-overrides.css`
- `src/styles/theme-status.css`
- `src/styles/theme-light-mode.css`
- `src/styles/utilities-theme.css`
- `src/styles/utilities-typography.css`
- `src/app/layout.tsx`
- `src/app/fonts.ts`
- `src/app/_components/ThemeToggle.tsx`
- Shared UI callers in `src/components/common`, `src/components/layout`, and `src/components/ui`

## Problem

The theme system has a large CSS variable surface in `base.css`, additional theme layers imported through `theme-overrides.css`, Tailwind theme extension in `tailwind.config.js`, a font Module in `src/app/fonts.ts`, and a hard-coded theme bootstrap script in `src/app/layout.tsx`. Shared UI callers mix semantic classes like `theme-text-secondary`, raw CSS variables like `var(--theme-card-border)`, Tailwind color utilities like `text-fuchsia-300`, and ad hoc translucent values like `bg-white/[0.045]`.

That makes the theme Interface broad and leaky. Every caller can reach into the Implementation at a different level, so changing color contrast, radius, typography tracking, or light-mode behavior requires understanding CSS variables, Tailwind tokens, imported style layer order, and component class strings. The current Seam between design tokens and UI Modules is unclear because tokens, utility classes, and component recipes are all valid public entry points.

There is also a specific risk around typography: `base.css` defines negative letter-spacing variables, while UI guidance for this codebase prefers no negative letter spacing. Without a deeper token Interface, this kind of policy is hard to enforce locally.

## Proposed deepening opportunity

Create a theme token Module that defines the supported Interface for shared UI styling. The Interface should separate:

- raw theme tokens, such as text, surface, border, status, focus, spacing, radius, and typography values
- semantic utility classes, such as text roles, surfaces, focus rings, and overlays
- Tailwind extension aliases that point at the same token names
- runtime theme bootstrap values used by `layout.tsx` and `ThemeToggle`

Move hard-coded theme constants such as theme-color meta values and storage key policy behind this Module or an adjacent Adapter. Document which layer is public for component callers and which layer is Implementation-only. Prefer named semantic utilities or primitive variants over direct `text-fuchsia-*`, `bg-white/[...]`, and raw `var(--theme-*)` usage in shared UI Modules.

## Benefits

- **Module**: Gives the visual theme one named Module instead of a loose collection of CSS files, Tailwind extensions, and layout script constants.
- **Interface**: Narrows what UI callers are expected to use: semantic tokens/utilities rather than arbitrary variables and color literals.
- **Implementation**: Keeps dark/light values, theme bootstrap details, and Tailwind mapping behind the token Interface.
- **Depth**: Increases Depth because simple semantic names carry contrast, theme, status, and typography rules.
- **Seam**: Establishes a clear Seam between shared UI Modules and the theme Implementation.
- **Adapter**: Lets Tailwind config, CSS utilities, and runtime bootstrap act as Adapters over the same token source.
- **Leverage**: Contrast, light-mode, focus-ring, and typography policy changes can propagate through one token Interface.
- **Locality**: Reduces scattered style edits and makes future theme audits easier to perform.

## Test plan

- Add a lightweight token audit script or test that flags shared UI usage of raw `text-fuchsia-*`, `bg-white/[...]`, direct `var(--theme-*)`, and negative letter-spacing outside approved token files.
- Add theme smoke tests for `data-theme="dark"` and `data-theme="light"` verifying representative text, surface, border, and focus token values.
- Add component visual tests for Header, Footer, Button, Card/Surface, PageHeader, and StateCard in both themes.
- Run `npm run lint`, `npm run typecheck`, and any existing UI tests after token migration.

## Risk/rollout notes

Do not attempt a full visual redesign while introducing the token Interface. First name the public token layers and add an audit in warn-only mode. Then migrate shared UI Modules to semantic tokens, followed by feature surfaces. Keep raw token escape hatches available for one-off content visuals until they can be evaluated individually.
