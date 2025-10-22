# Dev Tools Index Editor Multi-Dataset Plan

## Overview
The Index Layout tab in Dev Tools currently edits only the psychoactive manual (`src/data/psychoactiveIndexManual.json`). We now have curated templates for chemical and mechanism indexes (`notes and plans/chemical-class-index-template-revised.json`, `notes and plans/mechanism-index-template-revised.json`) and need the editor to support all three surfaces (psychoactive, chemical, mechanism) with the same UX. This plan documents the required data plumbing, Dev Tools updates, and runtime integration work.

## Current State
- `DevModeContext` exposes only `psychoactiveIndexManual` plus helpers (`replacePsychoactiveIndexManual`, etc.), sourced from `src/data/psychoactiveIndexManual.json`.
- `IndexLayoutTab` hardcodes that dataset; local state (`draftManual`, `rawJsonDraft`, etc.) assumes a single manual and the help copy references “psychoactive index”.
- Runtime grouping:
  - `library.ts` registers the psychoactive manual with `MANUAL_CATEGORY_PRESENTATIONS` and exports `dosageCategoryGroups` from it.
  - `chemicalClassIndexGroups` and `mechanismIndexGroups` are algorithmic: they gather classes from article metadata and sort alphabetically with default icons (`Hexagon`, `Cog`).
  - The public index (`DosagesPage`) pulls `dosageCategoryGroups`, `chemicalClassIndexGroups`, `mechanismIndexGroups` for the trio of tabs; Dev Tools classification dropdowns read the same exports.
- Schemas: only `/schemas/psychoactive-index-manual.schema.json` exists. No equivalent schema files for chemical/mechanism manuals yet.

## Data & Schema Work
1. **Promote revised manuals into `src/data/`:**
   - Add `src/data/chemicalIndexManual.json` and `src/data/mechanismIndexManual.json` seeded from the `*-revised.json` templates (preserve icon keys & ordering).
   - Add top-of-file comments that describe JSON shape if needed and ensure ASCII encoding.
2. **Schema coverage:**
   - Duplicate/adjust the psychoactive schema into `schemas/chemical-index-manual.schema.json` and `schemas/mechanism-index-manual.schema.json` (structure is identical; only `$id`/title need to differ).
   - Update each new JSON file’s `$schema` pointer to the new path (already matches in revised files; keep when moving).
3. **Loader modules:**
   - Factor out common parsing logic from `src/data/psychoactiveIndexManual.ts` to avoid copy/paste (e.g., introduce `src/data/manualIndexLoader.ts` that exports shared types + `parseManualConfig`).
   - Re-export dataset-specific helpers:
     - `psychoactiveIndexManual.ts` → `export const psychoactiveIndexManualConfig = loadManualConfig(rawPsychoactiveJson);`
     - New `chemicalIndexManual.ts`, `mechanismIndexManual.ts` doing the same.
   - Ensure each loader exposes `ManualIndexConfig` (same structure) plus typed categories/sections for use in Dev Tools and `library.ts`.
4. **Icon keys:**
   - Add mappings for `chemical` → `Hexagon` and `mechanism` → `Cog` in `src/data/categoryIcons.ts` so manual icon keys resolve.

## Dev Tools Updates
1. **Extend `DevModeContext`:**
   - Import new manual JSON modules and store original copies in refs similar to `originalManualIndexRef`.
   - Add state + helpers for chemical/mechanism manuals: `chemicalIndexManual`, `mechanismIndexManual`, along with `replace*`, `reset*`, `getOriginal*`, `apply*` functions.
   - Update `DevModeContextValue` type and provider memo to expose the new datasets.
   - Audit existing consumers to ensure new fields don’t break type inference (only `IndexLayoutTab` currently reads manual data).
