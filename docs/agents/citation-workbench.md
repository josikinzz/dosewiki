# Citation workbench

Use this file only to choose a citation branch. The executable OMP sequence and
artifact contract live in [pi-citation workflow](pi-citation-workflow.md) and
[pi-citation run contract](pi-citation-run-contract.md). Completed repair
campaign counts and operational diaries are private history, not active
instructions.

## Branches

- **Active OMP branch:** Use one explicit substance slug or one immutable local
  proposal. Run the exact invocation in `pi-citation-workflow.md`. OMP uses the
  named `citation-section-worker` and `citation-article-wide-worker` and stops at
  a finalized `needs_review` candidate.
- **Optional external Claude branch:** Enter only when the user explicitly asks
  for that transport or its queue orchestration. Keep it inside the external
  workbench and never run it against the same attempt as OMP.
- **Apply branch:** Enter only for a reviewed, apply-bound live-task draft after
  explicit user approval. A local-proposal draft is permanently non-promotable.

## Hard invariants

- PlanetScale Postgres is authoritative for live-task export, dry-run, and
  write. Set `DATA_BACKEND=postgres`, bind `TARGET_POSTGRES_URL` explicitly,
  pass `--allow-remote`, and set
  `POSTGRES_IMPORT_CONFIRM=aws-us-east-1-2.pg.psdb.cloud`.
- Run `npm run postgres:check-env-isolation` and the workflow's dry run before
  any separately approved write.
- Every write retains the script's intent token, `--write`, operation-specific
  confirmation, `--confirm-write`, and
  `--expected-deployment=aws-us-east-1-2.pg.psdb.cloud/postgres`.
- `DATA_WRITES_FROZEN=1` forbids writes. Do not unset or bypass it.
- Workbench output remains a draft until this repository adapts, validates,
  reviews, and explicitly writes it.
- Citation drafts are marker-only. Removing `[cite:reference-id]` markers must
  restore the original text exactly.
- The citable surface is exactly `summary`, `pharmacology`, `tolerance`,
  `harm_potential`, `history_culture`, and `legality`. Keep every other article
  section unchanged.
- Preserve generated inputs, proposal lineage, source provenance, and review
  evidence at their consumer-owned paths. Do not publish run histories.

## Contextual correction safeguards

Article edits validate changed source records without forcing unrelated legacy
collisions to change. New collisions remain invalid. A deliberate source-ID
cutover must remove the superseded ID and move every article marker to the
retained source; adding a second canonical ID for the same source is rejected.
When a cutover has one compatible prior source identity and removes its old
ID, admission preserves that source's existing metadata provenance. It does
not transfer provenance from a different or ambiguous source.

Generate new IDs with `deterministicReferenceId` in
`lib/citations/referenceIdentity.mjs`; it retains the full hash instead of a
collision-prone prefix. Existing canonical IDs stay unchanged unless the
approved correction explicitly replaces them.

Instrument-only edits validate changed citation fields, not untouched notes.
Status, canonical status, designation, or citation-needed changes recheck all
country citation fields. Never relabel medical or research sources as legal
sources to pass this gate.

Revision history retains prior evidence for audit. Only evidence tied to a
changed article field or reference ID is marked for re-review; legacy evidence
without a field path falls back to its section.
Correcting an unused reference's metadata must not decertify unrelated claims.
Production publication still requires the explicit target, approved exact
values, current revision hash, recovery snapshot, and guarded write ceremony.

## Current command source

`scripts/lib/data-client.ts` selects Postgres and enforces the remote-target
guard. `scripts/lib/production-write-command.mjs` requires an explicit writer
target, matching deployment fingerprint, and exact confirmation phrase.
`package.json` maps the `citations:*` command names to their implementations.
Historical filenames and `CONVEX_ADMIN_TOKEN_*` intent-token names stay exact
because the compatibility layer consumes them.

## Completion

The selected attempt is complete when the run contract's deterministic checks
pass, review artifacts exist, and the Postgres apply dry run is clean. Stop
without writing or selecting another target unless the user explicitly approves
that exact next action.
