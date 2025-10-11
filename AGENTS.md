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

## Documentation
- `README.md` contains onboarding steps, build commands, and release checklist.

## Agent Notes
- Entry point lives in `src/main.tsx` and renders the hash-driven router in `src/App.tsx`; navigation state is stored in React hooks with helpers from `src/utils/routing.ts`.
- Substance content is sourced exclusively from `src/data/articles.json`, normalized via `contentBuilder.ts`, and indexed by `library.ts`; search suggestions reuse the same records through `src/data/search.ts`.
- UI structure is split into `components/common` (primitives like `SectionCard`, `IconBadge`, `GlobalSearch`), `components/sections` (dose card, info sections, interactions, etc.), and `components/pages` (route-level shells such as `DosagesPage`, `EffectsPage`, `MechanismDetailPage`).
- `components/sections/CategoryGrid.tsx` manages expandable category buckets, clipboard export, and delegates selections back to router callbacks.
- The single-file export is handled by a custom Vite plugin in `vite.config.ts`; enabling `npm run build:inline` inlines CSS/JS into `dist-inline/index.html`.
- Support scripts in `/scripts` manipulate `articles.json` (e.g., effect extraction, mechanism tagging) and log summaries into `notes and plans/` for research.
