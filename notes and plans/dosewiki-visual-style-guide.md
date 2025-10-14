# dose.wiki Visual Style Guide

_Comprehensive reference for maintaining visual consistency across dose.wiki surfaces. Derive new UI from these foundations before shipping._

## 1. Design Principles
- **Data-first clarity**: Every surface should foreground structured measurements, timelines, or definitions. Use typography and spacing to keep complex datasets scannable.
- **Dark cosmic canvas**: Maintain the deep-indigo backdrop (`#0f0a1f`) with translucent overlays (`bg-white/5` – `bg-white/10`) to keep content luminous without high contrast glare.
- **Fuchsia pulse accents**: Use fuchsia/violet gradients (`from-fuchsia-500/10 to-violet-500/10`) and `text-fuchsia-200/300` for emphasis, mirroring article hero treatments and the brand wordmark.
- **Tactile translucency**: Borders default to `border-white/10` and elevate to `border-fuchsia-400/30` or `ring-white/20` on hover. Shadows use long, soft blurs (e.g. `shadow-[0_10px_30px_-12px_rgba(0,0,0,0.35)]`).
- **Measured motion**: Rely on `cardAnimation` (fade + 14px rise, 0.4s ease) for SectionCard entrances. Avoid additional choreographed motion unless you extend `constants/motion.ts`.

## 2. Color System
| Token | Value / Tailwind | Typical Usage | Notes |
| --- | --- | --- | --- |
| **Background** | `#0f0a1f` (`bg-[#0f0a1f]`) | Body backdrop | Set in `src/styles.css` `body` rule.
| **Panel overlay** | `bg-white/5`, `bg-white/10` | Cards, Category tiles | Combine with `border-white/10` + subtle shadow.
| **Search panel** | `#120d27` (`bg-[#120d27]`) | Mobile nav, autocomplete popovers | Always pair with `border-white/10`.
| **Primary accent** | `text-fuchsia-200/300/400`, `bg-fuchsia-500/20` | Headlines, active nav, CTAs | Use `text-fuchsia-300` for h1/h2, `bg-fuchsia-500/20` for active pills.
| **Gradient accent** | `from-fuchsia-500/10 to-violet-500/10` | Dosage cards, hero photography frames | Use sparingly for hero or key metric cards.
| **Neutrals** | `text-white/90` → `text-white/50` | Body copy tiers | Use decreasing opacity to imply hierarchy.
| **Success** | `border-emerald-400/50`, `bg-emerald-500/10`, `text-emerald-200` | Positive CTAs (Dev save button) | Keep consistent with Dev tools actions.
| **Risk states** | `border-red-500/30`, `bg-red-500/10`, `text-red-300`; `border-amber-500/30`; `border-yellow-500/30` | Interaction cards | Derived from `InteractionsSection` severity map.
| **Inputs** | `bg-slate-950/60`, `border-white/10`, `placeholder:text-white/45` | Form controls | Includes JSON editor container and creation form inputs.
| **Badges** | `bg-white/10`, `ring-white/10`, `text-white/85` | Chips, effect tags | Apply interactive variant for clickable badges.

Use opacity-based whites (`white/xx`) to keep overlays harmonised with the dark base. Avoid pure white borders/backgrounds except for selection highlights.

## 3. Typography & Tone
- **Primary typeface**: `Inter` (set via Tailwind `font-sans`).
- **Display scale**:
  - Hero title (`Hero.tsx`): `text-4xl md:text-6xl`, `text-fuchsia-300`, drop-shadow `drop-shadow-[0_1px_0_rgba(255,255,255,0.1)]`.
  - Page headers (`PageHeader`): `text-3xl sm:text-4xl`, `text-fuchsia-300`.
  - Section titles: `text-xl font-semibold text-fuchsia-300`.
- **Body copy**: `text-sm text-white/75` inside cards; use `md:text-base` for key paragraphs.
- **Microcopy**: `text-[11px] uppercase tracking-[0.3–0.35em] text-white/45–70` for badges, pills, and metadata.
- **Monospace**: JSON & code surfaces use JetBrains Mono via `JsonEditor` inline styles.
- **Link styling**:
  - Inline links (About page): `text-fuchsia-200`, `cursor-pointer`, hover shifts to `text-fuchsia-100` without underlines.
  - Markdown-rendered links (`NotesSection`): dotted underline `decoration-dotted` for readability.
