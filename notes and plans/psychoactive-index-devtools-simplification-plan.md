# Dev Tools Psychoactive Index Simplification Plan

## Goal
- Replace the rule-driven psychoactive index editor with a lightweight manual composer that mirrors the public substance index layout and writes to a concise JSON structure.
- Preserve Dev Tools ergonomics (copy previews, JSON toggle, change-reset mechanics) while removing complex rule builders, filters, and evaluation logic.
- ✅ January 2025: Manual composer implemented (`psychoactiveIndexManual.json` + rewritten Dev Tools layout tab). Remaining notes below capture the original migration rationale and reference details.

## Current State & Pain Points
- The Index Layout tab (`src/components/sections/dev-tools/index-layout/IndexLayoutTab.tsx:1`) drives `psychoactiveIndexConfig.json` through a large rule-builder UI with nested rule sets, section sort strategies, and preview hydration.
- The config loader (`src/data/psychoactiveIndexConfig.ts:1`) normalizes rule sets, icons, exclusion matrices, and manual order lookups before `library.ts` computes category groups (`src/data/library.ts:1` + `src/data/library.ts:30`).
- Maintaining or editing the current layout requires understanding rule syntax, tag normalization, and implicit dedupe behaviours—adding friction for editors who only need to arrange cards and sublists.

## Target Data Model
- Introduce a new dataset `src/data/psychoactiveIndexManual.json` that stores category → section → drug slugs explicitly.
- Document shape via a top-of-file comment in `src/data/psychoactiveIndexManual.ts` (new loader module) and add `/schemas/psychoactive-index-manual.schema.json` for validation.
- Proposed JSON skeleton:
  ```json
  {
    "$schema": "/schemas/psychoactive-index-manual.schema.json",
    "version": 1,
    "categories": [
      {
        "key": "psychedelic",
        "label": "Psychedelic",
        "iconKey": "psychedelic",
        "sections": [
          {
            "key": "classic",
            "label": "Classic",
            "link": {
              "type": "chemicalClass",
              "value": "Tryptamine"
            },
            "drugs": ["lsd", "psilocybin-mushrooms"]
          }
        ],
        "drugs": ["25i-nbome", "5-meo-dmt"],
        "notes": "Optional freeform summary for editors"
      }
    ]
  }
  ```
- Store only slugs (or `{ slug, aliasOverride? }`) so all display data continues to hydrate from `articles.json`.
- Allow sections to carry an optional `link` object referencing a chemical class, psychoactive class, or mechanism key while still letting editors assign a custom `label`. This keeps the manual layout aligned with canonical taxonomy without forcing that name into the UI.

## UI / UX Changes
- Keep the existing tab shell styles in `IndexLayoutTab` but swap the body for a columnar composer:
  - Render each category as a card matching the public CategoryGrid layout for instant visual parity.
  - Within a category, show optional header copy (notes), a flat drug list, and accordion sections (sub-categories) whose contents render as pills like the live grid.
- Editing affordances:
  - `Add substance` control: freeform text field with slug autocomplete + validation against `substanceRecords` (type-ahead component similar to list pickers in the draft form). Allow pressing Enter to accept typed slugs.
  - `Browse` button next to input opens dropdown of all substances (grouped alphabetically) for mouse-friendly selection.
  - Section-level add/remove buttons, drag handles or up/down controls for ordering, and inline delete icons next to each drug entry.
  - Category-level actions for adding/removing sections, editing labels/icons, and reordering categories via move up/down buttons (simpler than drag-and-drop).
  - Section metadata editor: compact inline selector to attach an optional taxonomy link (`chemicalClass`, `psychoactiveClass`, or `mechanism`) while letting the label remain freeform. When a link is present, show a subtle pill indicating the target for quick reference.
- Fold JSON editor toggle into the footer so power users can still edit raw JSON; reuse `JsonEditor` but bind it to the new manual schema.
- Remove rule filters, rule set builders, auto section toggles, overflow strategies, and evaluation warnings.

