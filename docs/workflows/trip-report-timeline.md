# Trip report timeline

Most of the corpus renders on the phase rail: `introduction`, timestamped `onset` / `peak` / `offset` entries, `conclusion`. A submitted report often arrives as one flat `introduction` with the author's own timestamps buried in prose, so the rail renders empty.

Reshaping it moves text and edits none of it. `scripts/reports/` makes that **lossless** claim checkable rather than asserted: `reconstructBody` rebuilds the record back into a single body from the fields that reach Postgres, and it must equal the stored body character for character. Your work is supplying the one thing the scripts cannot infer, where the phases begin, and letting the gates fail you when the claim breaks.

## Scripts

| Path | Role |
| --- | --- |
| `scripts/reports/flatTripReportTimeline.mjs` | The formatter, its inverse, and `assertLossless`. Pure; no Postgres. |
| `scripts/reports/format-flat-trip-report.mjs` | The command. Dry run by default; snapshots the original, writes, re-proves. |
| `scripts/reports/timeline-plans/<slug>.json` | The **plan**: your phase boundaries, one file per report. |
| `scripts/reports/flatTripReportTimeline.test.mjs` | `node --test`; covers the round trip and every refusal. |

The formatter keeps timestamps exactly as the author typed them, `~8:40 PM` and `After 10:40 PM` stay as written, alongside the corpus's `T+0:25` style. An untimed paragraph continues the entry above it.

## The plan

Read the whole body before writing the plan. Three boundaries, all editorial:

- **`peakFrom`**: the timestamp where the author's own account marks the plateau: settling in, lights out, the first landmark effect. Their language (*come-up*, *peak*, *coming down*, *residual*) outranks elapsed-time arithmetic.
- **`offsetFrom`**: the timestamp of the first sign of decline, including a difficult stretch the author dates themselves.
- **`conclusionFrom`**: a unique prefix of the first retrospective paragraph, where narration stops and reflection starts. Everything after it, including post-trip notes and loose ends, becomes the conclusion.

Put your reasoning in a `note` field. A later reviewer reads the plan, not the run log.

Prose before the first timestamp becomes the introduction on its own, so a lead-in line like `Trip report with approximate timestamps:` stays where the author put it.

## Workflow

1. Write `scripts/reports/timeline-plans/<slug>.json`. Done when every phase would hold at least one entry and you can point at the author's own words behind each boundary.

2. Before any remote dry-run, follow [data credentials](../operations/data-credentials.md): authorize the exact read target, load the scoped credential without printing it, and satisfy target and remote guards. Then dry-run against that target:

   ```bash
   DATA_BACKEND=postgres TARGET_POSTGRES_URL="$POSTGRES_POOLED_URL" POSTGRES_IMPORT_CONFIRM=<region>.pg.psdb.cloud \
     npm run reports:format-flat -- --slug=<slug> --dry-run --allow-remote
   ```

   Done when it prints `reproduces the original exactly` and the previewed phases read the way the plan intended. A refusal instead is the next section.

3. Before a write, confirm the command is production-allowlisted, obtain approval for the exact report and plan, run `npm run postgres:check-env-isolation`, and verify the dry-run target fingerprint. Use the scoped `DATA_ADMIN_TOKEN_EDITOR_ARTICLE_WRITE` credential; preserve freeze and confirmation gates. A refusal is a stop condition, not permission to bypass a guard.

4. Apply only the separately approved plan:

   ```bash
   DATA_BACKEND=postgres TARGET_POSTGRES_URL="$POSTGRES_POOLED_URL" POSTGRES_IMPORT_CONFIRM=<region>.pg.psdb.cloud \
     npm run reports:format-flat -- --slug=<slug> --write \
     --confirm-write=format-flat-trip-report --expected-deployment=<region>.pg.psdb.cloud/postgres --allow-remote
   ```

   Done when it prints `stored text reproduces the original body exactly`. That line is a re-read of the database compared against the pre-write body, so it is the evidence to quote.

5. If formatter or workflow code changed, run the focused formatter test and applicable package-owned workflow verification. Content-only reshaping is proved by the lossless preview and database reread, not an unrelated suite.

## When the formatter refuses

Every refusal below means the lossless claim cannot be made yet. Each is repaired at its own source, the plan, the stored body, or the formatter, with the author's prose left exactly as written.

| Refusal | What it found | Move |
| --- | --- | --- |
| `already has timeline entries` | The report is reshaped already. | Stop. |
| `not separated by exactly one blank line`, `leading or trailing whitespace` | The stored body uses wider gaps or padded edges, which Postgres would trim on write. | Repairing this changes stored text: get the user's go-ahead, fix the body in the Trip Report Portal (`/dev` → Trip reports), re-run. |
| `no timestamped paragraph` | Either there is no inline timeline, or the labels use a style `TIME_LABEL_PATTERN` misses. | For a genuine new style, widen the pattern and add a case to the test file, keeping the author's label verbatim. |
| `matches no timestamp`, `matches no paragraph`, `matches N paragraphs` | A plan boundary is wrong or ambiguous. | Fix the plan; lengthen `conclusionFrom` until it is unique. |
| `changed since it was opened` | Someone edited the report between the read and the write. | Re-run from step 2. |
| `does not reproduce the original body` | The formatter itself lost text. | Stop and fix the formatter; the write never happens. |

## After the write

`/reports/<slug>` retains its historical endpoint and route name. The Postgres write path used by `/api/dev/trip-reports/record` performs matching invalidation; an operator script may not. Follow [deployment freshness](../operations/deployment.md#build-and-release-sequence): use an authorized targeted invalidation or redeployment and request the canonical public route. Confirm rendered rail/text equality against the accepted record and its current revision. Revalidation is demand-driven: elapsed cache time or a database/editor-host readback alone is not public freshness proof.

The pre-write row is saved under `outputs/trip-report-reshape/`. It is the restore path if a later edit breaks the text.
