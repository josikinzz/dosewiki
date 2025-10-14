# dose.wiki Internal README

_Reference guide for maintainers detailing how the dose.wiki application is assembled, how data flows from the JSON dataset into the UI, and how to extend the project safely._

## 1. Platform Overview
- **Type**: Client-side React application delivered by Vite. No server-side runtime; the site is a static bundle backed by JSON data.
- **Primary dataset**: `src/data/articles.json` describes every substance (dosages, effects, interactions, and metadata). All UI surfaces derive content from this file or helpers that transform it.
- **Rendering model**: Hash-based navigation (`#/route`) keeps routing static-host friendly and enables portal-style transitions without a backend.
- **Tooling**: Tailwind-powered styling, Lucide icons, and a custom inline-build command (`npm run build:inline`) that emits a single HTML file for offline review.

## 2. Build & Runtime Stack
- **Build tooling**: Vite (ES modules, fast HMR, Rollup under the hood). The inline build mode references a custom plugin in `vite.config.ts` that inlines JS/CSS into `dist-inline/index.html`.
- **Language**: TypeScript throughout (React components, data helpers, scripts).
- **Styling**: Tailwind utilities with project-specific tokens in `tailwind.config.js` and supplemental global rules in `src/styles.css`.
- **Icons**: `lucide-react` for consistent iconography; avoid shipping bespoke SVGs.
- **State container**: React hooks; no external state library. Data is memoized locally by components or custom hooks.
- **Testing**: None today. Add frameworks (e.g., Vitest, Playwright) under `tests/` when introduced.

### Key npm Scripts
| Script | Purpose |
| --- | --- |
| `npm run dev` | Launches Vite dev server on http://localhost:5173 with hot module replacement. |
| `npm run build` | Standard production bundle targeting `dist/`. |
| `npm run build:inline` | Inline bundle for offline QA (`dist-inline/index.html`). Always execute before handing off work. |

## 3. Directory Map
```
src/
├── assets/           # Inline-able assets (e.g., SVG logo)
├── components/
│   ├── common/       # Reusable primitives (SectionCard, IconBadge, GlobalSearch)
│   ├── dev/          # Dev-mode context + utilities
│   ├── layout/       # Header, Footer frame
│   ├── pages/        # Route-level shells (Substances, Effects, Dev Tools, etc.)
│   └── sections/     # Article and page sections (Hero, InteractionsSection, etc.)
├── data/
│   ├── articles.json # Source content
│   ├── contentBuilder.ts # Normalizes raw JSON ➜ SubstanceRecord
│   ├── library.ts    # Aggregations, indexes, category helpers
│   ├── search.ts     # Search index + query helpers
│   ├── categoryIcons.ts, interactionClasses.ts, lsd.ts, ...
│   └── ...           # Additional static datasets (document shapes in comments)
├── hooks/            # Shared hooks (e.g., drafting utilities)
├── types/            # Shared TypeScript types/interfaces
├── utils/            # Routing helpers, slug utilities
└── styles.css        # Tailwind base imports + custom rules
```

`scripts/` contains Node helpers for massaging `articles.json` (batch updates, normalization, category cleanup). These scripts output logs into `notes and plans/` for audit history.

## 4. Data Flow & Content Model
1. **Raw dataset**: Each article entry contains `drug_info` with dosage tables, durations, interactions, effects, and citations.
2. **Normalization** (`src/data/contentBuilder.ts`): Converts raw fields into typed `SubstanceRecord` structures consumed by the UI. Responsibilities include:
   - Creating unique slugs (`slugify` helper).
   - Reshaping dosage ranges into structured `RouteInfo` objects with units, bracketed ranges, and severity markers.
   - Parsing duration segments (onset, come-up, peak, etc.) into labeled lists for the `DosageDurationCard`.
   - Transforming interaction lists into severity-bucketed groups with friendly labels and Lucide icons.
   - Building subject effect collections, tolerance info, hero badge metadata, and citation records.
   - Assigning category icons via `getCategoryIcon` and sorting categories/aliases.
