# dosewiki

Front-end for the dose.wiki harm-reduction knowledge base. The app is a data-driven React + Tailwind interface that renders substance profiles, dosage guidance, and effect libraries sourced exclusively from `src/data/articles.json`.

## Quick Start
- Install: `npm install`
- Develop: `npm run dev` (Vite on http://localhost:5173)
- Production build: `npm run build`
- Inline/offline build: `npm run build:inline` → `dist-inline/index.html`

> Always finish feature work by running `npm run build:inline`; the single-file export is used for manual QA and offline review.

### Requirements
- Node.js 18+ (Node 20 LTS recommended)
- npm 9+

## Project Structure
```
src/
├── components/
│   ├── common/    # UI primitives shared across pages
│   ├── layout/    # Header, Footer, frame components
│   ├── pages/     # Top-level routed shells (Substances, Effects, etc.)
│   └── sections/  # Page sections (Hero, DosageDurationCard, etc.)
├── data/          # articles.json plus contentBuilder and library helpers
├── utils/         # Routing helpers and misc utilities
└── assets/        # Static imports bundled by Vite (e.g., dosewiki-logo.svg)
public/            # Static assets served as-is (e.g., favicon)
```

## Data Pipeline
All user-facing content flows from the JSON dataset through transformation helpers before it reaches React components:

```
src/data/articles.json → contentBuilder.ts → library.ts/search.ts → components
```

- Never hard-code dosage ranges, ROA tables, or descriptive copy in components.
- When introducing new static datasets, place them in `src/data/` and document the JSON schema in a top-of-file comment.

## Development Guidelines
- Prefer Tailwind utility classes (ordered layout → color → effects) over bespoke CSS.
- Use PascalCase component names, camelCase variables, and keep hooks at the top of components.
- Reach for Lucide icons instead of custom SVGs.
- The hash-based router in `src/App.tsx` drives navigation; use `viewToHash` helpers when linking between views.
- If you add automated tests later, mirror component paths under `tests/` and aim for ≥80% line coverage.

## Release Checklist
1. `npm run build` to ensure the production bundle succeeds.
2. `npm run build:inline` for the inlined HTML deliverable.
3. Spot-check key substance pages (dosage card, hero placeholder, interactions, etc.).
4. Document manual QA steps in your PR along with before/after screenshots for significant UI changes.

## Additional Docs
- `AGENTS.md` – guidelines tailored for AI/code agents.
- `CLAUDE.md` – Claude Code-specific workflow notes.
