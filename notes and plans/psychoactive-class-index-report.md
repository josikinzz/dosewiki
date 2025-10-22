# Psychoactive Class Index Report

## Data pipeline
- `src/data/articles.json` feeds `contentBuilder.buildSubstanceRecord`, which produces `SubstanceRecord` entries consumed by `src/data/library.ts`.
- `substanceRecords` removes hidden entries (flagged `isHidden` or `Hidden` index tag) before the Substances index is built (`src/data/library.ts:110-118`).
- `dosageCategoryGroups` is generated once at module load via `buildCategoryGroups(substanceRecords)` and exported for every consumer (`src/data/library.ts:544-631`, `src/data/library.ts:2049`).

## Category assignment logic
- `CATEGORY_DEFINITIONS` fixes the card order, labels, and icons for each psychoactive class and identifies fallback/excluded keys (`src/data/library.ts:336-451`).
- `collectCategoryTags` merges normalized values from article `categories`, `indexCategories`, `psychoactiveClasses`, and `content.categoryKeys` to create a searchable tag set (`src/data/library.ts:483-500`).
- `resolveCategories` matches those tags against definition matchers, defaulting to the `Miscellaneous` fallback when nothing hits (`src/data/library.ts:503-513`).
- `buildCategoryBuckets` registers each substance with every matching definition while avoiding duplicate inserts per bucket (`src/data/library.ts:515-543`).
- Additional filters tune membership:
  - `filterStimulantRecords` removes compounds that are simultaneously tagged opioid, psychedelic, dissociative, or atypical hallucinogen to keep the stimulant card focused (`src/data/library.ts:1968-1984`).
  - `filterEntactogenRecords` excludes a small denylist of outliers (`src/data/library.ts:1930-1942`).
  - Hallucinogen buckets drop anything already placed in psychedelic, dissociative, or deliriant cards via `HALLUCINOGEN_EXCLUSION_KEYS` (`src/data/library.ts:562-575`).
- Categories in `CATEGORY_INDEX_EXCLUDED_KEYS` (anabolic steroids, supplements) are stripped from the rendered grid entirely (`src/data/library.ts:460-463`, `src/data/library.ts:578-631`).

## Per-card structure and ordering
- Every `DosageCategoryGroup` carries `key`, `name`, Lucide icon reference, `total`, ordered `drugs`, and optional `sections` for sub-clusters (`src/data/library.ts:10-37`, `src/data/library.ts:590-627`).
- `buildConfiguredDetailGroups` powers sectioned cards using `CategoryGroupConfig` definitions that filter by normalized categories, chemical classes, or resolved mechanism text (`src/data/library.ts:633-1929`).
  - Examples: Psychedelic sub-groups (Lysergamides, Tryptamines, 2C-X), Dissociative families, GABAergic subclasses for benzodiazepines/barbiturates.
  - “Other …” buckets are pushed to the end so curated groupings stay prominent (`src/data/library.ts:1870-1928`).
- Categories without bespoke configs fall back to chemical-class groupings which alphabetize both buckets and their entries (`src/data/library.ts:1758-1789`).
- When sections exist, the final `drugs` list flattens them in display order; otherwise, entries are alphabetized before render (`src/data/library.ts:613-618`).

## UI rendering (psychoactive view)
- `DosagesPage` defaults the sort toggle to `psychoactive`, passes `dosageCategoryGroups` to `CategoryGrid`, and only wires `onSelectCategory` when that view is active so clicking a card header navigates to its detail page (`src/components/pages/DosagesPage.tsx:45-142`).
- `CategoryGrid`:
  - Keeps expand/collapse state per card and resets when the groups array changes (`src/components/sections/CategoryGrid.tsx:15-62`).
  - Filters empty groups when requested and provides a Markdown clipboard export of each card’s contents (`src/components/sections/CategoryGrid.tsx:26-147`).
  - Renders sectioned layouts with dividers, uppercase section labels, and per-substance buttons that call `onSelectDrug` (`src/components/sections/CategoryGrid.tsx:169-302`).
  - Uses responsive CSS columns (`columns-*` utilities) with `break-inside-avoid` so cards stay intact as the viewport widens (`src/components/sections/CategoryGrid.tsx:164-177`, `src/components/sections/CategoryGrid.tsx:190-304`).

## Notable behaviors & follow-ups
- Psychoactive card membership updates automatically when editors adjust category, index-category, or psychoactive class tags within any article record.
- Hidden articles remain absent from the public grid but continue to appear in Dev Tools; toggling the `Hidden` tag is the fastest retirement mechanism.
- Hallucinogen exclusions prevent psychedelic/dissociative/deliriant duplicates but may hide atypical overlaps; confirm this remains intentional as we ingest new compounds.
- Clipboard export falls back to `document.execCommand("copy")`; consider adding explicit failure messaging if both copy paths fail.
