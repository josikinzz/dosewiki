# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

---

## Development Commands

### Core Commands
| Command | Description |
|---------|-------------|
| `npm install` | Install dependencies |
| `npm run dev` | Start Vite dev server (localhost:5173) |
| `npm run build` | Production build to `dist/` |
| `npm run build:inline` | Single-file HTML build to `dist-inline/index.html` |
| `npm run preview` | Preview production build |
| `npm run export:dose-table` | Export dosage data to `notes and plans/dose-equivalent-table.xlsx` |
| `npm run generate:smiles` | Generate SMILES mappings from OPSIN |
| `npm run merge:articles` | Merge articles JSON files |

### Pre-build Hooks
Before `dev`, `build`, and `build:inline`, these scripts run automatically:
1. `scripts/generateEmbedLogo.mjs` - Creates embedded logo
2. `scripts/buildCompressedArticles.mjs` - Compresses articles for production
3. `scripts/buildSocialSharePages.mjs` - Generates social share pages

---

## Project Layout

```
src/
├── assets/            # Inline-able assets (logo SVG)
├── components/
│   ├── common/        # Primitives (SectionCard, IconBadge, GlobalSearch, JsonEditor)
│   ├── dev/           # DevMode provider + drafting hooks
│   ├── layout/        # Header, Footer, surrounding chrome
│   ├── pages/         # Route shells (12 pages)
│   └── sections/      # Article + page sections (Hero, InteractionsSection, etc.)
├── data/
│   ├── articles.json  # Source of truth dataset (~57K lines)
│   ├── articles.compressed.ts # Compressed for production
│   ├── contentBuilder.ts # Normalizes raw JSON → SubstanceRecord
│   ├── library.ts     # Aggregations, indexes, lookups
│   ├── search.ts      # Search index + query helpers
│   └── *.json/*.ts    # Supporting datasets
├── hooks/             # Reusable hooks (drafting forms)
├── types/             # Shared TypeScript models
├── utils/             # Routing helpers, slugification, etc.
├── styles.css         # Tailwind base + bespoke rules
└── main.tsx / App.tsx # Entry + router

scripts/               # 27 Node utilities for data processing
api/                   # Vercel serverless functions
public/                # Static assets (fonts, molecules, icons)
schemas/               # JSON schemas for data validation
```

---

## Architecture Overview

### Data Flow
```
articles.json → contentBuilder.ts → React Components → UI
              ↘ library.ts        ↗
                ↘ search.ts     ↗
```

- **articles.json**: Central data store with all substance profiles, dosages, effects, interactions
- **contentBuilder.ts**: Transforms raw `RawArticle` → `SubstanceRecord` with typed structures (`RouteInfo`, `DoseEntry`, etc.)
- **library.ts**: Builds categorization, groupings, and lookup maps (`substanceBySlug`, `effectSummaries`, `interactionIndex`)
- **search.ts**: Client-side search index with scoring algorithm
- **interactionClasses.ts**: Keyword groups for interaction class matching

### Routing
Hash-based routing in `src/App.tsx` with helpers in `src/utils/routing.ts`. No external router dependency.

| Route | Description |
|-------|-------------|
| `#/substances` | Index/list view |
| `#/substance/{slug}` | Single substance article |
| `#/category/{key}` | Category filter |
| `#/effects` | All effects list |
| `#/effect/{slug}` | Single effect detail |
| `#/mechanism/{slug}[/{qualifier}]` | Mechanism detail |
| `#/chemical/{slug}` | Chemical classification |
| `#/psychoactive/{slug}` | Psychoactive classification |
| `#/interactions[/{primary}[/{secondary}]]` | Interactions browser |
| `#/search/{query}` | Search results |
| `#/about` | About page |
| `#/contributors/{key}` | Contributor profile |
| `#/dev/{tab}[/{slug}]` | DevMode (8 tabs) |

### State Management
- **DevModeContext** (`src/components/dev/DevModeContext.tsx`): Clones `articles.json` into memory for drafting. Provides article CRUD, manual index config management, and About page content editing. Edits persist only until refresh.
- **Route State**: Managed in App.tsx via `useState` + `hashchange` listener

---

## Data Layer

