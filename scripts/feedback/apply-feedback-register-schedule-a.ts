/**
 * Applies Schedule A of the 2026-09-08 article feedback register: the fixes that
 * rest on data already in production and need no external source.
 *
 * Four article edits, each published through `articleLifecycle:write` against a
 * fresh revision baseline, and eight feedback queue transitions. Every article
 * edit carries a compare-and-set precondition on the exact stored value, so a
 * stale plan refuses instead of overwriting newer work. The three queue rows in
 * clause A7 take two hops each, because `VALID_TRANSITIONS` in
 * `server/articleFeedback.ts` has no direct route from `resolved` to `spam`.
 *
 * Dry-run by default:
 *   bun scripts/feedback/apply-feedback-register-schedule-a.ts
 *
 * Live:
 *   TARGET_POSTGRES_URL=postgresql://localhost/dosewiki \
 *   bun scripts/feedback/apply-feedback-register-schedule-a.ts \
 *     --write --confirm-feedback-register \
 *     --confirm-write=apply-feedback-register-schedule-a \
 *     --expected-deployment=localhost/dosewiki
 */
import { createDataClient, type DataClient } from "../lib/data-client.ts";
import { isDeepStrictEqual } from "node:util";
import { api } from "../../lib/postgres/runtime/api.ts";
import { createDataOpsRunContext,
assertDataOpsWriteAllowed,
printDataOpsRunContext,
hasFlag,
requireAdminIntentToken,
resolveAdminIntentToken,  } from "../lib/data-ops-run-context.mjs"; import { writeAuditLog, updateAuditLog } from "../lib/data-ops-audit.mjs"

const OPERATION = "apply-feedback-register-schedule-a";
const CONFIRMATION_FLAG = "--confirm-feedback-register";
const REVIEWER = "feedback-register@local.dose.wiki";

/** The Internet Archive item for the Extended Edition, verified live 2026-09-08. */
const DUB_EXTENDED_EDITION = "https://archive.org/details/drug-users-bible_202401";

/** Every Drug Users Bible URL that failed a request on 2026-09-08. */
const DEAD_DUB_URLS: Array<{ slug: string; url: string; code: string }> = [
  { slug: "dipt", url: "https://www.drugusersbible.org/diPT.html", code: "000" },
  { slug: "hydrocodone", url: "https://www.drugusersbible.org/opiates.html#hydrocodone", code: "000" },
  { slug: "noopept", url: "https://www.drugusersbible.org/encyclopedia/noopept.html", code: "000" },
  { slug: "mda", url: "https://www.drugusersbible.com/3_4-methylenedioxyamphetamine.html", code: "404" },
  { slug: "nicotine", url: "https://www.drugusersbible.com/nicotine.html", code: "404" },
  { slug: "oxycodone", url: "https://www.drugusersbible.com/opiates.html#oxycodone", code: "404" },
];

const MEPHEDRONE_STORED_CLASS = ["Substituted cathinone"];
const MEPHEDRONE_SHARED_CLASS = ["Cathinone (substituted)"];

/**
 * The oral bioavailability note stored on `det`, byte-identical to the one on
 * `2c-b`. BDMPAA is a 2C-B metabolite and cannot apply to a tryptamine.
 */
const DET_PASTED_NOTE =
  "A very large portion of the drug is broken down by the liver before it reaches the bloodstream, resulting in relatively low bioavailability\n" +
  "The primary metabolite BDMPAA reaches concentrations roughly 280 times higher than the parent compound, reflecting extensive first-pass processing";

/** The sentence 3-CMC's summary ends its structural comparison with today. */
const THREE_CMC_ANCHOR =
  "It has been primarily sold online as a designer drug in European markets.";

/**
 * Verifiable from the two IUPAC names the corpus already stores:
 * 3-CMC is 1-(3-chlorophenyl)-2-(methylamino)propan-1-one and bupropion is
 * 2-(tert-butylamino)-1-(3-chlorophenyl)propan-1-one.
 */
const THREE_CMC_BUPROPION_SENTENCE =
  "Its closest widely known relative is bupropion, which shares the same " +
  "1-(3-chlorophenyl)propan-1-one skeleton and differs only at the nitrogen " +
  "substituent, carrying a tert-butyl group where 3-CMC carries a methyl group.";

type ArticleDoc = Record<string, unknown>;

type ArticleEdit = {
  clause: string;
  slug: string;
  path: string;
  describe: string;
  summary: string;
  /** True only while the stored value is exactly what the plan was built on. */
  matches: (article: ArticleDoc) => boolean;
  /** Returns a new article document; never mutates the argument. */
  apply: (article: ArticleDoc) => ArticleDoc;
};

