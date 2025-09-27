# Content vs Notes Field Audit

## Key Takeaways
- `content` previously lived at the top level of each record in `src/data/articles.json` as markdown (title + category heading + body).
- `drug_info.notes` is populated for every record and remains the only field surfaced in the UI via `src/data/contentBuilder.ts:505` → `NotesSection`.
- After normalizing duplicated entries (`scripts/strip-content-headers.mjs`) and promoting unique summaries into `notes` (`scripts/merge-content-into-notes.mjs`), the standalone `content` field was removed from all 503 articles.
- The application and supporting scripts now rely entirely on `drug_info.notes`, eliminating unused or redundant payload in the JSON.

## Data Breakdown
| Segment | Count | Share |
| --- | --- | --- |
| Total substances | 503 | 100% |
| Records with `content` before cleanup | 410 | 81.5% |
| Records missing `content` before cleanup | 93 | 18.5% |
| Records with `content` after cleanup | 0 | 0% |

Notes now include any overview copy that once lived in `content`, ensuring the hazard card renders the full context without redundant fields in the dataset.

## Downstream Usage
- `contentBuilder` pulls every UI surface from `drug_info` fields and ignores the root-level `content` altogether. The `notes` string is normalized by `cleanString` and stored on `SubstanceContent.notes` (`src/data/contentBuilder.ts:505-517`).
- `NotesSection` now pipes the string through `react-markdown` with GFM + soft-break support (`src/components/sections/NotesSection.tsx`), so bullet lists, bold markers, manual line breaks, and the newly added summary paragraphs render correctly.
- Repo-wide search confirms there are no imports or helpers that read `article.content`; even the data update scripts under `scripts/` touch only `drug_info` members.

## Qualitative Patterns
- **Duplicate markdown (resolved):** Former duplicates such as 3-Cl-PCP and Ethylphenidate now store just the shared hazard copy, with line breaks preserved.
- **Overview vs. detailed notes:** Fifty-one substances carry a shorter overview paragraph in `content` while `notes` hold richer clinical or harm-reduction detail. Examples include 2-AI, Furanylfentanyl, Cannabis, and 1,4-Butanediol. The UI currently exposes only the longer `notes` prose.
- **Incomplete stubs (resolved):** Three records (`Canket`, `Diazepam`, `Dextromethorphan`) previously stopped at the heading; the cleanup script now replaces them with the full `notes` text.

### Entries Where `content` Differs from `notes`
1,4-Butanediol • 1B-LSD • 2-AI • 2-FMA • 2-MA • 2-MEC • 2-Me-DMT • 25CN-NBOH • 2C-F • 2C-TFM • 3-Fluoro-PCP • 3-Fluoro-PiHP • 3C-P • 4-Bromomethcathinone • 4-Chloromethamphetamine (4-CMA) • 4-Fluoroethamphetamine (4-FEA) • 4-MEPPP • 4-Pro-DMT • 5-MeO-DPT • 6-APB • 6-MAM (6-Monoacetylmorphine) • ALEPH-2 • BOH-2C-B • Cannabis • Carisprodol • Crack (Cocaine) • DPP-26 • Dehydroxyfluorafinil • Desomorphine • Ephenidine • Fenethylline • Fluclotizolam • Flumazenil • Fluminorex • Furanylfentanyl • Grapefruit • Homarylamine (MDMPEA) • Lamotrigine • MD-PiHP • MD-Prolintane • Memantine • Methylenedioxyphenmetrazine • N-Desethylprotonitazene (NDP) • N-Ethylpentedrone (NEP) • O-PCP • PPAP • Prolintane • Pyrovalerone • Sernyl • Tilmetamine • Ziprasidone

## Recommendations
- Keep `notes` as the authoritative hazard summary now that markdown rendering supports structured formatting out of the box.
- Use `scripts/strip-content-headers.mjs` in future imports to avoid reintroducing redundant headings, and run `scripts/merge-content-into-notes.mjs` when new overview paragraphs need to be promoted into notes.
- Remove `content` fields from new datasets (or rerun the cleanup commands) so the payload stays consistent.
- For divergent `content` entries, decide whether to migrate their overview copy into new UI surfaces or remove the field entirely once that data has a destination.

