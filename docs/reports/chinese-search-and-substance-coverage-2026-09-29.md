# Chinese search and substance coverage investigation

Historical investigation from search commit `1d11809e6`, before the current production layout and the later local generation review. Runtime and account findings describe that investigation only; they are not current release evidence. Removed skill references are preserved as historical pointers.

Investigated 2026-09-29 from IMG_4054 through IMG_4057, using four subagents. Source baseline: `main` at `5a577f1b4a5a22863cd52bbff7ad5a06cbefd647`, with existing unrelated working-tree changes preserved. Live findings below come from public HTTP reads and an explicit production PlanetScale SQL read against `disregardeverythingisay/dosewiki/main`. No application edits, production writes, generation, publication, or deployment were performed. This report is the only repository file added by this investigation.

## Findings and recommended order

| Issue | Finding | Implementation |
| --- | --- | --- |
| Returning to search after opening a result | Reproduced with the actual components and debounce timer. The outgoing search draft retains navigation authority. | Revoke the draft on same-tab result navigation and route departure; require draft ownership before automatic navigation. |
| Chinese substance names | The live Chinese manifest has 267 substances and zero Han-character substance names or aliases. | Add reviewed Chinese identity aliases through the existing article schema. |
| Localized search consistency | The browser ranks localized entries; API and SSR rank English entries first. Chinese matches can disappear when server refinement returns an empty list. | Use the same locale-aware index and matching rules for all search surfaces. |
| Mixed-script matching | ASCII compact normalization drops Chinese text and creates unrelated numeric/Latin matches. | Preserve Unicode letters/numbers or restrict compact matching to supported inputs, with explicit mixed-script tests. |
| CAS lookup | CAS is stored and displayed but never enters the search index. | Carry a typed exact identifier through the existing server/browser search pipeline. |
| Missing substance coverage | MK-801 and atomoxetine exist as URL-only low-priority records with stored source text. Sertraline already exists publicly. Amantadine and venlafaxine are absent. | Draft the two eligible records; repair sertraline discovery; prepare source-backed intake for the two absent drugs. |

Fix the navigation race first. Then fix localized index parity and Unicode matching, followed by a bounded Chinese alias curation pass. Exact lookup of existing CAS values is a separate small slice. Content drafting can proceed independently, but publication and visibility promotion are separate steps.

## 1. Search navigation race

The report describes a result opening, followed by a return to search when pending search finishes. A deterministic temporary harness exercises the actual `GlobalSearch`, `LiveSearchResultsPage`, `FocusedSearchResultsPage`, `SmartLink`, and debounce hook. The Next Link routing boundary and manifest loading are stubbed to control timing. No suggestion HTTP response is necessary to reproduce the symptom.

Three cases fail against current source: pointer selection with delayed route chrome, the article route committing in the same update as the debounced draft, and keyboard selection with delayed route chrome. An article route committing comfortably before the timer settles passes.

The causal path is in [GlobalSearch.tsx](../../src/components/common/GlobalSearch.tsx):

- `handleChange` arms `pendingLiveNavigationRef` at lines 359-369.
- Outside pointer handling ends editing but does not cancel that pending navigation at lines 202-216.
- Route synchronization ends editing and clears the visible query, but does not synchronously cancel pending navigation at lines 175-189.
- The navigation effect only requires active editing for an empty query at lines 257-259. A nonempty stale draft can still call a search navigation at lines 261-276.

A first disposable probe requiring active editing stops the race, but also prevents ordinary background taps from settling a pending search. That broad one-line guard was rejected. Clearing the pending flag only on article route commit fixes one race but leaves the delayed-header case.

The refined disposable candidate revokes pending draft ownership when an ordinary same-tab link is activated outside the search input, clears ownership on non-search route arrival, and requires ownership before automatic navigation. It preserves ordinary background-pointer settling and excludes modifier clicks, new-tab links, downloads, and same-page anchors from cancellation. The final harness is 3 failed / 4 passed against original source, then 7 / 7 passed against the refined candidate. The 26 existing tests across `GlobalSearch`, live results, suggestions, and manifest hooks also pass against that candidate.

The implementation should cancel outgoing navigation intent at the real result-navigation seam; an explicit navigation-intent callback is an alternative to document click capture if button-driven destinations must participate. Retain explicit submit/clear navigation and background-tap settling. Add real-timer-seam regressions for pointer and keyboard result selection, simultaneous route/timer completion, continued typing, late HTTP completion, and back navigation. Existing tests mock debounce as immediate, so their green result alone does not cover this race.