type QueueTransition = {
  clause: string;
  table: "articleFeedback" | "siteFeedback";
  id: string;
  from: string;
  status: "new" | "reviewing" | "resolved" | "rejected" | "spam";
  note: string;
};

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function citations(article: ArticleDoc): Array<Record<string, unknown>> {
  const stored = article.source_citations;
  return Array.isArray(stored) ? (stored as Array<Record<string, unknown>>) : [];
}

export function planArticleEdits(): ArticleEdit[] {
  const edits: ArticleEdit[] = [
    {
      clause: "A1",
      slug: "mephedrone",
      path: "classification.chemical_class",
      describe: `${JSON.stringify(MEPHEDRONE_STORED_CLASS)} -> ${JSON.stringify(MEPHEDRONE_SHARED_CLASS)}`,
      summary:
        'Use the shared chemical class label "Cathinone (substituted)" so mephedrone joins the class group 35 other articles already use. Reported in article feedback 9b080272.',
      matches: (article) =>
        isDeepStrictEqual(record(article.classification).chemical_class, MEPHEDRONE_STORED_CLASS),
      apply: (article) => ({
        ...article,
        classification: {
          ...record(article.classification),
          chemical_class: [...MEPHEDRONE_SHARED_CLASS],
        },
      }),
    },
    {
      clause: "A2",
      slug: "det",
      path: "dosage.routes[0].bioavailability_notes",
      describe: "delete the note copied from 2c-b, write no replacement",
      summary:
        "Remove the oral bioavailability note copied from the 2C-B article. It describes BDMPAA, a 2C-B metabolite, so it cannot apply to DET. Reported in article feedback 7785bb01.",
      matches: (article) => {
        const route = record(record(article.dosage).routes instanceof Array
          ? (record(article.dosage).routes as unknown[])[0]
          : undefined);
        return route.route === "oral" && route.bioavailability_notes === DET_PASTED_NOTE;
      },
      apply: (article) => {
        const dosage = record(article.dosage);
        const routes = Array.isArray(dosage.routes) ? [...(dosage.routes as unknown[])] : [];
        const { bioavailability_notes: _removed, ...route } = record(routes[0]);
        routes[0] = route;
        return { ...article, dosage: { ...dosage, routes } };
      },
    },
    {
      clause: "A3",
      slug: "3-cmc",
      path: "summary",
      describe: "insert one sentence naming bupropion before the market sentence",
      summary:
        "Name bupropion as 3-CMC's closest widely known relative and state the N-substituent difference, which both stored IUPAC names show. Reported in article feedback 138a80ae.",
      matches: (article) =>
        typeof article.summary === "string" &&
        article.summary.includes(THREE_CMC_ANCHOR) &&
        !article.summary.includes("bupropion"),
      apply: (article) => ({
        ...article,
        summary: String(article.summary).replace(
          THREE_CMC_ANCHOR,
          `${THREE_CMC_BUPROPION_SENTENCE} ${THREE_CMC_ANCHOR}`,
        ),
      }),
    },
  ];

  for (const dead of DEAD_DUB_URLS) {
    edits.push({
      clause: "A5",
      slug: dead.slug,
      path: "source_citations[].url",
      describe: `${dead.url} (${dead.code}) -> ${DUB_EXTENDED_EDITION}`,
      summary:
        "Repoint a dead Drug Users Bible source link to the Internet Archive Extended Edition item.",
      matches: (article) => citations(article).some((entry) => entry.url === dead.url),
      apply: (article) => ({
        ...article,
        source_citations: citations(article).map((entry) =>
          entry.url === dead.url ? { ...entry, url: DUB_EXTENDED_EDITION } : entry,
        ),
      }),
    });
  }

  return edits;
}

