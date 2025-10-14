# dose.wiki

Front-end for the dose.wiki harm-reduction knowledge base. The application is a fully static, data-driven React + Tailwind interface that renders substance profiles, dosage guidance, and interaction references sourced from a single JSON dataset.

---

## Contents
- [Platform Overview](#platform-overview)
- [Runtime Architecture](#runtime-architecture)
- [Project Layout](#project-layout)
- [Data Flow](#data-flow)
- [Key Components](#key-components)
- [Dev Tools Workspace](#dev-tools-workspace)
- [Search & Navigation](#search--navigation)
- [Build, Run, and Deploy](#build-run-and-deploy)
- [Development Workflow](#development-workflow)
- [Quality Checklist](#quality-checklist)
- [Supporting Scripts](#supporting-scripts)
- [Reference Types](#reference-types)
- [Further Reading](#further-reading)

---

## Platform Overview
- **Type**: Client-side single page application delivered as static assets (no runtime backend).
- **Primary dataset**: `src/data/articles.json` contains every substance record. Components never hard-code copy or dosage data.
- **Routing**: Hash-based URLs (`#/substances`, `#/effect/<slug>`, etc.) to stay static-host friendly.
- **Styling**: Tailwind CSS utilities layered on a dark cosmic theme with fuchsia accent gradients.
- **Icons**: [`lucide-react`](https://lucide.dev/) provides all iconography for consistency.
- **Inline bundle**: `npm run build:inline` outputs a single self-contained HTML file used for offline review and QA.

## Runtime Architecture
Entry point (`src/main.tsx`) wraps the application in a provider that hydrates an in-memory clone of the dataset for drafting.

```tsx
// src/main.tsx
import App from "./App";
import { DevModeProvider } from "./components/dev/DevModeContext";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <DevModeProvider>
      <App />
    </DevModeProvider>
  </React.StrictMode>,
);
```

`App.tsx` owns navigation state, loads normalized data, and composes route-level shells:

```tsx
// src/App.tsx (excerpt)
const DEFAULT_VIEW: AppView = { type: "substances" };
const DEFAULT_SLUG = lsdMetadata.slug;

export default function App() {
  const [view, setView] = useState<AppView>(() => parseHash(undefined, DEFAULT_SLUG, DEFAULT_VIEW));

  const navigate = useCallback((nextView: AppView) => {
    const hash = viewToHash(nextView);
    window.location.hash = hash;
  }, []);

  const selectSubstance = useCallback((slug: string) => navigate({ type: "substance", slug }), [navigate]);

  // ...derive data from library helpers...

  return (
    <div className="min-h-screen bg-[#0f0a1f] text-white">
      <Header currentView={view} onNavigate={navigate} /* ... */ />
      {renderActiveView(view)}
      <Footer onNavigate={navigate} />
    </div>
  );
}
```

## Project Layout
```
src/
├── assets/            # Inline-able assets (logo SVG)
├── components/
│   ├── common/        # Primitives (SectionCard, IconBadge, GlobalSearch, JsonEditor)
│   ├── dev/           # Dev mode provider + drafting hooks
│   ├── layout/        # Header, Footer, surrounding chrome
│   ├── pages/         # Route shells (Substance Index, Effects, Mechanisms, Dev Tools, About)
│   └── sections/      # Article + page sections (Hero, InteractionsSection, etc.)
├── data/
│   ├── articles.json  # Source of truth dataset
│   ├── contentBuilder.ts # Normalizes raw JSON → SubstanceRecord
│   ├── library.ts     # Aggregations, indexes, and lookup helpers
│   ├── search.ts      # Search index + query helpers
│   └── *.ts           # Supporting datasets (category icons, interaction vocab, etc.)
├── hooks/             # Reusable hooks (drafting forms)
├── types/             # Shared TypeScript models
├── utils/             # Routing helpers, slugification, etc.
├── styles.css         # Tailwind base imports + bespoke rules
└── main.tsx / App.tsx # Entry + router
```

`scripts/` hosts Node utilities for maintaining `articles.json` (category cleanup, effect extraction). Each script writes audit logs into `notes and plans/`.

## Data Flow
1. **Raw dataset** (`articles.json`) ships fields like `drug_info.dosages.routes_of_administration` and `subjective_effects`.
2. **Normalization** happens in `contentBuilder.ts`, producing typed `SubstanceRecord` objects.

   ```ts
   // src/data/contentBuilder.ts (excerpt)
   export const substanceRecords: SubstanceRecord[] = articles
     .map((article) => buildSubstanceRecord(article))
     .filter((record): record is SubstanceRecord => record !== null);

   function buildDoseEntries(ranges?: RawDoseRanges): RouteInfo["dosage"] {
     if (!ranges) return [];
     return Object.entries(ranges)
       .filter(([label, value]) => isNonEmpty(label) && isNonEmpty(value))
       .map(([label, value]) => ({ label, value: value!.trim() }));
   }
   ```

3. **Aggregations** in `library.ts` expose page-friendly groupings (psychoactive categories, mechanisms, effect summaries, interaction indexes).

   ```ts
   // src/data/library.ts (excerpt)
   export const effectSummaries: EffectSummary[] = Array.from(effectMap.entries())
     .map(([slug, entry]) => ({ name: entry.name, slug, total: entry.records.length }))
     .sort((a, b) => a.name.localeCompare(b.name));

   export function getMechanismDetail(slug: string): MechanismDetail | null {
     const entry = mechanismMap.get(normalizeMechanismSlug(slug));
     if (!entry) return null;
     const qualifiers = Array.from(entry.qualifierMap.entries()).map(([key, value]) => ({
       key,
       label: value.qualifier ?? "general",
       total: value.records.size,
       groups: buildCategoryGroups(Array.from(value.records)),
     }));
     return { definition: { name: entry.name, slug, total: entry.records.size }, qualifiers, defaultQualifierKey: "unqualified" };
   }
   ```

4. **Presentation**: Components consume only normalized helpers, keeping UI logic data-agnostic.

## Key Components
- **`PageHeader`** (sections/PageHeader.tsx): Shared title bar that optionally receives a Lucide icon and description.
- **`CategoryGrid`**: Renders expandable psychoactive/chemical/mechanism buckets, clipboard exports, and router callbacks.
- **`DosageDurationCard`**: Displays normalized route tables (`RouteInfo`) and duration timelines produced by `contentBuilder`.
- **`InteractionsSection`**: Maps interaction severity to color tokens using keyword groups from `interactionClasses.ts`.
- **`GlobalSearch`**: Uses the precomputed search index for instant suggestions and portals between hero/header slots depending on scroll position.

Each section wraps content in `SectionCard` (`components/common/SectionCard.tsx`) for consistent background, border, animation, and hover states.

## Dev Tools Workspace
Accessible via the header/footer wrench icon (`#/dev/edit`). Built exclusively for trusted contributors to stage dataset edits without mutating the shipped JSON.

- `DevModeProvider` clones `articles.json` into memory on load. Edits persist until refresh.
- Tabs mirror the live article schema: form-first editing (`useArticleDraftForm`), JSON view (`JsonEditor`), changelog diffs, and dataset settings.
- Actions include copying JSON, downloading individual articles or the entire dataset, and resetting to source values.
- Psychoactive-class jump menu accelerates navigation across ~200 substances.
- Saves never hit disk; exports produce timestamped files that can be re-imported manually.

## Search & Navigation
- Hash router ensures direct linking works on static hosting environments.
- `GlobalSearch` renders suggestions with contextual badges derived from library metadata (psychoactive classes, mechanisms, ROAs).
- Search results page (`#/search`) lists matches with type tokens (Substance, Category, Effect) and secondary descriptions.

## Build, Run, and Deploy
| Command | Description |
| --- | --- |
| `npm install` | Install dependencies (Node 18+ recommended, Node 20 LTS tested). |
| `npm run dev` | Start Vite dev server on http://localhost:5173 with HMR. |
| `npm run build` | Produce production bundle in `dist/`. |
| `npm run build:inline` | Emit single-file HTML at `dist-inline/index.html`. **Run after every change.** |

Deployment is static: upload `dist/` or `dist-inline/index.html` (for offline reviews) to any static host (Vercel, Netlify, S3, etc.).

## Development Workflow
1. Make changes sourcing data from `library.ts`/`contentBuilder.ts`; never hard-code values.
2. Prefer Tailwind utilities (ordered layout → color → effects). Keep icons consistent with Lucide usage across existing pages.
3. Update `notes and plans/` documentation when adding new datasets or workflows.
4. Finish by running `npm run build:inline` (per repository rule) and manually inspecting `dist-inline/index.html` if needed.

## Quality Checklist
- ✅ Production build passes (`npm run build`).
- ✅ Inline build updated (`npm run build:inline`).
- ✅ Smoke test key routes: Substances, category detail, effects, mechanisms (with qualifiers), interactions, search, Dev Tools, About.
- ✅ If LSD record missing, build will fail (see `src/data/lsd.ts`).
- ✅ Document manual QA steps, affected articles, and before/after screenshots in PRs.

## Supporting Scripts
Located in `scripts/`. Most read `articles.json`, apply transformations, and emit logs into `notes and plans/` for traceability.

Examples:
- `scripts/updateIndexCategory.mjs`: Normalizes `index-category` fields and reorders `drug_info` keys.
- `scripts/extract-effects.js`: Collates effect data for analysis.
- `scripts/preview-stimulant-card.cjs`: Local tooling for previewing stimulant-category updates.

Always inspect output before committing dataset changes.

## Reference Types
Key models live under `src/types/`:
- `content.ts`: `SubstanceContent`, `RouteInfo`, `InteractionGroup`, `ToleranceEntry`, etc.
- `navigation.ts`: Hash-driven `AppView` shape powering routing logic.
- `search.ts`: `SearchMatch` definitions used by `GlobalSearch` and search results.

Extend these when evolving the schema to keep TypeScript contracts accurate.

## Further Reading
- `notes and plans/dosewiki-visual-style-guide.md`: Canonical styling guidance.
- `notes and plans/dosewiki-site-readme.md`: Deep-dive internal architecture doc.
- `AGENTS.md`: Workflow expectations for AI/code agents working in this repo.

---
Questions or improvements? Open an issue or update the `notes and plans/` docs to keep future contributors in the loop.
