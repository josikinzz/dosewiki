# Dev Tools Article Editor & Creator Alignment Report

## Purpose
Document how the in-app substance pages are structured today, evaluate the Dev Tools article editor/creator flows against that presentation, and propose a step-by-step plan so both drafting surfaces mirror the live article hierarchy, terminology, and visual rhythms.

## Reference: Live Substance Page Flow
- **Hero header** – Name, aliases badge rail, category badges, molecule stub (`Hero`), driven by `buildSubstanceRecord`.
- **Dosage & Duration** – Route selector, dosage table, duration table, units note (`DosageDurationCard`).
- **Chemistry & Pharmacology** – Multi-column chips for chemical/psychoactive classes, mechanism badges, half-life (`InfoSections`).
- **Subjective Effects** – Badge cloud for experiential keywords (`SubjectiveEffectsSection`).
- **Addiction Potential** – Single rich-text summary (`AddictionCard`).
- **Interactions** – Severity-bucketed lists with rationale (`InteractionsSection`).
- **Tolerance** – Timeline cards plus cross-tolerance note (`ToleranceSection`).
- **Notes** – Markdown-rendered guidance (`NotesSection`).
- **Citations** – Source list with outbound links (`CitationsSection`).

_Source: `src/App.tsx` lines 455-493, `src/components/sections/*.tsx`.

## Current Editor/Creator Form Flow
Shared component: `ArticleDraftFormFields` (`src/components/sections/ArticleDraftFormFields.tsx` lines 53-507).

Rendered sections (in order):
1. **Core metadata** – Title, numeric ID, index category.
2. **Drug identity & lookup** – Display name, chemical name, alternative name, search URL.
3. **Mechanisms & categories** – Chemical class, psychoactive class, mechanism (textarea).
4. **Dosage guidance** – Routes, units, dose ranges (duration omitted here).
5. **Interaction risks** – Dangerous/unsafe/caution lists.
6. **Subjective effects** – Freeform list textarea.
7. **Duration & tolerance** – Half-life, addiction potential (input), notes (textarea), duration fields, tolerance fields, cross tolerances list.
8. **References** – Citation name/url pairs.

The same layout powers both the edit tab (UI mode) and the create tab (`DevModePage.tsx` lines 1246 & 1414).

## Key Misalignments & UX Friction Points
- **Order mismatch** – Duration inputs sit far below the dosage routes, even though the article card shows dosage and duration together. Addictive summary and notes are buried within the “Duration & tolerance” block, despite appearing as their own sections in articles. (`ArticleDraftFormFields.tsx` lines 368-447).
- **Missing categories control** – `ArticleDraftForm` tracks `categoriesInput`, but the UI never renders it, so editors cannot manage hero/category badges that appear on live pages. (`ArticleDraftFormFields.tsx` vs. `articleDraftForm.ts` lines 53-79 & 438).
- **Half-life placement** – Half-life is captured under “Duration & tolerance” yet visualized within the Chemistry & Pharmacology card. Editors must mentally map this inconsistency.
- **Addiction summary input type** – Dataset strings are paragraph-length, but the field is a single-line `<input>`, making rich copy hard to author (`ArticleDraftFormFields.tsx` lines 386-395).
- **Notes positioning** – Article-level Notes render near the end of the page; in the editor they're tucked mid-section beside kinetic data, risking oversight.
- **Terminology drift** – Section headings (“Core metadata”, “Drug identity & lookup”, “Interaction risks”) don't match live surface titles, forcing context switching while comparing UI vs. dataset output.
- **Visual hierarchy** – The form groups multiple conceptually distinct blocks (Notes, Duration, Tolerance) inside one panel, creating tall, hard-to-scan sections that diverge from the concise cards users see on substance pages.
- **No preview or hint of hero output** – Editors can't see how name/alias/category decisions translate into the hero badges without referencing the live page elsewhere.

## Alignment Plan