export function planQueueTransitions(): QueueTransition[] {
  const diagnosticNote =
    "Intake diagnostic filed by the project on 2026-09-04, not a public report. Archived so the queue counts only public reports. Feedback register clause A7.";

  return [
    {
      clause: "A3",
      table: "articleFeedback",
      id: "138a80ae-9832-45bf-86d6-3497f065484c",
      from: "new",
      status: "resolved",
      note: "The summary now names bupropion as 3-CMC's closest widely known relative and states the N-substituent difference. Feedback register clause A3.",
    },
    {
      clause: "A1",
      table: "articleFeedback",
      id: "9b080272-31a0-431e-9a57-f4dd8bd988c1",
      from: "new",
      status: "reviewing",
      note: 'chemical_class is now "Cathinone (substituted)", the label 35 other articles use, which fixes the reported missing class group. The second request, adding cathinones to a phenethylamine class, needs a corpus-wide vocabulary decision and stays open as feedback register clause B2.',
    },
    {
      clause: "A2",
      table: "articleFeedback",
      id: "7785bb01-bf3f-462a-867f-36a62c429223",
      from: "new",
      status: "resolved",
      note: 'The copied 2C-B bioavailability note is deleted from the oral route. That route\'s separate "Low" rating is a separate question, tracked as feedback register clause C1, because it conflicts with the article\'s own pharmacokinetics paragraph.',
    },
    {
      clause: "A4",
      table: "articleFeedback",
      id: "39c5afad-3664-44c6-a756-936d57514141",
      from: "new",
      status: "resolved",
      note: "Poland was already cited. legality.countries.Poland records prohibited, Grupa I-P, citing the 2018 Ministry of Health regulation consolidated as Dz. U. 2024 poz. 1139, zalacznik 1 czesc 1, lp. 54, the exact position reported. No article change needed. A reply to the reporter is owed and cannot be sent from this repository.",
    },
    {
      clause: "A6",
      table: "siteFeedback",
      id: "5866f7f9-26e6-413f-89ef-1e18acd38afb",
      from: "new",
      status: "resolved",
      note: "4-CMC is already published at /4-cmc, classed Cathinone (substituted). PMID 36669877 is logged for the citation queue and deliberately not added in this pass, because a rat pharmacodynamics study needs a specific claim to attach to. A reply to the requester is owed and cannot be sent from this repository.",
    },
    ...["ac4db511-2405-402a-941c-c51d6ba59fbb", "62c611ab-71ea-440e-a5e8-27c265c2f356", "d5f1c8cf-3967-44bc-9a2c-3ead0e9e6743"].flatMap(
      (id): QueueTransition[] => [
        { clause: "A7", table: "articleFeedback", id, from: "resolved", status: "reviewing", note: diagnosticNote },
        { clause: "A7", table: "articleFeedback", id, from: "reviewing", status: "spam", note: diagnosticNote },
      ],
    ),
  ];
}

type RunDependencies = {
  env?: Record<string, string | undefined>;
  logger?: Pick<Console, "log">;
  createClient?: (url: string) => DataClient;
  writeAudit?: typeof writeAuditLog;
  updateAudit?: typeof updateAuditLog;
};

