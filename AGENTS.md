# Repository Guidelines

## Project Structure & Module Organization
The UI is a Vite-powered React app. The main router lives in `src/App.tsx`, while shared surfaces sit under `src/components/`. Every substance profile, card, or index page must source its content from `src/data/articles.json`; do not hard-code dosage ranges, ROA tables, or descriptive copy. Helpers for transforming article data live in `src/data/contentBuilder.ts` and `src/data/library.ts`. Keep reusable primitives in `src/components/common/`, section-level building blocks in `src/components/sections/`, and page shells (Substances grid, placeholders, etc.) under `src/components/pages/`. If you introduce additional static datasets, place them in `src/data/` and document JSON shapes in a top-of-file comment. Static assets such as logos belong in `public/`.

## Build, Test, and Development Commands
Install dependencies with `npm install`. Use `npm run dev` to start the Vite dev server. Run `npm run build` before shipping changes, and `npm run build:inline` whenever you need the single-file HTML deliverable (distilled into `dist-inline/index.html`). Linting isn't wired yet; add `npm run lint` if you surface ESLint/Prettier. The project currently has no automated tests; add scripts under `package.json` when you introduce Jest, Vitest, or Playwright.

## Coding Style & Naming Conventions
We prefer Tailwind utility classes (ordered layout -> color -> effects) over custom CSS. Stick to 2-space indentation, camelCase variables, PascalCase component names, and default exports only for top-level entry points. Keep hooks at the top of components. Reach for Lucide icons instead of custom SVG markup. Any data-dependent UI should derive from the normalized structures returned by `contentBuilder` or `library` helpers.

## Testing Guidelines
No formal test suite exists yet. If you add one, mirror component paths in `tests/`, exercise router state (hash-based navigation), and snapshot the data-driven sections for multiple ROAs. Aim for >=80% line coverage once tests exist. Document manual QA steps in PRs for now.

## Commit & Pull Request Guidelines
The repo is unversioned; initialize git if needed and follow Conventional Commits (`feat:`, `fix:`, `chore:`). Each PR should describe the UX change, note which portions of `articles.json` are touched, and attach before/after screenshots or recordings for significant UI updates. Link related issues and list manual QA steps (local URLs, browsers/devices) so reviewers can reproduce the changes quickly.

## RULES
- Always npm run build:inline after completing a task so that the user can manually review the change
- Keep this Agent.md document up to do date, it shouldnt endlessly grow, but if something new seems worth adding to it, then add it or tweak this document. 
- When asked to write a review, guide, report, or document that is for the user or for yourself instead of an actual change to the site, always output it into the notes and plans folder as a .md file.
- **Before introducing, tweaking, or replacing any visual element (components, badges, spacing, colors, icons, etc.), read `notes and plans/dosewiki-visual-style-guide.md` and align the work to it. Do not ship UI changes if the style guide hasn’t been consulted during the task.**

## Documentation
- `README.md` contains onboarding steps, build commands, and release checklist.

