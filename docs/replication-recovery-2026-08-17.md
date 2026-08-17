# Replication recovery release — 2026-08-17

This release imported a reviewed PsychonautWiki and pre-2022 Effect Index
recovery corpus into the production Convex deployment `glad-minnow-656`.

- 120 new image, GIF, and video records were inserted into `replications`.
- 3 new audio examples were added through the existing
  `subjectiveEffects.audio_replications` publication path.
- 4 existing records received evidence-backed title or artist corrections.
- Every uploaded asset was hash-checked, every video was kept below the
  ten-minute limit, and every database write was verified by production
  readback.
- Ambiguous candidates and records without recoverable media were deliberately
  excluded from the production import.

The guarded correction script and its reviewed evidence plan live in
`scripts/replications/apply-psychonautwiki-metadata-corrections.mjs` and
`scripts/replications/data/psychonautwiki-existing-metadata-corrections.json`.
