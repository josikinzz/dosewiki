# Content migration log — 2025-10-12

## Overview
- Collated narrative text from `content` into `drug_info.notes` for 40 substances and cleared redundant markdown headers.
- Added concise summary paragraphs where notes lacked context and appended specific cautions from the legacy content.
- Verified no remaining `content` fields retain unique prose via a normalization script.

## Substance updates
- 1,4-Butanediol: cleared duplicate content block already covered by notes.
- 2-AI, 2-MA: prepended history and caution summaries; content cleared.
- 2-Me-DMT: removed placeholder content stub.
- 2-Methylethcathinone, 2C-F, 3-Fluoro-PCP, 3-Fluoro-PiHP, 3C-P, 4-FEA, 4-MEPPP: added high-level effect summaries before existing technical notes.
- 4-PrO-DMT, Fluminorex, Furanylfentanyl, Grapefruit, MDMPEA: removed duplicate or citation-heavy content; notes already captured details.
- 5-MeO-DPT: inserted legal/safety reminder from content.
- 6-APB: cleared redundant content; notes already covered salt conversion and spacing guidance.
- 6-MAM: added description of metabolite behaviour and overdose context.
- ALEPH-2, BOH-2C-B, Cannabis, Carisoprodol, Dehydroxyfluorafinil, Desomorphine, Ephenidine, Fenethylline, Fluclotizolam, Flumazenil, Memantine, Methylenedioxyphenmetrazine, NEP, O-PCP, Phenylpropylaminopentane, Prolintane, Pyrovalerone: added concise summaries or body-load cautions from the legacy content.
- MD-PiHP, MD-prolintane: appended harm-reduction callouts (hyperthermia escalation, redosing risk).
- Tilmetamine: rewrote notes to integrate potency warnings and handling guidance; cleared duplicated content block.
- Ziprasidone: appended pharmacokinetic and risk modifiers from content bullets.

## Verification
- Python diff check confirmed zero substances still have divergent `content` prose after cleanup.
- `npm run build:inline` completed successfully post-schema update.

## Schema update
- Removed the legacy `content` field from every article entry in `src/data/articles.json` now that narrative copy lives exclusively in `drug_info.notes`.
- Updated Dev Tools drafting helpers and form UI to drop the `Overview` textarea and eliminate `content` from draft payloads.
- Adjusted change-merging logic to strip any lingering `content` keys when saving edits.
