# UI System: Deepen Surface Primitives

## Files

- `src/components/common/SectionCard.tsx`
- `src/components/common/StateCard.tsx`
- `src/components/common/IndexCard.tsx`
- `src/components/layout/PageHeader.tsx`
- `src/components/ui/card.tsx`
- `src/components/ui/motion-card.tsx`
- `src/components/pages/MechanismDetailPage.tsx`
- `src/components/pages/SearchResultsPage.tsx`
- `src/components/pages/ClassificationDetailPage.tsx`
- `src/features/reports/components/ReportCard.tsx`
- `src/features/reports/components/ReportHeroSection.tsx`
- `src/features/effects/pages/EffectCategoryPage.tsx`
- `src/features/article/components/sections/HarmReductionBanner.tsx`

## Problem

The shared UI has several card and page-heading Modules, but many route and feature components still repeat surface decisions inline: rounded corners, border strength, translucent backgrounds, shadow recipes, hover elevation, empty states, section padding, and heading composition. `SectionCard`, `Card`, `StateCard`, `IndexCard`, `motion-card`, and ad hoc `rounded-2xl border ... bg-white/...` blocks overlap without a clear Interface that says which surface to use for article sections, index groups, status states, overlays, editor panes, or interactive list cards.

The result is a shallow set of Modules. Callers still need to know the Implementation details of the visual system: exact Tailwind strings, when to add `theme-public-card`, when to use `Card`, when to override `SectionCard`, and how to make an empty state or interactive surface match the rest of the app. This reduces Locality because surface polish or theme fixes require broad search-and-edit across page and feature Modules.

## Proposed deepening opportunity

Create a deeper surface primitive Module that exposes semantic surface Interfaces instead of raw styling recipes. Possible Interfaces:

- `PageShell` for shared max width, route padding, and main section spacing.
- `PageHero` or a deepened `PageHeader` for title, description, icon, optional actions, and density.
- `Surface` for non-interactive article/index/editor surfaces with variants such as `public`, `editor`, `subtle`, and `danger`.
- `InteractiveSurface` for card-like links/buttons with hover, focus, and selected states.
- `EmptyState` for reusable no-results and unavailable-content states.

The Implementation can keep Tailwind and theme classes internal. Existing Modules like `SectionCard`, `StateCard`, `IndexCard`, and `Card` can become Adapters over the semantic primitive during migration, or be folded into the deeper Module if their Interface is redundant.

## Benefits

- **Module**: Replaces several shallow visual Modules and inline recipes with a smaller set of semantic surface Modules.
- **Interface**: Callers choose intent and state rather than copying Tailwind Implementation details.
- **Implementation**: Concentrates border, shadow, radius, backdrop, spacing, animation delay, and tone rules in one place.
- **Depth**: Raises Depth because simple variant props hide a large visual contract.
- **Seam**: Creates a stable styling Seam between product UI Modules and the theme/Tailwind Implementation.
- **Adapter**: Allows old `SectionCard`, `Card`, and `StateCard` imports to serve as migration Adapters while feature code moves gradually.
- **Leverage**: Theme and polish changes apply across article sections, search results, reports, effect pages, and editor support surfaces.
- **Locality**: Reduces broad class-name churn when the visual system changes.

## Test plan

- Add visual/component tests for the new primitive variants, including default, interactive, selected, subtle, danger, and empty-state cases.
- Add smoke tests for high-traffic pages that use each migrated Adapter: search results, classification detail, mechanism detail, reports, and effect category.
- Run `npm run typecheck` to ensure old Adapter props remain compatible during migration.
- Use screenshot review for dark and light themes before removing old inline recipes.

## Risk/rollout notes

Migrate incrementally. First introduce the deep primitive and reimplement `SectionCard`, `Card`, and `StateCard` through it without changing callers. Then move repeated inline surfaces route by route. Avoid changing visual density and route layout at the same time as the Module extraction.
