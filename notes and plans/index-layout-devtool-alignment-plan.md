# Index Layout Dev Tool Visual Alignment Plan

_Align the Dev Tools index layout editor with the public psychoactive index aesthetics while preserving full editing capability._

## 1. Comparative Audit
- **Layout structure**
  - Public index (`CategoryGrid`) uses CSS masonry columns (`columns-*`, `break-inside-avoid`) producing variable-height cards without gaps.
  - Dev tool currently renders each category inside a fixed-height card within a responsive `grid`, causing uneven whitespace when sections differ in length.
- **Category presentation**
  - Public index: translucent card shell with icon badge, title stack, microcopy for counts, and section dividers as thin gradient lines.
  - Dev tool: large padded shells, icon rendered only as text token, metadata hidden behind drawers, and sections wrapped in nested cards instead of inline separators.
- **Section layout**
  - Public index shows section title (uppercase) followed by plain bullet-like lists; dividers between sections use gradient rules.
  - Dev tool wraps each section in its own bordered card with icon-only control strip; lists are indented but lack the lightweight feel.
- **Controls vs readability**
  - Public index is read-only, so no action buttons; typography leads with labels and counts.
  - Dev tool adds edit controls (reorder, delete, add, toggle details) which currently sit prominently in the header bar and can distract from scanning substance lists.
- **Spacing & rhythm**
  - Public index surfaces tight vertical rhythm (`mt-4`, `space-y-[30px]`) and microcopy uppercase labels.
  - Dev tool uses looser spacing, larger paddings, and multiple nested borders which break the lightweight feel.

## 2. Alignment Goals
1. **Adopt masonry columns** so category editors flow like the index (1/2/3 columns) without shared height constraints.
2. **Flatten category hierarchy** to a single translucent shell with inline sections separated by gradient dividers instead of nested cards.
3. **Surface icons** via `IconBadge` in the left gutter to mirror the public index while keeping edit shortcuts nearby.
4. **Tone typography & microcopy** to match `CategoryGrid`: fuchsia headings, uppercase metadata, and reduced padding.
5. **Tuck controls** into subtle icon rows (e.g., top-right overlay) or reveal-on-hover toolbars so editing affordances remain but visual noise stays low.
6. **Maintain functionality**: details drawers for metadata, reorder/add/remove actions, slug validation badges, JSON toggle, etc.

## 3. Implementation Approach
1. **Refactor container**
   - Replace the outer `grid` with a masonry layout (`columns-1 sm:columns-2 xl:columns-3`, `space-y-6`, `break-inside-avoid`) mirroring `CategoryGrid`.
   - Wrap each category editor in a `div` that `break-inside-avoid` and remove fixed min-heights.
2. **Category shell redesign**
   - Use `bg-white/5`, `border-white/10`, `rounded-2xl`, `shadow-[0_10px_30px_-12px_rgba(0,0,0,0.35)]`.
   - Left column: `IconBadge` showing the configured icon; fallback placeholder if icon missing.
   - Right column: title stack + microcopy. Place add/reorder/delete icons as a compact floating toolbar (top-right) with sr-only labels.
   - Replace drawer button text with an icon (already present) but adjust styling to secondary pill.
3. **Section presentation**
   - Render sections inline with a `div` similar to `CategoryGrid` section blocks.
   - Use gradient divider (`before:` pseudo-element) between sections; keep uppercase section headers.
   - Embed the section edit controls adjacent to the header (e.g., row of icon buttons aligning right on the same baseline) to maintain functionality without separate cards.
   - Keep section metadata drawer but reposition to overlay/accordion inside the section block.
4. **Substance lists**
   - Maintain vertical list style; adjust list item background to subtle `bg-white/8` with slight border radius to echo index list rows.
   - If reorder support is desired in future, reserve space for drag handles (not currently implemented) but focus on remove & status badges.
5. **Details drawer styling**
   - Restyle expanded metadata blocks to use `bg-white/3`, `border-white/8`, slimmer padding so they feel like inline notes rather than separate cards.
   - Consider icon indicator (e.g., `Info` outline) when metadata exists to hint at additional details.
6. **Toolbar adjustments**
   - Keep top-level actions (Save/Reset/Restore/JSON) as icon pills but align them right and add subtle labels (tooltip or sr-only) to maintain discoverability.
7. **Responsive considerations**
   - Ensure columns collapse gracefully to a single column on narrow widths with preserved spacing.
   - Verify icon-only buttons remain accessible via keyboard and have descriptive `aria-label`s.

## 4. Work Breakdown
1. **Container & masonry conversion** – adjust layout structure and card wrapper classes.
2. **Category header rebuild** – integrate `IconBadge`, reorganize heading & toolbar, fine-tune typography.
3. **Section inline layout** – refactor sections to inline blocks with gradient dividers and repositioned controls.
4. **Metadata drawer refinement** – restyle details accordions for both category and section contexts.
5. **List styling polish** – align list item colors, spacing, and badge styling with the public index.
6. **Accessibility & focus states** – confirm focus rings, sr-only texts, and keyboard nav remain intact.
7. **Regression pass** – manual QA for add/remove/reorder actions, JSON sync, multi-column flow, and slug validation hints.

## 5. Validation & Follow-up
- Screenshots comparing Dev Tools vs public index post-refresh.
- Manual QA across breakpoints (<640px, ~1024px, ≥1440px).
- Consider future enhancements: optional drag handles, persistent tooltips, virtualization for browse list if performance needs.