## Agent Notes
- Entry point lives in `src/main.tsx` and renders the hash-driven router in `src/App.tsx`; navigation state is stored in React hooks with helpers from `src/utils/routing.ts`.
- The viewport locks to `.app-container`/`.app-content` (styles in `src/styles.css`) so the header remains static while the scrollable area lives in the inner content panel.
- Substance content is sourced exclusively from `src/data/articles.json`, normalized via `contentBuilder.ts`, and indexed by `library.ts`; search suggestions reuse the same records through `src/data/search.ts`.
- UI structure is split into `components/common` (primitives like `SectionCard`, `IconBadge`, `GlobalSearch`, `JsonEditor`), `components/sections` (dose card, info sections, interactions, etc.), and `components/pages` (route-level shells such as `DosagesPage`, `EffectsPage`, `MechanismDetailPage`).
- `components/sections/CategoryGrid.tsx` manages expandable category buckets, clipboard export, and delegates selections back to router callbacks.
- The single-file export is handled by a custom Vite plugin in `vite.config.ts`; enabling `npm run build:inline` inlines CSS/JS into `dist-inline/index.html`.
- Support scripts in `/scripts` manipulate `articles.json` (e.g., effect extraction, mechanism tagging) and log summaries into `notes and plans/` for research; `scripts/updateIndexCategory.mjs` also normalizes `index-category` fields and reorders `drug_info` keys.
- Hidden developer draft editor toggles from the footer wrench button; `DevModeProvider` (wrapped in `src/main.tsx`) keeps article edits in memory while `DevModePage` at `#/dev` sorts articles alphabetically, offers psychoactive-class jump menus, and exposes JSON/diff clipboard + download actions (diffs show only changed lines with green/red highlights and ship as `.diff` files).
- Drafting surfaces now share `src/hooks/useArticleDraftForm.ts` and `src/components/sections/ArticleDraftFormFields.tsx`; the Dev Tools edit tab defaults to a form-first UI with a JSON toggle driven by `draftMode` state.
- Psychoactive index layout now reads from `src/data/psychoactiveIndexManual.json`. The Dev Tools “Index Layout” tab uses a manual composer for category order, sections, taxonomy links, and slug lists with inline validation plus a JSON escape hatch.
- When building large Dev Tools forms, avoid CSS multi-column layouts—prefer responsive grids/flex so edits don’t trigger whole-page reflow. Memoize nested editors and update only the mutated branch of dataset state; whole-object cloning will surface as input lag once the UI renders hundreds of controls.
- Mirror public index ergonomics when refreshing Dev Tools editors: keep category previews compact, show substance lists vertically, and expose metadata (keys, notes, links) behind toggled drawers with icon-only actions plus sr-only labels to avoid clutter without sacrificing accessibility.
- Dev Tools change log entries now store recent activity in `src/data/devChangeLog.json` and roll older, large diffs into `src/data/devChangeLog.archive.json`; both are merged at runtime so the writable file stays under GitHub's 1 MB contents API cap.
- Dataset-level changelog generation now aligns articles by stable IDs instead of array index so deletions create targeted diffs rather than cascading replacements.
- Article Draft form now mirrors live article section order, surfaces category editing, and provides in-form previews for badges/effects plus character counts for long-form copy.
- Tag pickers for categories/chemical/psychoactive/mechanism fields open via the `TagMultiSelect` plus-button trigger (`openStrategy="button"`); new tag creation stays visible as an inline button with a matching "no matches" hint beneath the input so drafts can be saved even after blurring the field.
- Text entry fields (inputs, textareas, tag pickers, and the JSON editor) now enforce a fixed 16 px font size via shared base classes.
- Index category now stores semicolon-delimited tags via the same picker; adding a `Hidden` tag removes the article from public search/index surfaces while keeping it available in Dev Tools and the raw JSON.
- Default landing content is sourced from `src/data/lsd.ts`, which locates the LSD record in `articles.json`; the app throws at build time if that record ever goes missing.
- Social embed shells are generated at `/share/<slug>/` during build (see `scripts/generateEmbedLogo.mjs` + `scripts/buildSocialSharePages.mjs`); each static page injects OG/Twitter tags with name, categories, first-route dosage/duration, and a shared `embed-logo.webp` image before redirecting to the SPA.
- `src/components/common/JsonEditor.tsx` uses `react-simple-code-editor` with Prism highlighting, styled via the `.json-editor` rules in `src/styles.css`.
- `src/data/interactionClasses.ts` defines reusable keyword groups for interaction class matching. The `InteractionsPage` surface (`src/components/pages/InteractionsPage.tsx`) consumes enriched interaction targets from `contentBuilder`, keeps selection state encoded in the hash (`#/interactions/<primary>/<secondary>`), and displays comparison buckets via helpers in `src/utils/interactions.ts`.
- Contributor bios live in `src/data/userProfiles.json` and hydrate via helpers in `src/data/userProfiles.ts`; authenticated editors can update their profile through the Dev Tools “Profile” tab (`#/dev/profile`), which posts to `/api/save-user-profile`, while public views render at `#/contributors/<ENV_KEY>`.
- About page content is sourced from `src/data/aboutContent.md` (body copy) and `src/data/aboutSubtitle.md` (header subtitle), while founder selections come from `src/data/aboutConfig.json`; all three update through the Dev Tools “About” tab (Markdown + subtitle editors and founder checkboxes).
- About copy fields support live-count placeholders (`{{compoundCount}}`, `{{psychoactiveClassCount}}`/`{{categoryCount}}`, `{{chemicalClassCount}}`, `{{mechanismClassCount}}`/`{{mechanismOfActionClassCount}}`, `{{effectCount}}`) that render with locale-formatted numbers at runtime and inside the Dev Tools live preview.
- Dev Tools credentials now verify immediately on save; successful auth persists `{ username, password, key, lastVerifiedAt }` to local storage, shows a "Logged in" badge, and enables the dedicated logout control.
- Edit tab now includes a tag-editor-style danger zone for deleting the currently selected article; the action verifies credentials, pushes a GitHub commit, and requires a checkbox confirmation.
- Profile avatars can be uploaded directly in Dev Tools (PNG/JPG/WebP ≤2 MB); uploads store under `public/profile-avatars/<key>/avatar.<ext>` with cache-busting query strings, and sanitizer still accepts remote HTTPS URLs.
- Home screen icons ship from `public/apple-touch-icon.png`, `public/icon-192.png`, and `public/icon-512.png`; the PWA manifest lives at `public/manifest.webmanifest` and `index.html` links them via `<link rel="apple-touch-icon">` and `<link rel="manifest">` tags.
- Molecule artwork syncs from `molecule svg dataset/` into `public/molecules/` via `node scripts/syncMoleculeAssets.mjs`; rerun the script whenever `moleculeSvgMappings.json` changes to keep served assets aligned.
