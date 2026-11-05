# Postgres connection budget and translation claim load

## Observed incident (2026-11-05)

At about 12:52–12:54 UTC the admin cron `/api/cron/translation-bulk` hit
`FATAL 08P01 max_client_conn`; public `/replications/*` and `/2c-p` timed out
from several regions. PlanetScale reported 58 instances of Postgres error 25001
("there is already a transaction in progress"), idle-in-transaction timeouts,
100% primary CPU, and PgBouncer at 78 active clients against a branch whose
`max_connections` is 25.

## Root causes

1. **Empty-claim storm.** The bulk lane's `jobsPerRun` is derived from the
   OpenRouter request concurrency cap (100). Every minute the cron launched 100
   workers, each issuing a `claimTranslationJobs(1)` update, even when the
   queue was empty or every pending job had exhausted `attempts` (production
   held 106 pending jobs, all at `attempts = 5`, i.e. permanently unclaimable).
   Read-only verification counted ~36,000 `UPDATE translationJobs` statements
   in six hours, the overwhelming majority claiming nothing.
2. **Multi-statement BEGIN.** `beginWithTimeouts` returned a single string of
   `BEGIN; SET LOCAL ...; SET LOCAL ...`. node-postgres sends that through the
   simple query protocol, whose bookkeeping allowed a new `BEGIN` on a client
   still inside the previous transaction — the exact 25001 bursts seen at
   12:54 UTC.
3. **Per-instance pool multiplication.** Every warm serverless instance held a
   `pg.Pool` of up to 4 connections. With multiple concurrent public, editor,
   and Effect Index instances that alone can exhaust the branch's 25 slots.

## Fixes in this branch

- `hasClaimableTranslationJobs` runs one cheap `SELECT EXISTS` after the worker
  lease is acquired. If nothing is due, the run ends with no claim updates.
- Claims are batched eight rows per update (`CLAIM_BATCH_SIZE`), cutting claim
  statement volume by 8x during real work.
- Unprocessed rows from a batch are released back through
  `failTranslationJob(..., { progressed: true })`, refunding their attempt and
  applying a retry delay instead of silently losing the claim until lease
  expiry.
- `beginWithTimeouts(client, begin)` now sends `BEGIN` and each `SET LOCAL` as
  separate protocol messages. Regression test:
  `lib/postgres/transactionTimeouts.test.ts`.
- `PostgresClient.fromUrl` caps each runtime pool at 2 connections
  (`POSTGRES_RUNTIME_POOL_MAX`, 1–4). Pools queue rather than multiply.

The once-per-minute schedule is unchanged. With the due-job probe, an idle
queue costs one read per minute; changing the schedule would only delay real
translation work.

## What still needs the owner

- **Deploy the editor project** with this branch (and redeploy the public
  project for the pool-cap change) — requires Josie's explicit yes.
- **Requeue exhausted translations** (106 bulk jobs at `attempts = 5` are never
  claimed again) — a production data write, requires Josie's explicit yes.
- **Paid PlanetScale capacity:** not required for this fix. Only consider a
  plan/connection-limit increase if CPU remains saturated after the above is
  deployed; propose before buying.
