# Molecule SVG Integration Plan

## Goal
Automatically display the appropriate molecule SVG at the top of each substance article when a mapping exists, while preserving the current hero placeholder for records without artwork.

## Key Findings
- Substance heroes currently use `Hero.tsx`, which renders a static glassy frame containing the dose.wiki logo (`placeholder` text feeds the sr-only label). No image slot exists today.
- `SubstanceContent` in `src/types/content.ts` exposes `moleculePlaceholder` only; `contentBuilder.ts` populates this from `articles.json` and `library.ts` surfaces it via `content` on each `SubstanceRecord`.
- `src/data/moleculeSvgMappings.json` now holds 288 `filename → articleId` matches (deduplicated to one SVG per record) plus unmatched entries in `notes and plans/molecule-svg-unmatched.json`.
- SVG assets currently live under `molecule svg dataset/`; they are not imported by Vite so nothing ships in the bundle yet. Filenames include spaces, parentheses, and non-ASCII characters (e.g., `β-carboline.svg`).

## Proposed Implementation

### 1. Asset Preparation
- Create `public/molecules/` (or `src/assets/molecules/`) that contains only the SVGs referenced by `moleculeSvgMappings.json`.
  - Prefer `public/` to avoid adding 288 eager imports to the JS bundle; access via `/molecules/<filename>` at runtime keeps JS size flat.
  - During the initial migration, copy matched SVGs from `molecule svg dataset/` into the new directory using a one-off script (e.g., `scripts/prepareMoleculeAssets.mjs`). The script should:
    - Read `src/data/moleculeSvgMappings.json`.
    - Assert each referenced file exists in the dataset.
    - Copy the file into `public/molecules/` (preserve original filename so localization-friendly names like `β-carboline` stay discoverable).
    - Optionally warn when illegal URL characters are encountered (Vite serves files from `public/` verbatim; parentheses and Greek letters are acceptable but we should double-check on dev server).
  - Document the sync command in `AGENTS.md` so future updates follow the same pipeline.

### 2. Data Linking
- Extend `contentBuilder.ts` to attach an optional `moleculeAsset` object to each `SubstanceContent` when a mapping exists. Suggested shape:
  ```ts
  interface SubstanceContent {
    moleculePlaceholder: string;
    moleculeAsset?: {
      filename: string;   // e.g., "O-Desmethyltramadol (Racemate).svg"
      url: string;        // `/molecules/O-Desmethyltramadol (Racemate).svg`
      sourceField: string; // from mapping.matchedField for audit
    };
  }
  ```
- Build a lookup map from `articleId` to molecule metadata by loading the JSON once inside `contentBuilder`. (Keep the JSON in `src/data/` so bundlers can tree-shake; import as `import moleculeMappings from "./moleculeSvgMappings.json"`.)
- When constructing `SubstanceRecord`, detect `record.id` and hydrate `content.moleculeAsset` only if the asset file exists under `public/molecules/`. Throw/log during build if the mapped asset is missing to catch sync drift.
- Update `src/types/content.ts` and any downstream consumers (`library.ts`, Dev Tools) to accept the optional `moleculeAsset`.

### 3. Hero Component Update
- Add support for rendering the SVG when `moleculeAsset` is provided:
  - Accept a new `moleculeAsset?: { url: string; title: string }` prop on `Hero`.
  - Replace the background logo with an `<img>` tag sourced from the `url`. Use `alt` text derived from `content.name` or `matchedValue` to satisfy accessibility—`aria-label` can mirror the substance name plus “molecule diagram”.
  - Preserve all current gradients, borders, and drop shadows from the style guide; ensure the SVG is constrained (e.g., `object-contain`) inside the 48×48 hero square so line art isn’t clipped.
  - Fallback: if `moleculeAsset` is absent, render the existing placeholder exactly as it ships today to avoid regressions.
- Validate against `dosewiki-visual-style-guide.md` (already reviewed) so the Molecule frame keeps the dark glass aesthetic and doesn’t overpower hero typography.

### 4. Dev Tools & Editorial Workflows
- Surface molecule linkage metadata in Dev Tools later (optional), but for now document that the mapping is JSON-driven.
- Update `AGENTS.md` with a short note covering:
  - Location of canonical SVGs (`public/molecules/`).
  - How to regenerate `moleculeSvgMappings.json` and re-run the sync script when new assets arrive.

### 5. QA & Validation Plan
- Local smoke test: visit substances with and without mappings (e.g., LSD, O-DSMT, Tramadol, Trazodone) to verify hero renders the SVG or falls back gracefully.
- Confirm assets load under both dev (`npm run dev`) and production builds (`npm run build` + `npm run build:inline`), watching for URL encoding issues on filenames with spaces or Unicode.
- Lighthouse / bundle sanity: ensure no large JS regression since assets are delivered directly from `public/`.
- Accessibility: inspect in browser dev tools that `<img>` includes descriptive `alt` text and the hero remains keyboard inert (unless future interactions are added).

### Open Questions
1. Do we want to canonicalize filenames (e.g., slugify) to avoid URL-encoding the Greek characters? If so, we should update both the copy script and the JSON to store the public filename.
2. Should unmatched molecules be exposed in Dev Tools to flag missing articles, or is the JSON log sufficient?
3. How should we handle future duplicates where an editor may prefer a specific stereoisomer drawing? The current dedupe leans on racemate assets; we could expose this choice via metadata if the design needs the stereospecific view.

## Next Steps
1. Build the copy/sync script and populate `public/molecules/`.
2. Wire `contentBuilder` + `Hero` to consume optional molecule assets.
3. Run the standard build commands and manually QA a sample of mapped and unmapped substances.