Temporary proof artifacts: `/tmp/dosewiki-search-race-debug/search-race.test.tsx`, `vitest.config.ts`, `regression.config.ts`, and `GlobalSearch.proposed.tsx`. The clone is evidence of a fix direction, not a product change or deployed fix.

From `/private/tmp/dosewiki-search-race-debug`, run the repository's `node_modules/.bin/vitest run --config ./vitest.config.ts` for the failing baseline. Prefix with `SEARCH_RACE_PROBE=candidate-clone` for the candidate. The corresponding `regression.config.ts` runs the four existing suites from the repository root. Full commands and controlled-boundary details are in `/tmp/dosewiki-search-race-debug/REPORT.md`.

## 2. Multilingual search

### Live evidence

`https://zh.dose.wiki/api/search-manifest?locale=zh-Hans` returned 2,871 entries, including 267 substances. None of those substance labels or aliases contained Han characters.

| Query | Live suggestion API result |
| --- | --- |
| `ketamine` | Ketamine |
| `氯胺酮` | No results |
| `caffeine` | Caffeine |
| `咖啡因` | No results |
| `sertraline` | Sertraline |
| `舍曲林` | No results |
| `geometry` | Geometry, displayed as `几何结构` |
| `几何结构` | No results, although the downloaded manifest matches Geometry |

These checks used `locale=zh-Hans` and the public suggestions endpoint. The stored localized Geometry label is verified in the manifest; this does not establish that it was human approved.

The repository matcher also reproduces two false positives against the live manifest: `不存在LSD` finds LSD, while `咖啡因5` finds 5-APB, 5-MAPB, and other 5-prefixed substances. A hypothetical `氯胺酮` alias added only to an in-memory clone makes Ketamine the first exact result.

### Cause and implementation

[corpora.mjs](../../scripts/translation/corpora.mjs) excludes substance title and identification from translation at lines 31-42. [locales.mjs](../../scripts/translation/locales.mjs) keeps substance names in Latin script. Whole-prose retranslation therefore cannot solve name lookup.

[publicLibrary.ts](../../lib/data/publicLibrary.ts) builds a localized manifest index at lines 370-411, explicitly preserving substance names and aliases. Its suggestion path instead queries the canonical index at lines 419-440 and only localizes already-selected results. Chinese SSR search uses that path too. [useGlobalSearchSuggestions.ts](../../src/components/common/useGlobalSearchSuggestions.ts) replaces local results with a successful server response at lines 183-190, including an empty response.

The smallest complete change is:

1. Keep canonical English titles and slugs. Add sourced, human-reviewed Chinese names to existing `identification.alternative_names`. These already feed aliases in [contentBuilder.ts](../../src/data/builders/contentBuilder.ts). This supports cross-language identity lookup without a schema migration.
2. Rank API suggestions and localized SSR through the same localized index used by the manifest. Keep canonical names available and retain server keyword breadth. Verify ordering as well as presence.
3. Fix [searchMatching.ts](../../src/data/builders/searchMatching.ts), lines 74-83: compact identity keys currently discard all non-ASCII characters. Make compact and report-link normalization Unicode-safe, or disable compact matching for unsupported scripts. Review word-boundary handling too. Specify full-width input behavior deliberately.
4. Curate Simplified and Traditional aliases explicitly. Current NFD folding does not map them to each other. Pinyin, locale-specific preferred labels, and informal slang are separate requirements.
5. Preserve public visibility gates. Alias additions must not reveal URL-only records in public search.

The screenshot's `晚安` is an unverified colloquial identity claim. Do not add it automatically. It needs sourcing, ambiguity review, and an editorial decision. The initial alias pass should cover named public drugs such as sertraline plus a defined set of existing frequently searched drugs, with measured coverage.

The existing glossary collects effects, classes, labels, and other vocabulary rather than substance identities. Postgres approved glossary rows are authoritative; exported JSON is not runtime alias data. A dedicated reviewed locale-alias registry is justified later if locale-specific display names, multiple synonyms, slang provenance, or translator-only identity editing are needed. Neither a semantic search service nor corpus-wide retranslation is needed for the reported known-name gap.

### Freshness and verification

Test English and reviewed Chinese names against server matching, browser manifest matching, the API, and SSR. Test `几何结构` surviving delayed refinement and the mixed-script negatives above. Preserve English ranking, hidden-record exclusions, punctuation variants, and accepted Traditional aliases.

The manifest version and ETag already depend on canonical/localized data. Derived search caches last ten minutes and library caches one hour; normal article publication invalidates dependencies. Browser manifest/result caches are process-lifetime maps. A newly edited alias will not automatically appear in an already-open document merely because the ETag changes. Add bounded refresh behavior if that freshness is part of acceptance.

