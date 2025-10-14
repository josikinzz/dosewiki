# Tag Separator Normalization Report

## Summary
- Multiple article fields (`psychoactive_class`, `chemical_class`, `mechanism_of_action`) store multi-value tags as free-form strings with mixed delimiters (commas, slashes, semicolons).
- Current parsing utilities split on `[;,/]`, which fragments labels that include commas or slashes inside parentheses (e.g., `SARI)` or `GHB`), polluting tag registries and Dev Tool selectors.
- Recent Tag Editor work serializes edited values with `", "`, re-introducing comma-separated tags even when we migrate the dataset.
- We can standardize on semicolon-delimited storage by introducing a structured parser that respects parentheses and only splits on delimiters outside them, then updating writers and running a migration script.

## Dataset Findings
| Field | Records With Values | Contains `;` | Contains `,` | Contains `' / '` | Contains `'/'` (no spaces) | No Delimiter |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| categories | 502 | 0 | 0 | 0 | 0 | 502 (stored as arrays) |
| psychoactive_class | 502 | 41 | 154 | 77 | 21 | 231 |
| chemical_class | 502 | 5 | 27 | 0 | 0 | 470 |
| mechanism_of_action | 501 | 83 | 0 | 0 | 0 | 418 |

Notes:
- Rows can count the same record multiple times because several strings mix delimiters (`Central nervous system depressant; GHB/GABA-B receptor agonist prodrug`).
- `categories` are already persisted as arrays and unaffected.

## Problem Examples
- **Comma splitting inside parentheses:** `Antidepressant (Serotonin Antagonist and Reuptake Inhibitor, SARI)` currently becomes two tags: `"Antidepressant (Serotonin Antagonist and Reuptake Inhibitor"` and `"SARI)"`.
- **Slash splitting within words:** `Central nervous system depressant; GHB/GABA-B receptor agonist prodrug` yields `"GHB"` and `"GABA-B receptor agonist prodrug"` as separate tags.
- **Ambiguous comma usage:** `Dissociative, Hallucinogen` should produce two tags, but `cannabinoid, hallucinogen` mixes with entries that rely on commas for descriptive clauses.
- These fragments already appear in Dev Mode tag options (e.g., bare `"GHB"`, `"SARI)"`), making the new tag selectors noisy and error-prone.

## Current Implementation Snapshot
- `contentBuilder.splitToList` and `articleDraftForm.parseDelimitedField` both perform `value.split(/[;,/]/)`, ignoring nesting or spacing semantics.
- `tagRegistry.readFieldValues` uses the same parser, so the registry backs the Tag Editor and option builders with fragmented labels.
- `articleDraftForm` and `tagRegistry` serialize `chemical_class` and `psychoactive_class` with `joinNormalizedValues(..., ", ")`, forcing comma-delimited strings whenever a draft or Tag Editor commit is saved.
- `mechanism_of_action` already serializes with `"; "`, but parsing still splits on `/`, so values like `agonist / antagonist` degrade if they come back through Tag Editor.

## Recommended Remediation
1. **Define canonical delimiter rules**
   - Semicolon (`;`) as the authoritative separator for multi-tag fields stored as strings.
   - Treat commas and slashes as delimiters only when they have surrounding whitespace and occur outside parentheses; otherwise, keep them inside the label.
   - Avoid splitting on naked slashes (e.g., `GHB/GABA-B`).

2. **Introduce a shared tokenizer**
   - Create `tokenizeTagField(value: string, options)` in `src/utils/tagRegistry.ts` (or a new `tagDelimiters.ts`).
   - Algorithm: iterate through the string, track parenthesis depth, split on `;` everywhere, `, ` or ` / ` only when `depth === 0`, trim segments, and collapse duplicates with `normalizeTagList`.
   - Expose helpers for fields that differ (`mechanism_of_action` already canonical but can reuse the same tokenizer with `allowCommaOutsideParens = false` if desired).

3. **Update readers and writers**
   - Replace regex-based splitting in `contentBuilder.splitToList`, `articleDraftForm.parseDelimitedField`, and `tagRegistry.readFieldValues` with the shared tokenizer.
   - Update serializers to `joinNormalizedValues(values, "; ")` for `psychoactive_class` and `chemical_class` so edited records stay semicolon-delimited.
   - Consider persisting `mechanism_of_action` as `"; "` plus the new parser to keep behavior consistent across all string-backed tag fields.

4. **Dataset migration script**
   - Add `scripts/normalizeTagDelimiters.mjs` that:
     1. Loads `articles.json`.
     2. For each target field, parses with the new tokenizer.
     3. Writes back `values.join("; ")` (empty string if none) or arrays for categories.
     4. Emits a summary (counts of records changed, before/after samples) into `notes and plans/` for auditing.
   - Run the script once to rewrite the dataset; ensure the Dev Mode changelog captures this bulk edit.

5. **Regression coverage**
   - Add unit tests around the tokenizer, covering parentheses, spaced vs tight slashes, and comma-heavy descriptors.
   - Add Tag Registry tests to assert no stray fragments like `"SARI)"` or `"GHB"` remain after hydration.
   - Include integration checks for Tag Editor flows to confirm serialization sticks to semicolons.

6. **Tooling follow-ups**
   - Refresh Dev Mode tag options (`useDevTagOptions`) after migration to confirm counts drop for fragmentary tags.
   - Surface a warning in Tag Editor when the editor detects a delimiter that would be rewritten (optional, but helps authors adopt semicolons manually).

## Expected Outcomes
- Canonical semicolon-delimited strings prevent future fragmentation and align with the desired format.
- Tag selectors and option lists receive clean, deduplicated labels, improving authoring UX and minimizing accidental tag variants.
- Migration script provides reproducible, reviewable changes and can be rerun if upstream data imports reintroduce mixed delimiters.

## Verification Checklist (post-implementation)
- Run `scripts/normalizeTagDelimiters.mjs` and confirm the diff converts commas/slashes to semicolons without truncating descriptors.
- Execute `npm run build` and `npm run build:inline` to ensure transformed data and parser updates compile.
- Manually inspect Dev Mode Tag Editor for previously fragmented labels (e.g., search for `SARI` or `GHB`).
- Validate Tag selector components: add/remove tags, switch to JSON view, and confirm semicolon-delimited strings persist on save.
