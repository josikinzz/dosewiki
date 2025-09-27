# Data Update Playbook for `articles.json`

Use this checklist whenever we need to modify multiple fields in `src/data/articles.json` (e.g., chemical classes, titles, aliases, newly introduced metadata). The goal is to keep large-scale edits reliable, auditable, and easy to revisit later.

## 1. Capture the Request
- Copy the exact list the user provides and note which fields need updates (chemical classes, titles, `psychoactive_class`, new keys like `chemical_name`, etc.).
- Track any grouping or contextual info that affects several entries at once ("apply to all lysergamides", "only stimulants in the supplied list").
- Flag naming mismatches immediately so we can map every request to the precise `drug_info.drug_name` string stored in the dataset.

## 2. Audit Dataset Coverage
- Verify each requested substance exists in `articles.json`. A quick Node snippet helps surface gaps:
  ```bash
  node -e "const fs=require('fs');const data=JSON.parse(fs.readFileSync('src/data/articles.json','utf8'));['Name A','Name B'].forEach(n=>{const hit=data.find(x=>x?.drug_info?.drug_name===n);console.log(n,'->',hit?'found':'missing');});"
  ```
- If anything is missing or spelled differently, follow up before editing to avoid orphaned changes.

## 3. Prepare the Change Set
- Draft mapping objects for each field you plan to touch (e.g., `chemicalNameUpdates`, `psychoactiveClassUpdates`, `tagRemovals`).
- Normalize capitalization and pluralization to match existing values; this keeps filters and search helpers working without extra tweaks.
- When introducing new fields, decide on default fallbacks up front (empty strings, empty arrays, etc.) so the structure stays consistent across the dataset.

## 4. Apply Changes Programmatically
- Use a temporary Node or `jq` script to load `articles.json`, mutate the necessary fields, and rewrite with `JSON.stringify(data, null, 2)` to preserve spacing.
- Merge arrays carefully—dedupe while retaining intended ordering. For scalar fields, prefer explicit reassignment so every entry in the target set is updated deterministically.
- Clean up helper scripts once the updated file is saved to keep the repo tidy.

## 5. Spot-Check the Result
- Re-run your lookup script (or craft a new one) to confirm each updated field now reflects the requested values.
- Consider exporting a diff of the affected entries (e.g., `git diff src/data/articles.json`) to review changes in context and catch accidental edits.

## 6. Coordinate Downstream Uses (When Needed)
- Most UI surfaces consume normalized data through `contentBuilder`/`library`. If the field you touched is already in use, confirm helper functions still behave as expected.
- Only adjust UI configs or components when the request explicitly calls for it. Otherwise document the new data fields so future UI work can hook into them.

## 7. Validate Builds
- Run `npm run build` (optional but helpful) and always finish with `npm run build:inline` to ensure the inline bundle reflects the latest data and catches JSON syntax issues early.

## 8. Hand Off Clearly
- Summarize which fields changed, how many records were affected, and any follow-up tasks (e.g., "chemical_name values populated for 40 stimulants; UI still reads `drug_name`").
- Call out unresolved items (missing substances, ambiguous naming) so the next update can address them without rediscovery.

Following this playbook keeps bulk data updates predictable and scales to any combination of fields we need to revise across the substance library.
