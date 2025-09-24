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

## RULE
Always npm run build:inline after completing a task so that the user can manually review the change

## Documentation
- `README.md` contains onboarding steps, build commands, and release checklist.