### Phase 1 — Restructure Section Architecture
1. **Reorder form groups to mirror article flow**
   - Section 1: “Overview” → Title, Display name, Alternative names, Aliases guidance, Article ID, Index category, Categories list, Search URL.
   - Section 2: “Dosage & Duration” → Route controls + global duration inputs, reposition duration cards beside routes, surface units note guidance.
   - Section 3: “Chemistry & Pharmacology” → Chemical class, Psychoactive class, Mechanism (`textarea`), Half-life, with helper copy about semicolon separation for mechanism chips.
   - Section 4: “Subjective Effects” → Existing textarea with chips preview (optional stub) and guidance on alphabetical ordering.
   - Section 5: “Addiction Potential” → Promote to dedicated `textarea` block with microcopy reminding editors this feeds the standalone card.
   - Section 6: “Interactions” → Reuse existing dangerous/unsafe/caution inputs; align heading with live section title.
   - Section 7: “Tolerance” → Tolerance timing fields + cross tolerances list; add context text referencing the card labels.
   - Section 8: “Notes” → Standalone markdown-support reminder.
   - Section 9: “Citations” → Unchanged, but rename labels to “Citation label” + “URL” to match article output.

2. **Expose category editing**
   - Add a multiline input bound to `categoriesInput`; update helper text explaining each line becomes a hero badge + index tag.

3. **Input ergonomics**
   - Switch `addictionPotential` to `textarea` with min height.
   - Offer optional inline character counts for long fields (mechanism, notes, addiction) to encourage concise copy.

### Phase 2 — Shared UX Enhancements
4. **Heading & helper copy audit**
   - Rename section headers to match live card titles exactly (“Dosage & Duration”, “Chemistry & Pharmacology”, etc.).
   - Update microcopy to reference the corresponding surface (e.g., “Appears under the Addiction Potential card”). Ensure typography follows `dosewiki-visual-style-guide.md` (uppercase label + fuchsia headline).

5. **Preview cues**
   - Consider lightweight previews for hero badges and mechanism chips (e.g., list below inputs using the same chip component). Keep optional but scoped for this phase if time allows.

### Phase 3 — Code & Data Integrity Updates
6. **Refactor `ArticleDraftFormFields`**
   - Split into logical subcomponents (OverviewFields, DosageFields, etc.) for readability.
   - Update layout (`space-y`, grid columns) to reduce scroll length and mirror respective article card proportions.

7. **Update controller typing**
   - Ensure new `categories` field hooks into `useArticleDraftForm`; add list parsing guidance akin to other list fields.

8. **Verify downstream usage**
   - Confirm `buildArticleFromDraft` still emits the expected schema once categories are editable.
   - Ensure serialization order (routes/duration) remains consistent so `DosageDurationCard` receives unchanged data.

9. **Housekeeping**
   - Adjust any Dev Tools notices or validation states referencing old section names.
   - Update `notes and plans/Agent.md` if new editing conventions emerge.

### Phase 4 — QA & Follow-up
10. **Manual QA script**
    - Populate each section via UI, switch to JSON view to confirm parity.
    - Load existing dataset entries (e.g., 3-MeO-PCP) to ensure hydration places each value in the new section.
    - Validate categories field influences hero badges on live build (run `npm run build` + mandatory `npm run build:inline`).

11. **Regression monitoring**
    - Smoke test article view to confirm section output order unchanged.
    - Check Dev Tools change log/changelog exports for unaffected formatting.

## Open Questions & Dependencies
- Should the hero preview surface alias vs. category chips before embarking on the full visual overhaul?
- Do we need in-form validation for category slugs (matching `library.ts` expectations), or will free text suffice initially?
- Are there additional hero-surface fields (subtitle, molecule placeholder) worth exposing, or are they intentionally derived?

## Next Steps
- Socialize this plan with stakeholders to confirm desired section order and preview scope.
- Once approved, implement phases sequentially, validating after each phase with `npm run build` and `npm run build:inline`.