2. **Generalize `IndexLayoutTab`:**
   - Introduce a dataset selector (likely pill buttons matching the public index tabs) with keys `psychoactive`, `chemical`, `mechanism`.
   - Store per-dataset UI state, e.g. `Record<DatasetKey, ManualDraftState>` where `ManualDraftState` holds `draftManual`, `normalizedCurrent`, `normalizedOriginal`, `rawJsonDraft`, `jsonError`, `saveNotice`.
   - When switching datasets, load values from the corresponding state bucket instead of resetting.
   - Update all handlers (`handleSave`, `handleResetDraft`, `handleResetToOriginal`, `handleOrganizeEntries`, JSON editor apply) to operate on the active dataset and call the correct context helpers.
   - Ensure unsaved-change detection works per dataset; show notice if *either* dataset has pending edits, or display dataset-specific notice (decide on UX).
   - Replace hardcoded copy (“Manually compose the psychoactive index…”) with text that dynamically reflects the active dataset.
   - Revisit `organizeManualEntries`: it promotes `common` tags for psychoactive layout. Either:
     - Make the helper dataset-aware (psychoactive keeps current behavior, chemical/mechanism might just alphabetize without the tag heuristic), or
     - Disable the “Organize” button for datasets where automatic sorting would undo intentional manual ordering (confirm with product).
   - Surface validation warnings (missing/hidden/duplicate slugs) across datasets—current `slugStatuses` logic is reusable once the manual-to-edit is parameterized.
   - Preserve existing accessibility: ensure dataset switch buttons have `aria-pressed` etc.
3. **Draft export parity:**
   - Confirm that the JSON editor area predicates still show the active manual’s JSON and that applying edits updates only that dataset.
   - When saving, update the corresponding context state so other Dev Tools surfaces (if any) can consume the new layout within the session.

## Runtime Integration
1. **`library.ts` adjustments:**
   - Import `chemicalIndexManualConfig` & `mechanismIndexManualConfig`.
   - Build utilities analogous to `manualDosageCategoryGroups` for the new manuals, generating `DosageCategoryGroup[]` with real `DrugListEntry`s. Consider extracting a `createManualCategoryGroups(manualConfig, defaultIcon)` helper to avoid duplication.
   - Decide how to handle substances absent from the manual:
     - Option A: append an automatically-generated “Unassigned” bucket using the existing algorithmic grouping for leftovers.
     - Option B: rely on manual completeness and flag omissions separately in Dev Tools (preferred if manual is authoritative). Document choice in comments.
   - Replace `export const chemicalClassIndexGroups = ...` and `mechanismIndexGroups = ...` with manual-driven arrays (plus fallback if manual is empty).
   - If we need auto-generated groups elsewhere (e.g., for analytics), keep the original builders exported under new names (`buildAutoChemicalClassIndexGroups`) for reuse.
   - Update any functions relying on alphabetical order (e.g., search suggestions) if they should now reflect manual ordering.
2. **Detail views:**
   - Currently `getMechanismDetail` and related helpers depend solely on the psychoactive manual for grouping. Evaluate whether mechanism detail pages should now reference the mechanism manual for section ordering when presenting subsets. If so, extend `buildCategoryGroupsForRecords` or create a new helper to consume dataset-specific manual orderings.
3. **Dev Preview:**
   - Ensure Dev Tools (beyond the editor) can preview the new layouts. If other components (classification dropdowns, etc.) should respect the in-session drafts, they may need to read from `useDevMode` instead of the static exports; otherwise document manual process (copy JSON into repo) for maintainers.

## QA & Tooling
- Update `notes and plans/Agent.md` if repository conventions around manual datasets change (e.g., documenting new data files, schema locations).
- After implementation, run `npm run build:inline` (per repo rules) to confirm TypeScript builds and the inline bundle compiles.
- Consider adding lightweight validation scripts/tests ensuring manual JSON covers only known slugs (similar to existing slug checks).

## Open Questions / Follow-ups
- Should the “Organize” feature behave uniformly across datasets, or be disabled/rewired for chemical/mechanism layouts?
- Do chemical/mechanism manuals require cross-links (`link` field) like psychoactive sections? The revised JSON currently omits them; confirm future needs before expanding the schema.
- Should Dev Tools expose download/export actions for each dataset individually (current UI may assume one file)? Adjust once design direction is set.

