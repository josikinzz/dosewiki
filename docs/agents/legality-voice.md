# Legality voice: keeping process language out of published subsections

## Reader register

Reader-facing fields of a `legality.countries` entry (`notes`, `designation`, `instrument`, `status`) are **encyclopedic register**: the law stated to a reader who never saw the previous entry or the research. This document records why that rule now has teeth, where the enforcement lives, and how to sweep live rows when something slips through.

## What happened (2026-08 campaign)

The first `/legality-pi` campaign cited or corrected about 3,900 public country rows. Its research children adjudicated the existing row ("support the existing claim", `supportsExisting`, `whatWasWrong`) and then wrote `notes` in the same breath, so the verdict leaked into the prose. A cleanup on 2026-08-31 repaired 637 rows. On 2026-09-02 a regex-driven audit across public, direct-URL-only, and hidden articles found 227 more and repaired 208; a full-corpus yes/no pass by `legality-voice-flagger` children over all 4,698 rows then found 400 the regex had no pattern for (369 never matched) and repaired 396. Phrases that reached production, grouped:

| Shape | Verbatim examples |
| --- | --- |
| Verdict on the entry | "Supported and corrected in precision.", "The legacy Illegal status is corrected to canonical prohibited.", "Status normalized to prohibited" |
| Source narration | "The fetched MHLW notice expressly names", "The current Swiss schedule supports the controlled Verzeichnis-e listing", "The primary sources were checked" |
| Prior entry, packet, tracker | "The live production row was reopened from PlanetScale Postgres for slug ...", "The packet's 'Not controlled' label is superseded", "the existing New Zealand entry said" |
| Research scope disclaimers | "No claim is made about penalties", "the claim is limited to the express listing", "this dossier does not assert medical availability" |
| Editorial to-dos | "should be checked for a broader present-day conclusion", "this entry should be independently refuted before use" |
| Machine tokens | `restricted_other` as a `status`, "Canonical status: analog_covered." in notes |

Four structural causes, none of them a missing rule (every worker prompt already carried a "Voice" clause):

1. The output contract gave the verdict no home except `notes`.
2. The orchestrator pasted tracker vocabulary (reopened, packet, contentHash, legacy value) into worker prompts, and the worker echoed it.
3. `validate-draft.ts` warned instead of failing, scanned only `notes`, and matched two of the 615 leaked phrases.
4. `status` had no vocabulary, so canonical tokens were written into the display field.

## Where enforcement lives now

- **Context boundary.** `/legality-pi` splits research from writing: the researcher (`shared/prompts/subsection-research.md`) returns a `facts` block and an `editor` block; a separate writer child (`shared/prompts/subsection-writer.md`) receives only `facts` and returns reader fields. Text about the previous entry cannot appear because the writer never saw it. The refuter's check 5 tests register.
- **Single pattern.** `scripts/legality/voice.mjs` exports `VOICE_PATTERN` (blocking) and `VOICE_AUDIT_PATTERN` (blocking plus advisory phrases such as `supports` and `this entry` that also occur in legal prose). Citation markers are stripped before matching; `status` only matches underscore tokens.
- **Validator gate.** `npm run legality:validate` fails a draft on any blocking match in a reader field, on a `status` that differs from `CANONICAL_STATUS_LABELS[canonicalStatus]` (`src/schema/substance/legalStatuses.ts`), and on a `designation` longer than 40 characters or containing a comma or semicolon. `legality:apply` refuses a draft that fails validation.
- **Live audit.** `npm run legality:audit-voice -- --audit=<subsection audit>` reports blocking and advisory-only matches per row and field. Blocking matches prevent campaign completion, but regex coverage is not exhaustive. The owning skill's [final full-corpus read](../../.agents/skills/legality-pi/SKILL.md#11-voice-sweep-for-live-rows) is required once after the last wave; every flagged row must enter the repair procedure below or receive a reviewed legal-usage disposition.

## Sweeping live rows

Before any remote audit or dry-run, follow [data credentials](data-credentials.md).
The owning [legality-pi skill](../../.agents/skills/legality-pi/SKILL.md) keeps
production publication closed. This sweep produces reviewed local repairs only.


```bash
export DATA_BACKEND=postgres TARGET_POSTGRES_URL="$POSTGRES_POOLED_URL" POSTGRES_IMPORT_CONFIRM=aws-us-east-1-2.pg.psdb.cloud
npm run postgres:check-env-isolation
npm run legality:audit-subsections -- --allow-remote --scope=all --out=tmp/legality-subsection-audit-<date>.json
npm run legality:audit-voice -- --audit=tmp/legality-subsection-audit-<date>.json --out=tmp/legality-voice-audit-<date>.json
```

1. Batch the voice-audit rows eight per file into `tmp/legality-voice-fix-<date>/inputs/batch-NN.json` (`{ batch, rows: [...] }`, rows copied from the voice audit).
2. Launch one `legality-voice-fixer` child (`.omp/agents/legality-voice-fixer.md`, gpt-5.6-sol low) per batch with the input and `proposals/batch-NN.json` output paths. The fixer re-judges every regex hit; a `noChange` verdict with a legal-usage reason is a valid outcome.
3. `npm run legality:build-repair-drafts -- --voice-audit=... --proposals=... --campaign=voice-scrub-<date>` folds proposals into `runs/legality/<slug>/voice-scrub-<date>/legality-draft.json` using `notesRepairs` / `statusRepairs` / `designationRepairs` / `instrumentRepairs`. It rejects a proposal whose `expected` differs from the audited value, that drops or reorders a `[cite:...]` marker, or whose new text still trips the blocking pattern, and writes `runs/legality/_manifests/voice-scrub-<date>.json`. Send each rejection back to its fixer with the reason.
4. Validate every draft with `legality:validate` and run only the permitted no-write `legality:apply` dry-run under the credential contract. Finish with reviewed local artifacts, accepted/rejected proposal accounting, and the full-corpus flagger pass once after the last wave. Do not apply drafts: production publication remains closed pending a separately authorized approved-writer path. If publication is later authorized, re-run both audits and confirm the changed content-hash set equals the accepted proposal set and the total citation-marker count is unchanged.

## Accepted advisory hits

The regex is a lead list, not a ruling. Phrases the fixers have judged as legitimate legal prose and that stay in production: "canonical SMILES" (chemical identifier; excluded from the pattern), "the law was corrected in March 2023" (legislative history), "the pre-existing butylone entry" (a schedule entry), "25 mg ephedrine packets" (goods), "an unqualified 'Unscheduled' classification is incorrect" (a statement about the law's scope), "the Government Gazette as the official source of the schedules". When a legitimate phrase recurs, move it from the blocking to the advisory list in `voice.mjs` rather than teaching fixers to ignore it.