3. **Library helpers** (`src/data/library.ts`): Assemble aggregate views for the router:
   - `substanceRecords` exposes normalized per-substance data.
   - `dosageCategoryGroups`, `chemicalClassIndexGroups`, `mechanismIndexGroups` generate list/grid groupings.
   - `effectSummaries`, `mechanismSummaries`, `getEffectDetail`, `getMechanismDetail`, `getCategoryDetail` provide page-specific payloads.
   - Interaction indexes match combinations using keyword sets from `interactionClasses.ts`.
4. **Search index** (`src/data/search.ts`): Precomputes match records spanning substances, categories, and effects; consumed by `GlobalSearch` for fuzzy suggestions.
5. **Presentation**: Components never read the raw dataset directly; they import from `library.ts` or `contentBuilder` outputs ensuring shared formatting.

## 5. Front-End Application Flow
### Entry & Providers
- `src/main.tsx` wraps `<App />` in `DevModeProvider`, seeding an in-memory clone of `articles.json` for the Draft Editor.
- Global styles applied via `src/styles.css` (Tailwind base + JSON editor overrides).

### Routing (`src/App.tsx`)
- Maintains an `AppView` state derived from the URL hash. Supported views: substance detail, substance index, category detail, effect index/detail, mechanism detail, interactions, search results, Dev Tools, About.
- Tracks responsive search positioning: the global search bar animates between the hero area and header based on scroll position.
- Loads the active `SubstanceRecord` by slug; default fallback is LSD (enforced via `src/data/lsd.ts`). Missing LSD triggers a build-time failure.
- Renders the top frame (`Header`, `Footer`), optional hero sections, and conditionally mounts page shells based on current view.

### Page Shells (`src/components/pages/`)
- **DosagesPage**: Uses `CategoryGrid` to render psychoactive/chemical/mechanism groupings, with Lucide icons representing current sort mode.
- **CategoryPage**: Displays category definition metadata, sub-groups, and drug lists with `IconBadge` icons.
- **EffectsPage / EffectDetailPage**: Present the library of subjective effects and associated substances.
- **MechanismDetailPage**: Handles mechanisms + qualifiers, manages scroll-sync for qualifier tabs, and delegates to `CategoryGrid` for substance lists.
- **InteractionsPage**: Consumes enriched interaction targets, handles comparison buckets, and syncs selections with the hash (`#/interactions/<primary>/<secondary>`).
- **SearchResultsPage**: Renders matches from `querySearch` with context badges.
- **DevModePage**: Rich drafting workspace described in section 6.
- **AboutPage**: Static copy summarizing the project with live counts drawn from library helpers.

### Substance Detail Surface
- Comprised of modular sections under `src/components/sections/` (Hero, DosageDurationCard, InfoSections, AddictionCard, SubjectiveEffectsSection, InteractionsSection, ToleranceSection, NotesSection, CitationsSection).
- Each section receives normalized data via props; no component reaches back to the raw JSON.
- Sections share the `SectionCard` primitive for consistent appearance and animation.

## 6. Dev Tools & Drafting Workflow
- **Provider**: `DevModeProvider` clones `articles.json` in memory. All edits happen against that clone; a refresh reverts to the shipped dataset.
- **Access**: Header/footer “wrench” icon navigates users to `#/dev/edit`. `open()` stores the last non-dev hash to support “Exit” flows.
- **Tabs** (`DevModePage`): Edit, Draft, Changelog, Settings. Article selection is alphabetical with psychoactive-class shortcuts.
- **Form editing**: `useArticleDraftForm` hook + `ArticleDraftFormFields` mirrored to the live article schema.
- **JSON editor**: `JsonEditor` (react-simple-code-editor + Prism) with custom styling in `styles.css`.
- **Exports**: Users can download individual articles, full datasets, or copy JSON to clipboard; timestamps appended automatically to filenames.
- **Reset controls**: Per-article and global reset buttons reference the original dataset via `DevModeContext` helpers.
- **Draft notices**: UI surfaces change logs, password reminders, and success toasts stored in local component state.

## 7. Search & Navigation
- `GlobalSearch` lives in `components/common/` and is portaled either into the hero well or header based on scroll state.
- Calls `querySearch` with built-in ranking and triggers navigation via callbacks from `App.tsx`.
- Search suggestions include metadata chips derived from articles (psychoactive classes, ROA tags, etc.).