export async function runApplyScheduleA(
  argv: string[],
  {
    env = process.env,
    logger = console,
    createClient = (url: string) => createDataClient({ target: url }).client,
    writeAudit = writeAuditLog,
    updateAudit = updateAuditLog,
  }: RunDependencies = {},
) {
  const write = hasFlag(argv, "--write");
  const context = createDataOpsRunContext({
    operation: OPERATION,
    intent: "editorArticleWrite",
    argv,
    env,
    targetUrlKeys: ["TARGET_POSTGRES_URL"],
    dryRunFlag: "--dry-run",
    executeFlag: "--write",
    requiresExecute: true,
    confirmationFlag: CONFIRMATION_FLAG,
    selectedTables: ["substanceIndex", "articleFeedback", "siteFeedback"],
    localArtifacts: [],
    loadsEnvLocal: true,
    destructive: true,
  });
  if (!write) {
    context.dryRun = true;
    context.writeEnabled = false;
  }
  printDataOpsRunContext(context, { logger });

  const readUrl = write
    ? context.targetUrl
    : (env.TARGET_POSTGRES_URL ?? env.POSTGRES_POOLED_URL ?? env.SOURCE_POSTGRES_URL);
  if (!readUrl) {
    throw new Error(
      "No Postgres URL available. Set TARGET_POSTGRES_URL (writes) or POSTGRES_POOLED_URL / SOURCE_POSTGRES_URL (dry run).",
    );
  }
  const client = createClient(readUrl);
  const edits = planArticleEdits();
  const transitions = planQueueTransitions();

  logger.log("\nArticle edits");
  const stale: string[] = [];
  for (const edit of edits) {
    const article = (await client.query(api.substanceIndex.getBySlug, { slug: edit.slug })) as ArticleDoc | null;
    const ready = article ? edit.matches(article) : false;
    if (!ready) stale.push(`${edit.clause} ${edit.slug} ${edit.path}`);
    logger.log(`  ${ready ? "ready" : "STALE"}  ${edit.clause}  ${edit.slug}  ${edit.path}`);
    logger.log(`         ${edit.describe}`);
  }

  // The queue rows are addressed by public id, so verify each one exists and
  // still sits where the plan expects before the first hop is sent.
  logger.log("\nQueue transitions");
  const queueToken = resolveAdminIntentToken("editorArticleWrite", { env });
  const liveStatus = new Map<string, string>();
  if (queueToken) {
    for (const table of ["articleFeedback", "siteFeedback"] as const) {
      const rows = (await client.query(
        table === "articleFeedback" ? api.articleFeedback.list : api.siteFeedback.list,
        { apiKey: queueToken.token, limit: 250 },
      )) as Array<{ id: string; status: string }>;
      for (const row of rows) liveStatus.set(`${table}:${row.id}`, row.status);
    }
  }
  const seen = new Set<string>();
  for (const transition of transitions) {
    const key = `${transition.table}:${transition.id}`;
    const isFirstHop = !seen.has(key);
    seen.add(key);
    let verdict = "unchecked";
    if (queueToken) {
      const live = liveStatus.get(key);
      if (live === undefined) verdict = "MISSING";
      else if (!isFirstHop) verdict = "follows";
      else verdict = live === transition.from ? "ready" : `MOVED (live ${live})`;
      if (verdict === "MISSING" || verdict.startsWith("MOVED")) {
        stale.push(`${transition.clause} ${transition.table} ${transition.id} ${verdict}`);
      }
    }
    logger.log(`  ${verdict.padEnd(16)} ${transition.clause}  ${transition.table}  ${transition.id.slice(0, 8)}  ${transition.from} -> ${transition.status}`);
  }

  if (stale.length > 0) {
    throw new Error(
      `The stored value moved under ${stale.length} planned edit(s); nothing was written. Re-read production and rebuild the plan:\n  ${stale.join("\n  ")}`,
    );
  }

  if (!write) {
    logger.log(
      `\nDry run only. Re-run with --write ${CONFIRMATION_FLAG} --confirm-write=${context.operationName} --expected-deployment=<deployment>.`,
    );
    return { edits, transitions };
  }

  assertDataOpsWriteAllowed(context);
  const token = requireAdminIntentToken("editorArticleWrite", { env });
  const audit = writeAudit({
    operation: OPERATION,
    intent: "editorArticleWrite",
    slug: OPERATION,
    mutations: [
      ...edits.map((edit) => ({ slug: edit.slug, action: "publish", clause: edit.clause, path: edit.path, change: edit.describe })),
      ...transitions.map((transition) => ({ slug: transition.table, action: "transition", clause: transition.clause, id: transition.id, status: transition.status })),
    ],
    repoRoot: context.repoRoot,
  });

  const results: unknown[] = [];
  try {
    updateAudit(audit.path, { status: "applying" });

    // One article at a time: each publish reads its own baseline, so a later
    // edit never carries an earlier revision's stale hash.
    for (const edit of edits) {
      const latest = await client.query(api.articleLifecycle.get, { apiKey: token.token, slug: edit.slug });
      if (!edit.matches(latest.article as ArticleDoc)) {
        throw new Error(`${edit.clause} ${edit.slug}: ${edit.path} changed between the plan and the write. Nothing further was sent.`);
      }
      results.push(
        await client.mutation(api.articleLifecycle.write, {
          apiKey: token.token,
          action: "publish",
          slug: edit.slug,
          baseHash: latest.baseHash,
          article: edit.apply(latest.article as ArticleDoc),
          summary: edit.summary,
          // `articleLifecycle.write` accepts letters, digits, `:`, `_` and `-`
          // only, so the field path stays out of the change ID.
          changeId: `${OPERATION}:${edit.clause}:${edit.slug}`,
        } as never),
      );
      updateAudit(audit.path, { status: "applying", completed: results.length, results });
    }

    for (const transition of transitions) {
      const mutation = transition.table === "articleFeedback"
        ? api.articleFeedback.transition
        : api.siteFeedback.transition;
      results.push(
        await client.mutation(mutation, {
          apiKey: token.token,
          id: transition.id,
          status: transition.status,
          reviewer: REVIEWER,
          note: transition.note,
        }),
      );
      updateAudit(audit.path, { status: "applying", completed: results.length, results });
    }

    updateAudit(audit.path, { status: "completed", results });
  } catch (error) {
    updateAudit(audit.path, {
      status: "failed",
      completed: results.length,
      results,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }

  logger.log(`\nApplied ${edits.length} article edit(s) and ${transitions.length} queue transition(s). Audit log: ${audit.path}`);
  return { edits, transitions, auditLogPath: audit.path };
}

const isDirectExecution = process.argv[1]?.endsWith("apply-feedback-register-schedule-a.ts") ?? false;
if (isDirectExecution) {
  runApplyScheduleA(process.argv.slice(2)).catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