## Data Layer Updates
- Replace the rule parser with a lightweight loader:
  - New module `src/data/psychoactiveIndexManual.ts` parses/validates the JSON file, resolves icons via `getCategoryIcon`, and exposes typed structures for the manual list.
  - Update `library.ts` to consume manual config: map each category and section to actual `SubstanceRecord` entries by slug, derive `total` counts, and detect missing/duplicate slugs (log warnings for Dev Tools display).
  - When sections include taxonomy links, surface that association in the derived `DosageCategoryGroup` data so the public index can expose link-out chips (while keeping the Dev Tools composer authoritative).
- Sunset the rule-based helpers (`evaluateRuleSet`, `RuleEvaluationContext`, etc.) from `psychoactiveIndexConfig.ts` after confirming no other consumers rely on them. The file can be replaced with manual loader exports (`manualConfig`, `ManualCategory`, etc.).
- Adjust `DevModeContext` (`src/components/dev/DevModeContext.tsx:3-197`) to import the new JSON file and expose `manualPsychoactiveIndex` state instead of the rule config.
- Update `dosageCategoryGroups` and related selectors in `library.ts` to source from the manual config; ensure downstream consumers (CategoryGrid, index detail views) still receive `DosageCategoryGroup` structures.

## Dev Tools Editing Workflow
- On load, hydrate form state from `manualConfig`, including category order.
- Track draft mutations locally and diff against original JSON for “unsaved changes” messaging (reuse the existing `hasUnsavedChanges` comparison logic).
- Provide inline validation feedback when a slug is missing, duplicated within the same category, or points to a hidden article. Highlight invalid entries and prevent save until resolved.
- Persist actions: replacing the JSON in memory should update DevMode context, enabling download/copy to clipboard for manual commits (same pattern as existing “Save JSON” CTA).
- Hidden articles should remain selectable but trigger a contextual warning chip so editors know the entry is suppressed on the public index.

## Migration Steps
1. Scaffold new schema + loader and port current config data into the manual JSON format (initial migration script or manual conversion).
2. Update `DevModeContext` + `DevModePage` wiring to use new manual config state key names.
3. Refactor `IndexLayoutTab` UI to the new composer, removing legacy rule builder code and preview evaluation.
4. Simplify `library.ts` to map manual config to category groups (drop rule evaluation helpers and context map builders).
5. Delete unused rule-evaluation utilities and update imports across the app.
6. Refresh documentation (`AGENTS.md`, `notes and plans/dosewiki-site-readme.md`) to describe the manual composer instead of the rule builder.
7. Re-run `npm run build` and `npm run build:inline` to validate the new data flow.
8. Confirm the public index still exposes clipboard markdown export (even if Dev Tools removes that button) and wire any new taxonomy-link metadata into that export if relevant.

## Validation & QA Considerations
- Unit guard (if added later): ensure manual loader rejects unknown icons, missing slugs, and duplicate keys before runtime renders.
- Manual QA checklist:
  - Add/remove substances via text input and dropdown, verify they appear in the preview columns.
  - Confirm ordering changes mirror the live index after save.
  - Validate JSON editor edits reflect instantly in the visual composer (and vice versa).
  - Check build output for warnings about missing slugs.
- Ensure `npm run build:inline` passes per repository guidelines once implementation completes.

## Decisions & Follow-ups
- **Sublist copy**: Labels alone are sufficient; no additional description field required.
- **Hidden articles**: Allow selection; surface a soft warning instead of filtering them out.
- **Legacy config removal**: Remove rule-based files once the manual loader is stable—prioritize whichever path is least risky during migration.
- **Markdown export**: Keep the copy-to-Markdown helper on the public index (CategoryGrid) but drop it from Dev Tools unless editors request it again. Ensure the export still reflects manual ordering.
- **Section taxonomy links**: Implement optional link metadata per subcategory so editors can associate a section with a chemical class, psychoactive class, or mechanism while retaining a custom label. UI should present a compact picker (e.g., icon button opening a menu) to avoid clutter.