Temporary evidence and repeatable matcher harness are under `/tmp/dosewiki-multilingual-live-20260929/`. Run `bun /tmp/dosewiki-multilingual-live-20260929/unicode-harness.ts` to reproduce the recorded matching behavior without mutations. A production-shaped build and live browser checks are required when implementation is released.

## 3. CAS lookup

The live [Adrafinil article](https://dose.wiki/adrafinil) displays `63547-13-7`. Name search finds it; CAS search returns no results on English and Chinese APIs. The live browser manifest does not contain its CAS value. This verifies missing lookup behavior, not the chemical correctness of the stored assignment.

Fresh production coverage is 127 nonempty CAS fields out of 577 articles, representing 126 distinct numbers. All 127 pass format/checksum checks. `52237-19-1` is stored on both `f-phenibut` and `fluorophenibut`. Passing a checksum does not prove chemical assignment or registry existence.

### Existing identifiers

The authored identification schema in [classification.ts](../../src/schema/substance/classification.ts) stores one optional string `cas_number`. The public library input already retains identification and its CAS field. The omission begins when [contentBuilder.ts](../../src/data/builders/contentBuilder.ts) constructs a `SubstanceRecord`, then [search.ts](../../src/data/builders/search.ts), lines 447-482, copies only names, aliases, categories, and mechanisms.

Add a typed optional identifier field through `SubstanceRecord`, `SearchIndexSubstanceInput`, `SearchEntry`, the shared matcher, and [searchManifest.ts](../../src/data/builders/searchManifest.ts). Preserve it through locale overlays and include it in input hashing/manifest cache identity. Existing scalar lookup needs no SQL index or migration.

Recognize a CAS query and match the validated identifier exactly. Normalize harmless whitespace/hyphen formatting; support hyphenless input only under an explicit validated parsing policy. Do not fuzzy-match digits, infer a different identifier, or use generic text aliases as the chemical model. Return canonical article links and a matched identifier when useful. Return every publicly eligible duplicate candidate rather than choosing the first row. Keep existing visibility exclusions.

### Salts and other forms

[CAS registry documentation](https://www.cas.org/cas-data/cas-registry) identifies a specific substance with each Registry Number. [CAS check-digit guidance](https://www.cas.org/training/documentation/chemical-substances/checkdig) provides syntax and transcription checks. The design implication is to preserve each form's chemical identity.

If alternate-form coverage is added, use a sourced relation containing the number, form label, relationship to the article, and reference. Keep the existing primary CAS display compatible. Separate salt/free-base, stereoisomer, hydrate, or unspecified forms only where inspected evidence supports the relation. Prefer an existing exact-form article, and show multiple labeled candidates when unresolved. Automatic redirects require a reviewed unique target. This investigation imported no alternate-form mapping.

Any future schema/model changes must start in authored inputs and their producers. Do not hand-edit generated Postgres schemas/runtime files or `SubstanceIndex.json`. Exact scalar lookup is a search change; new sourced form data is a separate editorial/model slice.

Verification should cover API/manifest parity in both locales, exact matches, formatting and bad-checksum cases, duplicate results, missing identifiers, unchanged name rankings, hidden-record exclusions, and cache version changes.

## 4. Missing drugs and sectionmaxxing readiness

The full production read contained 577 records. Names, slugs, and identification aliases were inspected, rather than relying on public search or filtered exports.

| Requested drug | Canonical record | Production visibility/review | Stored sources with text | Sectionmaxxing |
| --- | --- | --- | --- | --- |
| MK-801 / dizocilpine | `mk-801`, numeric ID 454 | `low`, no index categories, review needed; direct URL works | 2: Wikipedia, TripSit factsheets | Eligible |
| Atomoxetine | `atomoxetine`, numeric ID 210 | `low`, no index categories, review needed; direct URL works | 3: DrugBank, Wikipedia, TripSit factsheets | Eligible |
| Sertraline | `sertraline`, numeric ID 559 | `normal`, human review completed; public search works in English | 4 | Ineligible under current scope |
| Amantadine / 金刚烷胺 | No matching record | English and Chinese direct routes return 404 | No matching source document | Needs new source-backed intake |
| Venlafaxine | No matching record | English and Chinese direct routes return 404 | No matching source document | Needs new source-backed intake |

MK-801 and atomoxetine are URL-only low-priority records, with no `hidden` category. Both satisfy the actual [isRegenerationEligible contract](../../lib/sectionGeneration/contract.mjs). Their English and Chinese routes return HTTP 200 with the expected article heading. Sertraline's routes also return 200; `舍曲林` failing to search is a discovery issue.

### Evidence available for drafting

Both eligible records currently have only `harm_potential` among the five owned narrative sections. Each has an existing substantive harm excerpt: approximately 507 words for MK-801 and 625 for atomoxetine. The other four section quote records are absent.

Stored source text is not merely a URL list:

| Drug | Source | Approximate substantive words |
| --- | --- | ---: |
| MK-801 | Wikipedia | 1,422 |
| MK-801 | TripSit factsheets | 72 |
| Atomoxetine | DrugBank | 2,523 |
| Atomoxetine | Wikipedia | 2,267 |
| Atomoxetine | TripSit factsheets | 45 |

The actual `substantiveExcerpt`, `sourceBlocks`, and eligibility helpers validate the source records. Applying the engine's evidence classification leaves all five tasks pending for each drug because source text is available. This permits extraction/synthesis attempts; it does not guarantee that every section has sufficient evidence for new prose.

Atomoxetine text provides material relevant to summary, pharmacology, harm, history, and discontinuation-related discussion. MK-801 text includes preclinical dependence/reinforcement material, but does not establish a reliable human tolerance timeline. Do not turn those findings into unsupported human timelines or dosing guidance. Extraction and parent review must distinguish supported content, thin evidence, and unavailable preservation. All five live generation prompts are populated.

The normal campaign ranks distinct populated registered sources descending. Within these two drugs, atomoxetine ranks before MK-801, although the full cohort determines actual dispatch order. The fixed ranking count is an availability metric, not a quality verdict.

### Workflow and practical limits

Use the [sectionmaxxing skill](../../.agents/skills/sectionmaxxing/SKILL.md) for the five owned fields: summary, pharmacology, tolerance, harm potential, and history/culture. Preserve dosage, duration, legality, reference pool, identity, priority, index categories, layout placement, and editorial metadata. Generation does not make either drug searchable or human reviewed.

The canonical campaign directory is absent in this checkout, and the isolated worker runtime's dependencies are not installed. Local `.env.local` also lacks the native Postgres target and scoped source-read credential. No inference/account preflight or campaign initialization was attempted. A future run needs the explicit native Postgres reader target and scoped source-read credential, isolated Sol-low transport preflight, frozen inputs, extraction where quotes are missing, and parent review. Read-only SQL evidence is not a substitute for that runtime preflight.

The current [publication reference](../../.agents/skills/sectionmaxxing/reference/publication.md) states: "Publication remains closed for this workflow pending separate authorization under the current operator-write allowlist." This investigation evaluates drafting readiness only. Approved publication, cache/site verification, and deliberate visibility promotion remain later steps. Do not downgrade public sertraline merely to bring it into the low-priority generation workflow.

Amantadine and venlafaxine need canonical records plus inspectable source documents before this skill can operate on them. Resolve identifiers and Chinese names from inspected authoritative sources, ingest through the existing guarded editorial/source path, and then evaluate draft scope. Their screenshot-reported prominence in Chinese communities is useful user feedback, not verified population-level evidence.

## 5. Psychiatric medication coverage

DoseWiki already has antidepressant and antipsychotic taxonomy. The authored psychoactive layout includes sertraline among antidepressants at [psychoactiveIndexManual.json](../../data/substances/psychoactiveIndexManual.json), lines 439-472. Expanding useful medication coverage therefore does not require treating every drug as recreational or redesigning the site taxonomy.

Prioritize the two existing source-backed stubs, sertraline name discovery, and the two specifically requested absent medicines. Keep therapeutic context, nonmedical-use evidence, and harm information faithful to sources. Broader prioritization should use measured search failures and editorial evidence rather than assuming all Chinese readers share the screenshot author's experience. Content generation and listing promotion are separate decisions.

## Evidence boundaries

- Public HTTP behavior is verified live as of this investigation. Source findings refer to the stated checkout baseline; no release equivalence is assumed.
- The navigation race and proposed guard are verified in a deterministic component harness, not in an independently captured live iPhone session.
- Substance existence, priorities, stored source availability, CAS coverage, and prompt presence were inspected through `pscale sql dosewiki main --org disregardeverythingisay --role reader --format json`, with SELECT-only queries. No raw credential was read or printed, and no database state was changed.
- Stored evidence availability is proven. Factual support for unseen generated candidates and human acceptance are not claimed.
- Temporary raw evidence is kept under `/tmp`; this report records the conclusions and repeatable seams without credentials or full source-body copies.