### articles.json Structure
Each article contains:
```json
{
  "id": number,
  "title": string,
  "drug_info": {
    "drug_name": string,
    "substitutive_name": string,
    "IUPAC_name": string,
    "smiles": string | [{ "label": string, "smiles": string }],
    "chemical_class": string,
    "psychoactive_class": string,
    "dosages": { "routes_of_administration": {...} },
    "duration": {...},
    "interactions": {...},
    "tolerance": {...},
    "mechanism_of_action": string,
    "subjective_effects": string,
    "citations": [...]
  },
  "index-category": string
}
```

Note: `smiles` can be a single string or an array of `{ label, smiles }` objects for mixtures.

### Supporting Data Files
| File | Purpose |
|------|---------|
| `iupacSmilesMap.json` | IUPAC to SMILES mappings |
| `titleIupacSmiles.json` | Title to SMILES lookup |
| `moleculeSvgMappings.json` | SVG file mappings for molecules |
| `psychoactiveIndexManual.json` | Manual psychoactive category layout |
| `chemicalIndexManual.json` | Manual chemical class layout |
| `mechanismIndexManual.json` | Manual mechanism layout |
| `userProfiles.json` | Contributor profiles |
| `aboutContent.md` | About page body content |
| `aboutSubtitle.md` | About page header subtitle |
| `aboutConfig.json` | About page founder selections |
| `categoryIcons.ts` | Category icon mappings |
| `tagOptions.ts` | Available tags for editors |
| `routeSynonyms.ts` | ROA alias mappings |

---

## DevMode System

Accessible via header/footer wrench icon (`#/dev`). Built for trusted contributors to stage dataset edits.

### 8 Tabs
1. **edit**: Article JSON editor with diff preview, form-first UI, danger zone for deletion
2. **create**: New article form with validation
3. **change-log**: Tracks modifications (stored in `devChangeLog.json`, archived to `devChangeLog.archive.json`)
4. **tag-editor**: Manage effect/mechanism/class tags
5. **profile**: Contributor profile editing
6. **index-layout**: Manual category arrangement with inline validation
7. **about**: Markdown + subtitle editors, founder checkboxes
8. **layout-lab**: UI preview and testing

### Features
- Psychoactive-class jump menu for navigation
- JSON/diff clipboard + download actions
- Diffs show changed lines with green/red highlights
- Saves never hit disk until explicitly committed via GitHub API
- Credentials persist to local storage after verification
- Profile avatars: PNG/JPG/WebP ≤2 MB, stored in `public/profile-avatars/`

---

## API Layer

Serverless functions in `/api/` (Vercel):
| Endpoint | Purpose |
|----------|---------|
| `save-articles.js` | Persist article changes via GitHub |
| `save-user-profile.js` | User profile storage |
| `auth.js` | Authentication |
| `test-env.js` | Environment testing |
| `_utils/` | Helpers (passwords.js, github.js, parseBody.js) |

---

## Scripts

Located in `/scripts/`. Most read `articles.json`, apply transformations, and emit logs to `notes and plans/`.

### Key Scripts
| Script | Purpose |
|--------|---------|
| `buildCompressedArticles.mjs` | Compress articles for production |
| `buildSocialSharePages.mjs` | Generate social share page templates |
| `generateEmbedLogo.mjs` | Create embedded logo |
| `generateSmilesMap.mjs` | Resolve SMILES from OPSIN |
| `exportDoseSpreadsheet.mjs` | Export dose data to XLSX |
| `syncMoleculeAssets.mjs` | Sync SVGs from dataset to public |
| `merge-articles-json.mjs` | Merge article files |
| `normalizeTagDelimiters.mjs` | Normalize tag formatting |
| `syncArticleCitations.mjs` | Sync citation data |
| `updateIndexCategory.mjs` | Normalize index-category fields |

---

## Key Dependencies

### Production
| Package | Version | Purpose |
|---------|---------|---------|
| `react` | ^18.3.1 | UI framework |
| `react-dom` | ^18.3.1 | React DOM rendering |
| `framer-motion` | ^11.0.0 | Animations |
| `lucide-react` | ^0.544.0 | Icon library (preferred) |
| `react-markdown` | ^10.1.0 | Markdown rendering |
| `remark-gfm` | ^4.0.1 | GitHub flavored markdown |
| `remark-breaks` | ^4.0.0 | Markdown line breaks |
| `react-simple-code-editor` | ^0.14.1 | Code editing component |
| `prismjs` | ^1.30.0 | Syntax highlighting |
| `diff` | ^8.0.2 | Text diffing |

