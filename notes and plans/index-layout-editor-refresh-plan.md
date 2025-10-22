# Index Layout Editor Simplification Plan

## Context
- Surface: `src/components/sections/dev-tools/index-layout/IndexLayoutTab.tsx` within the Dev Tools.
- Goal: Make the editor resemble the public psychoactive index layout, improve visual clarity, and remove redundant inputs/chip clutter.
- Reference styling: `notes and plans/dosewiki-visual-style-guide.md` and `src/components/sections/CategoryGrid.tsx` (public index presentation).

## Current Pain Points
- Category cards expose `label`, `key`, and `iconKey` as equal-weight inputs; because labels and keys often match, users see duplicate titles with no context.
- Section editors mirror this issue (adjacent `label` + `key` fields) and scatter controls, making the layout feel repetitive and noisy.
- Primary substance lists render as pill badges, forcing wide horizontal scroll and hiding the relationship to the live index layout.
- Buttons depend on mixed icon + text labels; the request is to use Lucide icons only while keeping actions discoverable.
- Overall layout is form-first rather than preview-first, so it diverges from the compact multi-column presentation of the live index grid.

## Implementation Goals
- Present each category/section with a single prominent title, mirroring the live index hierarchy.
- Convert substance collections to stacked lists (name, optional alias, status flags) instead of pills.
- Use icon-only controls for CRUD/reorder actions, with accessible tooltips or `aria-label` support.
- Maintain responsive columns (1 → 2 → 3) while reducing vertical padding and collapsing redundant inputs.
- Preserve existing data editing capabilities (ordering, notes, link targets), possibly via collapsible "details" drawers so advanced metadata stays available without cluttering the primary view.

## Proposed Workstream
1. **Audit Shared Styles**: Extract the card shell, typography, and spacing tokens from `CategoryGrid` (live index) into reusable helpers or Tailwind class constants used by both surfaces.
2. **Category Card Redesign**:
   - Render the category label as a heading with subtext for total count.
   - Move `key`, `iconKey`, and notes into a collapsible detail panel triggered by an info/edit icon.
   - Position category-level actions (reorder, delete, add section) as icon-only buttons in the header bar.
3. **Section Panel Refresh**:
   - Display the section label once; surface `key`, link select, and notes inside an expandable drawer.
   - Align sections vertically with subtle dividers, matching the live index grouping hierarchy.
4. **Substance List Overhaul**:
   - Replace `SlugChip` with a vertical list component that shows `name`, alias, and issue badges (missing/hidden/duplicate) inline.
   - Provide remove/reorder icons per row; keep the add control as a compact input + icon button, and convert the “Browse” picker to an icon-triggered sheet/popover.
5. **Control System Updates**:
   - Swap button labels (“Save layout”, “Add section”, etc.) for Lucide icons wrapped in pill buttons; include `aria-label` text or visually hidden spans to preserve accessibility.
   - Introduce tooltips or microcopy where necessary so users can decipher icon intent.
6. **Responsive Columns**:
   - Ensure the editor container uses the same 1/2/3 column breakpoints as the public index (likely CSS columns or a responsive grid with masonry-safe classes).
7. **State Handling & Memoization**:
   - Adjust the existing memoized `CategoryEditor`/`SectionEditor` components to accommodate the new JSX structure without regressing performance optimizations added previously.
8. **Styling Consistency**:
   - Validate colors, borders, and spacing against the visual style guide (dark glass cards, fuchsia highlights, uppercase microcopy).
9. **QA & Regression Checks**:
   - Verify drag/reorder flows, JSON sync (show/hide editor), save/reset actions, and slug validation chips still function after the markup changes.

## Validation Steps
- Manual walkthrough of Dev Tools Index Layout tab across viewport sizes (min-width < 768px, mid, >= 1440px).
- Run `npm run build` and `npm run build:inline` to satisfy repo policy once implementation is complete.

## Follow-Ups / Stretch Ideas
- Consider virtualizing or filtering the Browse list if performance remains sluggish with ~600 entries.
- Capture before/after screenshots for the Dev Tools changelog and update `AGENTS.md` with design guidelines post-implementation.