## 8. Interaction & Safety Data
- `contentBuilder` merges raw interaction lists with canonical keyword sets defined in `src/data/interactionClasses.ts` to surface consistent severity buckets.
- `InteractionsPage` renders two-column comparison cards, reusing route selection logic to deep-link pairs.
- Tolerance data and addiction potential (if present) are exposed via dedicated sections.

## 9. Supporting Data Modules
- `src/data/categoryIcons.ts`: Maps category keys to Lucide icons used across category grids and headers.
- `src/data/lsd.ts`: Ensures LSD record availability; build fails if not found to guarantee hero defaults.
- `src/data/search.ts`: Builds search records at import time (executed once during module evaluation).
- `src/data/contentBuilder.ts` & `src/data/library.ts`: Backbone of data normalization and indexing; update these when the dataset schema evolves.

## 10. Runtime Environment & Hosting
- Because the site is static, it can be hosted on Vercel, Netlify, GitHub Pages, or any static file host.
- No runtime backend is required. “Backend” responsibilities (content updates) happen via the JSON dataset and optional scripts.
- `npm run build:inline` outputs a fully self-contained HTML file, enabling offline reviews or manual distribution.

## 11. Extending the Application
- **Adding a new substance**: Update `articles.json` (or use the Draft Editor). Ensure dosage routes, durations, effects, and interactions follow existing casing. Run `npm run build:inline` to validate.
- **Introducing new categories/mechanisms**: Adjust `contentBuilder` and `library` to normalize and surface the new taxonomy. Add icon mappings in `categoryIcons.ts` if required.
- **Adding a new page**: Create shell component under `components/pages/`, source data from `library.ts`, and register a new `AppView` route in `App.tsx` with corresponding hash logic.
- **Modifying search scoring**: Update `src/data/search.ts` to adjust weighting or to include new entity types.
- **Integrating additional datasets**: Place JSON under `src/data/`, describe the schema in a file comment, and wire data through a helper module instead of importing raw JSON inside components.

## 12. Styling & UX Conventions
- Adhere to Tailwind class ordering (layout → color → effects). Use existing color tokens (fuchsia/violet gradients, white/opacity neutrals).
- Page titles use 3xl/4xl sizing with `text-fuchsia-300` and, where applicable, an inline Lucide icon.
- Section cards base styles: `rounded-2xl border border-white/10 bg-white/5 p-6` with entrance animations.
- Maintain dark cosmic backdrop (#0f0a1f) and translucency layering as described in `notes and plans/dosewiki-visual-style-guide.md`.

## 13. Tooling & Automation Scripts
- Scripts under `/scripts` cover tasks like effect extraction, category normalization, and mechanism tagging. They typically:
  - Read `articles.json`.
  - Produce updated JSON or patch files.
  - Write summaries into `notes and plans/` for tracking.
- Always inspect script output before committing dataset changes; many scripts assume specific JSON shapes.

## 14. Quality Checks & Release Process
1. Run `npm run build` followed by `npm run build:inline`.
2. Smoke-test key routes: Substances (multiple ROAs), Effects, Mechanisms, Interactions, Search, Dev Tools, About.
3. Validate the inline bundle (`dist-inline/index.html`) loads the hero and search without a dev server.
4. Document manual QA steps + affected articles in your PR description (per repository guidelines).

## 15. Key Type Definitions
- `src/types/content.ts` defines `SubstanceContent`, `RouteInfo`, `InteractionGroup`, etc. Update here when extending the data model.
- `src/types/navigation.ts` enumerates supported `AppView` states used by the hash router.

## 16. Known Limitations
- No persistence layer: Dev Tool edits live only in-memory until exported/copied.
- No automated test suite; regressions rely on manual QA.
- Hash routing limits deep analytics integration without additional client-side handling.

## 17. Useful References
- Public README: `README.md` (quick start + contributor basics).
- Visual design foundation: `notes and plans/dosewiki-visual-style-guide.md`.
- Agent operating procedures: `AGENTS.md` (keep updated when workflows change).

---
Maintainers should keep this document current as the architecture evolves (new routes, data schemas, or tooling). When adding new systems, document the flow here so contributors can ramp quickly.