### Development
| Package | Version | Purpose |
|---------|---------|---------|
| `vite` | ^5.2.0 | Build tool & dev server |
| `typescript` | ^5.4.0 | Type system |
| `tailwindcss` | ^3.4.7 | Utility-first styling |
| `sharp` | ^0.34.4 | Image processing |
| `xlsx` | ^0.18.5 | Excel file export |
| `@resvg/resvg-js` | ^2.6.2 | SVG rendering |

---

## Critical Development Rules

### Data Source Constraint
**NEVER hard-code substance data in components.** All dosage ranges, ROA tables, and descriptive content must source from `src/data/articles.json` through the content transformation pipeline.

### Build Requirement
**Always run `npm run build:inline` after completing tasks.** The single-file artifact is mandatory for downstream manual QA and offline distribution.

### Style Guide
**Before introducing, tweaking, or replacing any visual element** (components, badges, spacing, colors, icons, etc.), read `notes and plans/dosewiki-visual-style-guide.md` and align work to it. Do not ship UI changes without consulting the style guide.

### Documentation Output
When writing reviews, guides, reports, or documents for the user or yourself instead of actual site changes, **output them to `notes and plans/` folder as `.md` files**.

### Adding New Substances
1. Modify `src/data/articles.json` only
2. Update library groupings if adding new categories
3. Run `npm run build` to validate
4. Test both standard and inline builds

---

## Style Guidelines

- **Tailwind utilities**: Order as layout → color → effects
- **Icons**: Prefer Lucide icons over custom SVG
- **Indentation**: 2-space
- **Variables**: camelCase
- **Components**: PascalCase, default exports only for top-level entries
- **Hooks**: Keep at top of components
- **Data dependencies**: Always derive from `contentBuilder` or `library` helpers
- **Text inputs**: Fixed 16px font size via shared base classes
- **Dev Tools forms**: Avoid CSS multi-column layouts; prefer grids/flex

---

## Testing Guidelines

No formal test suite exists yet. When adding one:
- Mirror component paths in `tests/`
- Exercise router state (hash-based navigation)
- Snapshot data-driven sections for multiple ROAs
- Aim for ≥80% line coverage
- Document manual QA steps in PRs for now

---

## Commit & Pull Request Guidelines

Follow Conventional Commits (`feat:`, `fix:`, `chore:`). Each PR should:
- Describe the UX change
- Note which portions of `articles.json` are touched
- Attach before/after screenshots for significant UI updates
- Link related issues
- List manual QA steps (local URLs, browsers/devices)

---

## Special Features

### Single-File HTML Build
Custom Vite plugin in `vite.config.ts` creates standalone HTML with all CSS/JS/assets inlined for offline distribution.

### Social Share Pages
Generated at `/share/<slug>/` during build with OG/Twitter tags, dosage info, and redirect to SPA.

### PWA Support
- Manifest: `public/manifest.webmanifest`
- Icons: `apple-touch-icon.png`, `icon-192.png`, `icon-512.png`

### About Page Placeholders
Support live-count placeholders in markdown: `{{compoundCount}}`, `{{psychoactiveClassCount}}`, `{{categoryCount}}`, `{{chemicalClassCount}}`, `{{mechanismClassCount}}`, `{{effectCount}}`

### Hidden Articles
Adding `Hidden` to index-category removes article from public search/index but keeps it in Dev Tools.

### Default Landing
Default content sources from `src/data/lsd.ts` which locates the LSD record. Build fails if record is missing.

---

## Reference

### Key Types (`src/types/`)
- `content.ts`: `SubstanceContent`, `RouteInfo`, `InteractionGroup`, `ToleranceEntry`
- `navigation.ts`: Hash-driven `AppView` shapes

### Further Reading
- `README.md`: Quick-start, project structure, release checklist
- `notes and plans/dosewiki-visual-style-guide.md`: Canonical styling guidance
- `notes and plans/dosewiki-site-readme.md`: Deep-dive internal architecture
