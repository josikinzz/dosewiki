# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

### Core Commands
- `npm install` - Install dependencies
- `npm run dev` - Start Vite dev server for local development
- `npm run build` - Production build to `dist/`
- `npm run build:inline` - Single-file HTML build to `dist-inline/index.html`
- `npm run preview` - Preview production build

### Testing
Currently no automated tests. When implementing tests, consider Jest, Vitest, or Playwright targeting >=80% coverage.

## Architecture Overview

### Data Flow
The application follows a data-driven architecture where all substance information flows from a central JSON source through transformation layers to React components:

```
articles.json → contentBuilder.ts → React Components → UI
              ↘ library.ts        ↗
                ↘ search.ts     ↗
```

- **articles.json** (~57K lines): Central data store containing all substance profiles, dosages, effects, and interactions
- **contentBuilder.ts**: Transforms raw article data into UI-ready structures (SubstanceContent, RouteInfo, etc.)
- **library.ts**: Provides categorization, grouping, and substance lookup functionality
- **search.ts**: Implements client-side search across substances, categories, and effects

### Routing Architecture
Hash-based routing with custom router in `src/App.tsx`:
- Routes: `#/substance/{slug}`, `#/category/{key}`, `#/effects/{slug}`, `#/search/{query}`
- State management via React hooks listening to hashchange events
- No external routing library dependency

### Component Organization
```
src/components/
├── common/     # Reusable UI primitives (badges, cards)
├── layout/     # Site-wide layout (Header, Footer)
├── pages/      # Top-level route handlers
└── sections/   # Content blocks (Hero, DosageCards, etc.)
```

## Critical Development Rules

### Data Source Constraint
**NEVER hard-code substance data in components**. All dosage ranges, ROA tables, and descriptive content must source from `src/data/articles.json` through the content transformation pipeline.

### Build Requirement
Always conclude coding tasks by running `npm run build:inline`; the single-file artifact is mandatory for downstream manual QA and offline distribution.

### Adding New Substances or Updates
1. Modify `src/data/articles.json` only
2. Update library groupings if adding new categories
3. Run `npm run build` to validate changes
4. Test both standard and inline builds

### Style Guidelines
- Use Tailwind utilities (order: layout → color → effects)
- Prefer Lucide icons over custom SVG
- 2-space indentation, camelCase variables, PascalCase components
- Keep hooks at component top

## Special Build Features

### Single-File HTML Build
The project includes a custom Vite plugin that creates a standalone HTML file with all assets inlined. This is crucial for offline distribution:
- Run `npm run build:inline`
- Output: `dist-inline/index.html`
- All CSS, JS, and assets are embedded in the single file

## Key Dependencies

- **Vite 5.2.0**: Build tool and dev server
- **React 18.3.1**: UI framework
- **TypeScript 5.4.0**: Type system
- **Tailwind CSS 3.4.7**: Utility-first styling
- **Framer Motion 11.0.0**: Animations
- **Lucide React**: Icon library (preferred)

## Project-Specific Context

This is a harm reduction information site providing substance dosage guidelines. The application prioritizes:
- Accurate data presentation from authoritative JSON source
- Offline accessibility via single-file builds
- Mobile-first responsive design
- Fast client-side search and navigation

See `README.md` for quick-start instructions, project structure, and release checklist.
