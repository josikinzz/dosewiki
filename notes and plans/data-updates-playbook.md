# Data Update Playbook for Substance Index Cards

Use this checklist whenever we realign a substance card (dissociatives, psychedelics, or future categories) based on a curated list from the user. The flow keeps JSON changes predictable and the index layout in sync with the requested ordering.

## 1. Parse the Request
- Capture the exact list the user supplies, including the subgroup each substance belongs to (e.g., Common, Lysergamides).
- Note every requested data touch: chemical class updates, category/tag changes, special placement ("only show under Other psychedelics"), or exclusions.
- Flag naming quirks early ("LSD" vs. "LSD (Lysergic acid diethylamide)") so we can build alias lookups before editing.

## 2. Verify Dataset Coverage
- Confirm each substance exists in `src/data/articles.json`:
  ```powershell
  node -e "const fs=require('fs');const data=JSON.parse(fs.readFileSync('src/data/articles.json','utf8'));['Name A','Name B'].forEach(n=>{const a=data.find(x=>x?.drug_info?.drug_name===n);console.log(n,'->',a?'found':'missing');});"
  ```
- If entries are missing, update the user so expectations stay aligned (they might supply alternates or request new drafts).

## 3. Plan Mapping Tables
- Draft plain objects in a scratch script:
  - `chemicalClassUpdates` ? `{ 'Drug Name': 'New Class' }`
  - `categoryRemovals` ? `{ 'Drug Name': ['tags', 'to', 'drop'] }`
  - `categoryAdditions` ? `{ 'Drug Name': ['ordered', 'new', 'tags'] }`
- Keep pluralization/casing consistent with existing taxonomy (`Lysergamides`, `other psychedelics`, etc.). Reuse helper constants where available.
- Call out section tags separately from chemical classes: the `Common` header is driven by a `common` tag, and every "Other …" section (e.g., `other opioids`) only renders entries that carry that tag, regardless of their chemical class. Include these in your additions/removals map so the card surfaces the right substances.
- Generate a quick alias lookup script to echo the exact `drug_name` strings you'll feed into `order` arrays so library configs stay in sync with the dataset.

## 4. Apply JSON Edits Programmatically
- Write a temporary Node script at the repo root to iterate `articles.json`, mutate the `drug_info` fields, and rewrite with `JSON.stringify(..., null, 2)` (the repo uses 2-space indentation).
- Merge category arrays rather than replacing them outright, filtering duplicates and preserving order when possible.
- Remove helper scripts immediately after successful runs to avoid clutter.

- When a card needs new subgroup ordering, extend the configuration in `src/data/library.ts` (e.g., the generalized `CategoryGroupConfig` we now use for dissociative and psychedelic cards).
- Add any supporting constants (alias sets, normalized category keys) before the configs they support to avoid temporal-dead-zone errors.
- Reuse the shared helpers (`createCategorizedRecordContexts`, `buildConfiguredDetailGroups`) instead of duplicating logic.
- If you introduce a brand-new grouping config (like the opioid one we just added), wire it into `buildCategoryGroups` so the category key resolves to the custom section builder and ensure any "Other …" group is pushed to the end alongside the existing psychedelic/stimulant handling.

## 6. Validate Locally
- Rerun the quick lookup scripts to spot-check chemical classes and tags after edits.
- `npm run build` and `npm run build:inline` to ensure both production and inline bundles generate without regression.
- Optionally open `dist-inline/index.html` and confirm the card renders the new structure (section names, ordering, badge behavior).

## 7. Communicate Clearly
- Summarize the mapping applied (old ? new class, tags removed/added) in the handoff message.
- Call out any substances that were skipped or missing from the dataset.
- Highlight structural library changes so reviewers know where to focus (e.g., new constants, configs, or helper reuse).
## 8. Refresh the Substance Index Card Layout
- Open `src/data/library.ts` and update the category-specific configs that drive the index cards so the new chemical class names land in the right sections.
  - **Dissociatives**: `DISSOCIATIVE_GROUP_CONFIG` organizes sections by chemical family and uses the `OTHER_DISSOCIATIVE_NAMES`/`EXCLUDED_FROM_ADAMANTANES` sets for manual placement. Keep those lists in sync with any renamed or reclassified entries so “Other dissociatives” only holds the intended stragglers.
  - **Psychedelics**: `PSYCHEDELIC_GROUP_CONFIG` expects normalized categories like `Common`/`Other psychedelics` and chemical classes such as `Lysergamides`, `Tryptamines`, `2C-X`. When classes get renamed, adjust both the filter strings and the ordered `order` arrays so the card renders sections in the agreed hierarchy.
  - **Stimulants**: `filterStimulantRecords` removes cross-tagged entries (opioid, psychedelic, dissociative, hallucinogen) before `STIMULANT_GROUP_CONFIG` builds sections like `Amphetamines`, `Phenidates`, `Cathinones`, etc. Keep the exclusion set and each `order` list aligned with the JSON names so nothing disappears or falls into “Other stimulants” unexpectedly.
  - **Opioids**: `OPIOID_GROUP_CONFIG` mirrors the user-provided chemical class list (Common, Morphinans, Benzimidazoles, Anilinopiperidines, etc.). Keep the `order` arrays synced with `articles.json`, confirm `common`/`other opioids` tags are present on the relevant records, and make sure the custom builder is referenced in both `buildCategoryGroups` and `getCategoryDetail` so the opioid card surfaces the grouped sections instead of a flat alphabetical list.
- After editing the configs, run `npm run dev` (or `npm run build` if you need a quick sanity check) and confirm the substance index card shows the expected section names, ordering, and substance counts.

Following these steps keeps bulk data updates predictable and makes it easy to extend the same workflow to every substance category card on the index.