- **Tone**: Concise, instructional copy that mirrors dataset language (e.g., “Dosage & Duration”, “Mechanism of action”).

## 4. Layout & Spacing
- **Page gutters**: Wrap route shells with `mx-auto px-4 pb-20 pt-10`, adjusting `max-w` (`max-w-3xl`, `max-w-6xl`) based on content density.
- **Surface rhythm**: Vertical spacing typically increments by `4` or `6` (e.g., `gap-6`, `space-y-6`). Keep consistent top margins: `mt-6` after headers, `mt-4` before lists.
- **Masonry**: Use CSS columns (`columns-2`, `columns-3`, `[column-width:320px]`) with `break-inside-avoid` for Category grids and Dev creator layout so cards auto-fit content height.
- **Rounded geometry**: Outer shells `rounded-2xl`; interior tiles/badges `rounded-xl` or `rounded-full` for pills. Maintain 12–16px corner radii analogues.
- **Backdrops**: When layering cards, combine `bg-white/[0.04]` with `shadow-[0_18px_50px_-12px_rgba(0,0,0,0.45)]` for depth akin to substance article cards.

## 5. Core Surfaces
- **SectionCard (`components/common/SectionCard.tsx`)**:
  - Base: `rounded-2xl border border-white/10 bg-white/5 p-6` with animated entry and hover shadow intensification.
  - Variations: Dosage card overlays accent gradient + `border-fuchsia-500/30`; Dev Creator uses `bg-white/[0.04]`.
- **Info list tiles**: Use nested `rounded-xl bg-white/5 ring-white/10` articles with hover lighten for Chemistry & Pharmacology details.
- **Empty states**: Compose with dashed borders (`border-dashed border-white/20`) or italicised `text-white/60` copy inside `bg-white/5` containers.

## 6. Navigation & Global Shell
- **Header**: Sticky `border-b border-white/10 bg-[#0f0a1f]/70 backdrop-blur`. Nav items pair Lucide icons (16px) with labels; active state uses `text-white` + `bg-fuchsia-400` underline spanning full text width.
- **Dev Tools link**: Lives in primary nav, same pattern as other items. About button remains pill-shaped; active state uses `bg-fuchsia-500/25 text-white ring-fuchsia-400/60` with glow shadow.
- **Mobile menu**: Dropdown panel `rounded-2xl border-white/10 bg-[#120d27] p-4` with list of pill buttons.
- **Footer**: `border-t border-white/10`, copy in `text-white/60`, GitHub link accent brightens to `text-fuchsia-200`. Dev wrench button uses accent border/fill.

## 7. Buttons, Badges & Chips
- **Primary pills**: `rounded-full px-5 py-2.5`, gradient backgrounds for active states, `ring-1 ring-fuchsia-300/60` (Dosage sort toggles).
- **Secondary buttons**: `border-white/12 px-3 py-1.5 text-white/75` with hover border brighten; used for Dev copy/export controls.
- **Icon badges**: `IconBadge` yields `inline-grid h-8 w-8 rounded-xl bg-white/10 ring-white/15` with white icon strokes.
- **Effect chips**: `BADGE_BASE_CLASSES` / `BADGE_INTERACTIVE_CLASSES` for enumerations. Add `focus-visible:outline-fuchsia-400` for keyboard support.
- **Status badges**: Search metadata tokens adopt `border-fuchsia-400/25 bg-fuchsia-500/10 text-fuchsia-200/90` with uppercase tracking.
- **Add/remove affordances**: Creator “Add citation/route” buttons use dashed border in `border-white/15` (tinted to match category card border) with `hover:border-white/25`.

## 8. Forms & Inputs
- **Base input (`baseInputClass`)**:
  - `rounded-xl border border-white/10 bg-slate-950/60 px-3 py-2 text-sm text-white`.
  - Focus: `focus:border-fuchsia-400 focus:ring-2 focus:ring-fuchsia-300/30`.
