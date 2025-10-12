# Interactions Comparison Feature Plan

## Goal
Design an interactions experience that lets visitors pick any two substances and immediately compare their combination risks, highlighting overlapping contraindications, unique warnings, and direct cross-references between substances.

## Current State
- Profiles render an `InteractionsSection` on each substance detail page with three severities (danger, unsafe, caution) sourced from `content.interactions`.
- The global `#/interactions` route is a placeholder card, so there is no dedicated interactions tooling yet.
- `SubstanceRecord` instances supplied by `library.ts` include only the human-readable interaction strings; there is no shared index or metadata linking those strings across articles.

## Data Findings (2025-02-15)
- Input data: `drug_info.interactions` in `src/data/articles.json` always exposes three buckets (`dangerous`, `unsafe`, `caution`). 501 of 502 articles populate at least one entry.
- Volume: 4,411 total interaction strings (1,659 dangerous, 1,186 unsafe, 1,566 caution).
- Cross-substance linkage is sparse: only ~11% of interaction strings exactly match another article’s primary/alternate name; most entries describe drug classes (`MAOIs`), therapeutic categories (`ACE inhibitors`), or include annotations in parentheses.
- Normalisation gap: `buildInteractionGroups` (in `contentBuilder.ts`) title-cases entries before storing them, discarding the raw string that would help slug/alias matching. Parenthetical rationale is kept but punctuation is stripped when title-casing.
- Alias noise: interaction strings routinely mix delimiters (`/`, `–`, parentheses) and pluralisation, so naïve equality checks fail even when two articles reference the same external substance/class.

## Proposed Approach

### Data Normalisation Layer
1. Extend `contentBuilder` to emit richer interaction payloads, e.g. each `InteractionGroup` entry becomes `{ label, severity, items: Array<{ raw, display, slug, matchType }> }`.
2. Preserve the original raw string and derive:
   - `display`: existing title-cased label for UI.
   - `slug`: normalised identifier (lowercase, strip punctuation/parentheses, collapse whitespace to hyphens).
   - `matchType`: enum describing whether the slug resolved to a known substance (`"substance"`), a known alias (`"alias"`), a recognised drug class keyword (`"class"`), or remains uncategorised (`"unknown"`).
3. Build a new `interactionsIndex` in `library.ts` mapping each `slug` to:
   - All source substances (with severity arrays)
   - Reverse lookup of which severity bucket referenced it per source
   - Flag if slug matches a canonical substance (so we can link to its profile).
4. Encode heuristics for slug derivation:
   - Strip text inside parentheses for slug matching but store rationale separately.
   - Normalise common punctuation replacements (`/`, `–`, `&` → `-`, remove trailing descriptors like `compounds`).
   - Collate known class keywords into a maintained dictionary (e.g., `maoi`, `ssri`, `benzodiazepine`). Store this under `src/data/interactionClasses.json` with schema docs if we introduce it.

### Comparison Computation
- When two substances are selected, fetch their interaction sets from the enriched records.
- Build three result buckets per severity:
  1. `Shared`: slugs present in both substances.
  2. `Only In <Substance A>` and `Only In <Substance B>`.
- Detect direct cross-reference: if either substance’s interaction list explicitly names the other’s slug/aliases, surface a “Direct match” banner showing the highest severity encountered.
- Surface class-level matches by comparing slugs that resolve to the same class keyword even if raw text differs (e.g., `MAOI` vs `MAOIs (risk...)`).

### UI / UX Outline (Interactions Page)
1. **Selector Panel**
   - Two comboboxes reusing `GlobalSearch` data to pick `SubstanceRecord`s (`Substance A` / `Substance B`).
   - Option to swap selections and a quick “Clear” action.
2. **Summary Header**
   - Show direct match status (`Safe data unavailable`, `Caution`, `Unsafe`, `Danger`) based on combined severity (danger outranks unsafe > caution).
   - Include pills for key classes matched (e.g., `Both warn about MAOIs`).
3. **Details Grid**
   - For each severity, render a three-column comparison card (Shared | Only A | Only B). Empty states explain when a severity has no entries.
   - Items link to the matched substance profile when `matchType === "substance"`; otherwise show raw text with any rationale preserved.
   - Optionally include hover details with the original raw string and source article citation snippet for editors.
4. **Interaction Insights (stretch)**
   - Highlight top overlapping drug classes across both selections.
   - Provide export (copy JSON / CSV) for harm-reduction sharing.

### Technical Implementation Steps (Future Work)
1. Refactor `InteractionGroup` type and `buildInteractionGroups` to emit enriched entries without breaking existing `InteractionsSection`. Provide a compatibility layer or migrate the component to the new shape.
2. Add `createInteractionIndex()` helper in `library.ts` that returns read-optimised maps for lookups, exposed via a new export (`interactionIndex`, `getInteractionsForSubstance(slug)`).
3. Implement comparison utilities in a new module (e.g., `src/utils/interactions.ts`) handling slug normalisation, severity precedence, and diffing.
4. Replace the placeholder in `App.tsx` for `view.type === "interactions"` with a dedicated page component under `src/components/pages/InteractionsPage.tsx`.
5. Build supporting presentation components under `components/sections/interactions/` (selectors, summary banner, results grid).
6. Ensure `GlobalSearch` can return lightweight options for both selectors without double-invocation; consider extracting a shared `useSubstanceOptions` hook.
7. Update `types/content.ts` and any downstream consumers to accommodate the new interaction item structure.
8. Document any new data assets (e.g., class keyword dictionary) in top-of-file comments and `AGENTS.md` if it affects contributor workflows.

## Edge Cases & Mitigations
- **Asymmetric data**: substances might reference classes the other lacks; diff UI should clearly show “no matching entry”.
- **Unknown strings**: keep raw fallback text, but flag them for future data grooming (e.g., add a “needs review” badge when matchType is `unknown`).
- **Multiple severities**: if both substances mention the same target with different severities, promote the higher severity in shared results but note the discrepancy in a tooltip.
- **Slug collisions**: two different phrases may normalise to the same slug; store additional hash (e.g., CRC of raw string) to disambiguate if necessary.

## Manual QA Ideas (post-implementation)
- Compare highly-connected pairs (e.g., `MDMA` + `LSD`, `Ketamine` + `Alcohol`) to ensure shared/unique buckets make sense.
- Verify class keyword matches by selecting a pair that should only overlap on classes (e.g., `LSD` + `Psilocybin` both warning about `MAOIs`).
- Test selections that should trigger direct cross-reference (e.g., `MDMA` caution list contains `LSD`).
- Confirm selectors, swapping, and mobile layout behave with long interaction lists.

## Open Questions
- Should we persist the last compared pair in the hash (e.g., `#/interactions?primary=mdma&secondary=lsd`) for shareable URLs?
- Do we want to treat interaction classes as first-class records editable via Dev Tools, or keep heuristics in code for now?
- How should we surface multi-target warnings (e.g., `MAOIs / SSRIs`)? Split into separate targets during normalisation, or display as-is under a combined slug?
- Will contributors need reporting to find unmatched (`matchType === "unknown"`) strings for data cleanup?
