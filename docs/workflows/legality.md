# Legality workflow

Legality research produces a run-local draft per substance and never writes to
production on its own. The vocabulary (Legality Research Run, Cite Pass,
Discovery Pass, Primary Legal Source, Legality Draft, and the rest) lives in the
[glossary](../glossary.md#legality-research-language); the canonical status
values are fixed by [ADR 0002](../adr/0002-canonical-legal-status-vocabulary.md)
and `src/schema/substance/legalStatuses.ts`.

## Commands

`package.json` owns the executable `legality:*` commands:

| Command | Purpose |
| --- | --- |
| `npm run legality:export` | Export one substance's run packet for research |
| `npm run legality:validate` | Validate a draft (fails on voice, status, and designation violations) |
| `npm run legality:apply` | Guarded dry run or write of a validated draft |
| `npm run legality:cite` | Guarded citation application for existing country rows |
| `npm run legality:audit-subsections` | Read-only audit of live country subsections |
| `npm run legality:audit-voice` | Report voice violations per row and field from a subsection audit |
| `npm run legality:build-repair-drafts` | Fold reviewed repair proposals into drafts |

Every remote read or dry run follows [data credentials](../operations/data-credentials.md)
first. `legality:apply` and `legality:cite` reach Postgres mutations only with
the complete write ceremony from that document; a clean dry run authorizes
nothing.

## Reader register rule

Reader-facing fields of a `legality.countries` entry (`notes`, `designation`,
`instrument`, `status`, and `usStatesNote`) are encyclopedic register: the law
stated to a reader who never saw the previous entry or the research. Verdicts on
the previous entry, source narration ("the fetched notice expressly names"),
packet or tracker vocabulary, research-scope disclaimers, editorial to-dos, and
machine tokens (a canonical status key written into `status`) are process
language and must not be published.

Enforcement lives in code rather than in prompts:

- **Context boundary.** Research and writing are separate steps: the
  researcher returns a `facts` block and an `editor` block; the writer receives
  only `facts` and returns reader fields. Text about the previous entry cannot
  appear because the writer never saw it.
- **Single pattern.** `scripts/legality/voice.mjs` exports `READER_FIELDS`,
  `voiceMatch(field, value, mode)`, and `voiceHits`. Blocking mode carries
  the phrases that always indicate process language; audit mode adds advisory
  phrases such as `supports` and `this entry` that also occur in legal prose.
  Citation markers are stripped before matching; `status` only matches
  underscore tokens.
- **Validator gate.** `npm run legality:validate` fails a draft on any blocking
  match in a reader field, on a `status` that differs from
  `CANONICAL_STATUS_LABELS[canonicalStatus]`, and on a `designation` longer than
  40 characters or containing a comma or semicolon. `legality:apply` refuses a
  draft that fails validation.
- **Repair drafts.** `legality:build-repair-drafts` rejects a proposal whose
  `expected` text differs from the audited value, that drops or reorders a
  `[cite:...]` marker, or whose new text still trips the blocking pattern.

## Sweeping live rows

Before any remote audit or dry run, follow [data credentials](../operations/data-credentials.md).
This sweep produces reviewed local repairs only.

```bash
export DATA_BACKEND=postgres TARGET_POSTGRES_URL="$POSTGRES_POOLED_URL" POSTGRES_IMPORT_CONFIRM=<region>.pg.psdb.cloud
npm run postgres:check-env-isolation
npm run legality:audit-subsections -- --allow-remote --scope=all --out=tmp/legality-subsection-audit-<date>.json
npm run legality:audit-voice -- --audit=tmp/legality-subsection-audit-<date>.json --out=tmp/legality-voice-audit-<date>.json
```

1. Batch the voice-audit rows into `tmp/legality-voice-fix-<date>/inputs/batch-NN.json`
   (`{ batch, rows: [...] }`, rows copied from the voice audit) and have a
   reviewer or copyediting worker re-judge every hit into
   `proposals/batch-NN.json`. A `noChange` verdict with a legal-usage reason is
   a valid outcome; the regex is a lead list, not a ruling.
2. `npm run legality:build-repair-drafts -- --voice-audit=... --proposals=... --campaign=voice-scrub-<date>`
   folds accepted proposals into `runs/legality/<slug>/voice-scrub-<date>/legality-draft.json`
   using `notesRepairs`, `statusRepairs`, `designationRepairs`, and
   `instrumentRepairs`, and writes `runs/legality/_manifests/voice-scrub-<date>.json`.
   Send each rejection back with its reason.
3. Validate every draft with `legality:validate` and run only the permitted
   no-write `legality:apply` dry run under the credential contract. Publication
   is a separately authorized step; if it is authorized, re-run both audits
   afterwards and confirm the changed content-hash set equals the accepted
   proposal set and the total citation-marker count is unchanged.

Phrases judged as legitimate legal prose stay in production: "canonical SMILES"
(chemical identifier, excluded from the pattern), "the law was corrected in
March 2023" (legislative history), "the pre-existing butylone entry" (a schedule
entry), "25 mg ephedrine packets" (goods), "the Government Gazette as the
official source of the schedules". When a legitimate phrase recurs, move it from
the blocking to the advisory list in `voice.mjs` rather than teaching reviewers
to ignore it.
