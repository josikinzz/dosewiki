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

- Follow [the run contract](pi-citation-run-contract.md) for marker-only fields,
  exact text preservation, inspected evidence, immutable inputs and isolation.
- Before any remote export or separately approved apply dry-run/write, follow
  [data credentials](data-credentials.md). Postgres is authoritative; freeze,
  intent, exact-target and confirmation gates remain mandatory.
- Workbench output is a local draft, not publication authority. Preserve lineage,
  source provenance and review evidence at their consumer-owned paths.

## Contextual correction safeguards

For a separately approved reference correction, inspect
`lib/citations/referenceIdentity.mjs` for deterministic IDs and provenance merging.
Validate changed sources without forcing unrelated legacy collisions to change;
new collisions remain invalid. A deliberate source-ID cutover removes the old ID
and moves every article marker to the retained source. Preserve metadata provenance
only for one compatible prior identity, never a different or ambiguous source.

Instrument-only edits validate changed citation fields, not untouched notes.
Status, canonical status, designation or citation-needed changes recheck all country
citation fields. Never relabel medical/research sources as legal evidence.
Retain revision evidence; re-review only evidence tied to changed fields/reference
IDs (legacy pathless evidence falls back to its section). Unused-reference metadata
correction must not decertify unrelated claims. Publication binds exact approved
values, current revision hash and recovery snapshot under the guarded ceremony.

## Current command source

`package.json` owns executable `citations:*` commands. The target, write inventory,
and confirmation implementations are linked from [data credentials](data-credentials.md).

## Completion

Draft branches finish only when the run contract's deterministic checks pass and
the immutable review artifacts record `needs_review`. A local-proposal draft has
no apply dry-run, apply or promotion capability. For a reviewed apply-bound live
task, a separately authorized editor may enter the guarded Postgres apply dry-run
branch. A clean dry-run does not authorize a write or another target.