- **Textarea (`baseTextareaClass`)**: Adds `py-3` default, matches dark fill.
- **Selects**: Use `appearance-none` with right padding for caret icons (custom chevron overlay). Colors mirror inputs.
- **Form labels**: `text-xs font-medium uppercase tracking-wide text-white/50` with `mb-2` spacing.
- **Validation messaging**: When present, adopt `text-xs text-white/55` for footnotes (e.g., “Separate items with semicolons…”).
- **Layout**: Group fields with `grid gap-4 md:grid-cols-2` or `md:grid-cols-3` to mirror article metadata columns.

## 9. Data Displays
- **Dosage & duration entries**: `bg-white/5 px-4 py-2.5 text-sm text-white/85 ring-white/10`, accent border on active route pill.
- **Interactions**: Severity color map tinted backgrounds with ring overlay, keep `md:columns-3` for responsive columns.
- **Search results**: `rounded-2xl border-white/10 bg-white/5 px-5 py-4`, left metadata column uses microcaps, right column optional “View” label.
- **Mechanism qualifiers**: Chips reuse `BADGE_INTERACTIVE_CLASSES`; sections nest `CategoryGrid` with column-based masonry.
- **Markdown notes**: Does not wrap in additional card beyond SectionCard; use `marker:text-fuchsia-300` for list bullets.

## 10. JSON & Structured Editors
- **JsonEditor**:
  - Container: `rounded-xl border-white/10 bg-slate-950/60 text-white shadow-inner` plus `focus-within:border-fuchsia-400` highlight.
  - Token colors defined in `src/styles.css` (properties = `#7dd3fc`, strings = `#f9a8d4`, numbers = `#86efac`, booleans = `#facc15`).
  - Keep content height dynamic by passing `minHeight` derived from line count (Dev creator preview logic).
- **Changelog preview**: Simple `<textarea>` with similar background but fixed `min-h-[220px]`, `font-mono text-xs`.

## 11. Interaction States & Accessibility
- **Focus management**: Every interactive element uses `focus-visible:outline` or `focus-visible:ring` tinted `fuchsia-400`. When adding new controls, inherit this pattern.
- **Hover/active**: Increase border opacity or background brightness by ~0.05–0.1. Avoid drastic color shifts that break dark harmony.
- **Scrollbars**: Global styling sets thin gradient thumb w/ fuchsia highlight—no overrides unless necessary.
- **Pointer cues**: Custom links disable underline but must set `cursor-pointer` and maintain color change to indicate state.
- **Contrast**: Ensure `text-white/70` on `bg-white/5` (approx 4.6:1) remains legible; for smaller text, step up to `text-white/80`.

## 12. Iconography & Imagery
- **Lucide icons**: Default to 16–20px, `text-fuchsia-200` or `text-white`. Maintain consistent stroke weight by using official Lucide names (e.g., `FlaskConical` for Substances nav).
- **Hero imagery**: Use the molecule placeholder frame (frosted glass square) with gradient overlay and dose wiki logo as subtle watermark.
- **Inline icons**: Pair with `IconBadge` when representing section headings or highlight statuses.

## 13. Motion & Feedback
- **Entry animations**: Use `SectionCard`'s Framer Motion props (y=14 → 0, fade). Stagger with `delay` props (0.05–0.35) to mirror existing page rhythm.
- **State notices**: Dev mode success/error toasts eject inside cards using `text-sm` + accent color (see existing notices logic). Follow same background/border treatments.

## 14. Content Alignment with Articles
- Match the aesthetic of individual substance articles by:
  - Reusing uppercased micro headers and fuchsia section titles.
  - Aligning form surfaces with article info tiles (dark, translucent, ringed).
  - Ensuring new datasets slot into SectionCards or masonry grids, keeping consistent paddings and pill treatments.

## 15. Implementation Checklist
When introducing or updating visual elements:
1. Wrap data-heavy blocks in `SectionCard` unless a unique layout is required.
2. Apply palette tokens above; never introduce raw white/black fills.
3. Use `text-fuchsia-300` headings + `text-white/75` body copy, with microcopy in uppercase tracking.
4. Confirm focus states (`focus-visible:outline-fuchsia-400`) on all interactive elements.
5. For forms, reuse `baseInputClass` / `baseTextareaClass` constants or clone their tokens.
6. Run `npm run build:inline` after changes to validate production bundle integrity.

Refer back to this guide before styling any new UI to maintain cohesion across the library.
