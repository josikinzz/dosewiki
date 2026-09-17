/**
 * Rehearsal: private report intake, report publication, and
 * feedback review on Postgres, driven through the same native functions the
 * app calls (`PostgresClient` with `api.*` references) and, for intake,
 * through the real Next route handler with `DATA_BACKEND=postgres`.
 *
 *   bun scripts/postgres/rehearse-reports-feedback.ts [--target <url>] [--allow-remote] [--keep]
 *
 * Creates scratch memberships, submissions, reports, and feedback rows tagged
 * `t08-<random>` and deletes them unless `--keep`. Fixture rows are only read.
 * The report lands in runs/postgres-import/<timestamp>-reports-feedback/report.json.
 *
 * Scenarios (letters match the ticket acceptance list):
 *   a. intake: the route persists exactly one submission and returns its
 *      contract; replaying the same submission id writes nothing.
 *   b. queue-privacy: no apiKey, an empty apiKey, a viewer, and the intake
 *      token are all refused by every tripReportSubmissions query.
 *   c. route: 503 without a credential, 400 malformed, 400 validation, 413
 *      oversized, 429 at the in-process limit, 500 when persistence fails,
 *      and mutation-level refusal of wrong or wrongly scoped keys.
 *   d. publish: promote and update write content, tripReportSubstances,
 *      revision journal, and outbox in one transaction; a second-half failure
 *      (a substance name the join index cannot hold) leaves zero rows changed.
 *   e. public-projection: every unauthenticated tripReports query and every
 *      PublicDataReadAdapter report method exposes only projection fields.
 *   f. feedback: create, role floors, status transitions, and limit-based
 *      paging for articleFeedback and siteFeedback.
 */

import { randomBytes } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { FunctionArgs, FunctionReference } from "../../lib/postgres/runtime/api";
import { Pool } from "pg";
import { api } from "../../lib/postgres/runtime/api";
import type { Id } from "../../lib/postgres/runtime/dataModel";
import { getPublicDataReadAdapter } from "../../lib/data/publicData.reads";
import {
  getPublicIntakeWriteCapability,
  resetServerDataWriteCapabilityCacheForTests,
} from "../../lib/data/serverWriteCapability";
import { getRateLimitPolicy } from "../../lib/http/rateLimitPolicy";
import { documentHash } from "../../lib/postgres/documentCodec";
import { insertDocument } from "../../lib/postgres/documentStore";
import { getDataBackend, getPostgresClient } from "../../lib/postgres/runtime/backend";
import type { PostgresClient } from "../../lib/postgres/runtime/client";
import { functionModules } from "../../lib/postgres/runtime/functions.generated";
import { POST as intakePost } from "../../src/app/api/trip-report-submissions/route";
import { createSubmissionForIntake } from "../../src/features/reports/submissions/dataTripReportSubmissionStore";
import {
  createTripReportSubmission,
  IGNORED_PROFILE_KEY_WARNING,
  slugify,
  type TripReportSubmissionInput,
  type TripReportSubmissionRow,
} from "../../src/features/reports/submissions/tripReportSubmissions";
import { guardTarget, resolveTarget } from "./targetGuard";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const INTAKE_URL = "http://localhost/api/trip-report-submissions";
const MAX_SUBMISSION_PAYLOAD_BYTES = 128 * 1024;

/** Stored on `tripReports` but never part of the reader projection (`server/lib/tripReportPublicProjection.ts`). */
const PRIVATE_REPORT_FIELDS = ["_id", "_creationTime", "owner_email", "attribution_review"] as const;
/** `tripReportSubmissions` fields that exist only for intake and review (`server/schema.ts`). */
const INTAKE_ONLY_FIELDS = [
  "id", "status", "schema_version", "author_name", "substance_names", "contact_email", "may_contact",
  "publish_consent", "age_confirmed", "ip_hash", "user_agent", "honeypot_triggered", "review_notes",
  "reviewed_by", "reviewed_at", "exported_trip_report_id", "exported_at", "created_at", "updated_at",
] as const;
const FORBIDDEN_PUBLIC_FIELDS = new Set<string>([...PRIVATE_REPORT_FIELDS, ...INTAKE_ONLY_FIELDS]);

type Check = { scenario: string; check: string; pass: boolean; detail?: unknown };
type Registered = { isQuery?: boolean; isMutation?: boolean; isPublic?: boolean; exportArgs: () => string };
type QueryRef = FunctionReference<"query">;
type MutationRef = FunctionReference<"mutation">;

const checks: Check[] = [];
function expect(scenario: string, check: string, pass: boolean, detail?: unknown): void {
  checks.push({ scenario, check, pass, ...(detail === undefined ? {} : { detail }) });
  console.log(`${pass ? "ok  " : "FAIL"} ${scenario}: ${check}${detail === undefined || pass ? "" : ` ${JSON.stringify(detail)}`}`);
}

async function rejection(run: () => Promise<unknown>): Promise<unknown> {
  try {
    await run();
    return null;
  } catch (error) {
    return error;
  }
}

const messageOf = (error: unknown): string => (error instanceof Error ? error.message : String(error));
const sqlCodeOf = (error: unknown): string | undefined => (error as { code?: string } | null)?.code;
/** Key-order-insensitive equality: jsonb does not preserve object key order. */
function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) => record[key] === undefined ? "" : `${JSON.stringify(key)}:${stable(record[key])}`).filter(Boolean).join(",")}}`;
  }
  return JSON.stringify(value);
}
const same = (a: unknown, b: unknown): boolean => stable(a) === stable(b);

type SubmissionArg = FunctionArgs<typeof api.tripReportSubmissions.create>["submission"];
/** The app row type widens `exported_trip_report_id` to string; a freshly minted row never carries one. */
function asSubmissionArg(row: TripReportSubmissionRow): SubmissionArg {
  return { ...row, exported_trip_report_id: undefined };
}


function queriesOf(module: string): Record<string, Registered> {
  const out: Record<string, Registered> = {};
  for (const [name, value] of Object.entries(functionModules[module])) {
    const fn = value as Registered;
    if (fn?.isQuery) out[name] = fn;
  }
  return out;
}

function offendingFields(value: unknown, into: Set<string>): void {
  if (Array.isArray(value)) {
    for (const item of value) offendingFields(item, into);
    return;
  }
  if (!value || typeof value !== "object") return;
  for (const key of Object.keys(value)) {
    if (FORBIDDEN_PUBLIC_FIELDS.has(key)) into.add(key);
  }
}

function intakeRequest(ip: string, body: unknown, raw?: string): Request {
  return new Request(INTAKE_URL, {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": ip, "user-agent": "rehearsal" },
    body: raw ?? JSON.stringify(body),
  });
}

async function readResponse(response: Response): Promise<{ status: number; body: unknown; retryAfter: string | null }> {
  return { status: response.status, body: await response.json(), retryAfter: response.headers.get("Retry-After") };
}

const NARRATIVE = "The onset was gradual and the room stayed familiar; by the second hour the colours had settled into something calm and steady.";

function submissionInput(title: string, authorName: string, contactEmail: string, tag: string): TripReportSubmissionInput {
  return {
    report: {
      title,
      subject: { name: authorName, profile_key: "T08CLAIMED", trip_date: "2026-09-01", setting: "at home" },
      substances: [
        { name: `${tag} Alpha`, dose: "10 mg", roa: "oral" },
        { name: `${tag} Beta` },
      ],
      introduction: NARRATIVE,
      onset: [{ time: "T+0:00", description: "first entry" }, { time: "T+0:30", description: "second entry" }],
      peak: [{ time: "T+2:00", description: "peak entry" }],
      offset: [{ time: "T+6:00", description: "offset entry" }],
      conclusion: "A calm evening.",
      tags: ["rehearsal"],
    },
    contact_email: contactEmail,
    may_contact: true,
    publish_consent: true,
    age_confirmed: true,
  };
}

async function main() {
  const argv = process.argv.slice(2);
  const target = resolveTarget(argv);
  guardTarget(target, argv.includes("--allow-remote"));
  const keep = argv.includes("--keep");

  // The app boundaries read these exactly as they would under `next start`.
  process.env.DATA_BACKEND = "postgres";
  process.env.POSTGRES_POOLED_URL = target;
  delete process.env.DATA_ADMIN_TOKEN_PUBLIC_INTAKE_CREATE;
  const adminKey = process.env.DATA_ADMIN_KEY;
  if (!adminKey) throw new Error("DATA_ADMIN_KEY is required (source .env.local)");
  const pool = new Pool({ connectionString: target, max: 4 });
  const clients: PostgresClient[] = [];
  const client = getPostgresClient();
  clients.push(client);

  const tag = `t08-${randomBytes(4).toString("hex")}`;
  const intakeToken = `${tag}-intake-token`;
  // A scoped token for an unrelated intent, minted for this run: the local
  // .env.local reuses the admin key as every scoped token, which would pass.
  const otherIntentToken = `${tag}-prompt-migration-token`;
  process.env.DATA_ADMIN_TOKEN_PROMPT_MIGRATION_WRITE = otherIntentToken;
  const members = {
    admin: `${tag}-admin@rehearsal.invalid`,
    editor: `${tag}-editor@rehearsal.invalid`,
    viewer: `${tag}-viewer@rehearsal.invalid`,
  };
  const authorName = `${tag} Author`;
  const scratch = {
    membershipIds: [] as string[],
    submissionIds: [] as string[],
    reportIds: [] as string[],
    reportSlugs: [] as string[],
    feedbackIdPrefix: `${tag}-`,
  };
  const adminArgs = { apiKey: adminKey, actorEmail: members.admin };
  const editorArgs = { apiKey: adminKey, actorEmail: members.editor };
  const viewerArgs = { apiKey: adminKey, actorEmail: members.viewer };

  const runDirectory = path.join(ROOT, "runs", "postgres-import", `${new Date().toISOString().replace(/[:.]/g, "-")}-reports-feedback`);
  const started = performance.now();

  async function count(table: string, where: string, params: unknown[]): Promise<number> {
    const result = await pool.query(`SELECT count(*)::int AS n FROM "${table}" WHERE ${where}`, params);
    return result.rows[0].n as number;
  }
  async function submissionRow(id: string): Promise<Record<string, unknown> | null> {
    const result = await pool.query('SELECT * FROM "tripReportSubmissions" WHERE "id" = $1', [id]);
    return result.rows[0] ?? null;
  }
  async function reportRow(reportId: string): Promise<Record<string, unknown> | null> {
    const result = await pool.query('SELECT * FROM "tripReports" WHERE "_id" = $1', [reportId]);
    return result.rows[0] ?? null;
  }
  async function substanceRows(reportId: string): Promise<string[]> {
    const result = await pool.query('SELECT "name_lower" FROM "tripReportSubstances" WHERE "report_id" = $1 ORDER BY "name_lower"', [reportId]);
    return result.rows.map((row) => row.name_lower as string);
  }
  async function reportSnapshot(reportId: string, slug: string) {
    const report = await reportRow(reportId);
    const outbox = await pool.query('SELECT * FROM "publicCachePublications" WHERE "key" = $1', [JSON.stringify({ kind: "report", slug })]);
    return {
      reportHash: report ? documentHash(report) : null,
      substances: await substanceRows(reportId),
      revisions: await count("contentRevisions", '"table" = $1 AND "key" = $2', ["tripReports", slug]),
      outboxHash: outbox.rows[0] ? documentHash(outbox.rows[0]) : null,
    };
  }

  try {
    expect("setup", "data backend resolves to postgres", getDataBackend() === "postgres");
    const now = new Date().toISOString();
    for (const [role, email] of Object.entries(members)) {
      scratch.membershipIds.push(await insertDocument(pool, "memberships", { email, role, createdAt: now, updatedAt: now }));
    }

    // ---------------------------------------------------------------- c. route (credential absent)
    const missingCredential = await readResponse(await intakePost(intakeRequest("10.8.0.1", submissionInput(`${tag} no credential`, authorName, members.admin, tag))));
    expect("route", "503 when no intake credential is set", missingCredential.status === 503, missingCredential.status);
    expect("route", "503 wrote nothing", (await count("tripReportSubmissions", '"title" = $1', [`${tag} no credential`])) === 0);

    process.env.DATA_ADMIN_TOKEN_PUBLIC_INTAKE_CREATE = intakeToken;

    // ---------------------------------------------------------------- a. intake
    const title = `${tag} promoted report`;
    const input = submissionInput(title, authorName, members.admin, tag);
    const accepted = await readResponse(await intakePost(intakeRequest("10.8.0.2", input)));
    const body = accepted.body as { ok?: unknown; id?: unknown; status?: unknown; warnings?: unknown };
    const submissionId = typeof body.id === "string" ? body.id : "";
    if (submissionId) scratch.submissionIds.push(submissionId);
    expect("intake", "route answers 202 with the { ok, id, status, warnings } contract",
      accepted.status === 202 && same(Object.keys(body), ["ok", "id", "status", "warnings"]) && body.ok === true && body.status === "received" && submissionId.length > 0,
      accepted);
    expect("intake", "warnings report the dropped profile key and the missing dose",
      same(body.warnings, [IGNORED_PROFILE_KEY_WARNING, "One or more substances are missing dose."]), body.warnings);
    const stored = await submissionRow(submissionId);
    expect("intake", "exactly one tripReportSubmissions row persisted", (await count("tripReportSubmissions", '"id" = $1', [submissionId])) === 1 && (await count("tripReportSubmissions", '"title" = $1', [title])) === 1);
    const storedReport = stored?.report as { subject?: Record<string, unknown> } | undefined;
    expect("intake", "stored row is submitted, keeps contact email, and carries no submitter attribution",
      stored?.status === "submitted" && stored.contact_email === members.admin && stored.user_agent === "rehearsal"
        && storedReport?.subject !== undefined && !("profile_key" in storedReport.subject) && !("avatar_url" in storedReport.subject) && !("pdf_url" in storedReport.subject),
      stored && { status: stored.status, subject: storedReport?.subject });
    const viaQueue = await client.query(api.tripReportSubmissions.get, { ...adminArgs, id: submissionId });
    expect("intake", "admin reads the row back through tripReportSubmissions.get", viaQueue?.id === submissionId && viaQueue.title === title);

    const capability = getPublicIntakeWriteCapability();
    expect("intake", "public intake capability uses the scoped token, not the admin key", capability !== null && capability.apiKey === intakeToken && capability.apiKey !== adminKey);
    const replay = await rejection(() => createSubmissionForIntake({ ...capability!, idFactory: () => submissionId }, input));
    expect("intake", "replaying the same submission id through the store is refused", messageOf(replay) === "Trip report submission already exists.", messageOf(replay));
    const replayDirect = await rejection(() => client.mutation(api.tripReportSubmissions.create, { apiKey: intakeToken, submission: viaQueue! }));
    expect("intake", "replaying the stored row through tripReportSubmissions.create is refused", messageOf(replayDirect) === "Trip report submission already exists.", messageOf(replayDirect));
    expect("intake", "replay wrote nothing", (await count("tripReportSubmissions", '"title" = $1', [title])) === 1);

    // ---------------------------------------------------------------- b. queue-privacy
    const submissionQueries = queriesOf("tripReportSubmissions");
    const privateQueryArgs: Record<string, Record<string, unknown>> = {
      list: {},
      listByStatuses: { statuses: ["submitted"] },
      countByStatus: { statuses: ["submitted"] },
      get: { id: submissionId },
      previewPromotion: { id: submissionId },
    };
    expect("queue-privacy", "every tripReportSubmissions query is covered", same(Object.keys(submissionQueries).sort(), Object.keys(privateQueryArgs).sort()), Object.keys(submissionQueries));
    for (const [name, args] of Object.entries(privateQueryArgs)) {
      const ref = (api.tripReportSubmissions as unknown as Record<string, QueryRef>)[name];
      const anonymous = await rejection(() => client.query(ref, args));
      expect("queue-privacy", `${name}: no apiKey is refused before the handler runs`, anonymous !== null && /apiKey/.test(messageOf(anonymous)), messageOf(anonymous));
      const emptyKey = await rejection(() => client.query(ref, { ...args, apiKey: "" }));
      expect("queue-privacy", `${name}: empty apiKey is refused as unauthenticated`, messageOf(emptyKey) === "Authentication required: Please sign in or provide an API key", messageOf(emptyKey));
      const viewer = await rejection(() => client.query(ref, { ...args, ...viewerArgs }));
      expect("queue-privacy", `${name}: viewer is refused`, messageOf(viewer) === "Editor access required", messageOf(viewer));
      const intake = await rejection(() => client.query(ref, { ...args, apiKey: intakeToken }));
      expect("queue-privacy", `${name}: intake token cannot read the queue`, messageOf(intake) === "Authentication failed: Invalid API key", messageOf(intake));
    }
    const editorList = await client.query(api.tripReportSubmissions.list, { ...editorArgs, status: "submitted", limit: 250 });
    expect("queue-privacy", "editor reads the queue (positive control)", editorList.some((row) => row.id === submissionId));
    expect("queue-privacy", "editor counts the queue (positive control)", (await client.query(api.tripReportSubmissions.countByStatus, { ...editorArgs, statuses: ["submitted"] })) >= 1);

    // ---------------------------------------------------------------- c. route (malformed, oversized, rate-limited, unauthorized)
    const malformed = await readResponse(await intakePost(intakeRequest("10.8.0.3", null, "{")));
    expect("route", "400 Invalid JSON body for malformed JSON", malformed.status === 400 && same(malformed.body, { error: "Invalid JSON body." }), malformed);
    const empty = await readResponse(await intakePost(intakeRequest("10.8.0.3", {})));
    expect("route", "400 validation failure lists every missing requirement", empty.status === 400 && same(empty.body, {
      error: "Submission validation failed.",
      errors: ["Title is required.", "At least one substance is required.", "Publish consent is required.", "Age confirmation is required."],
      warnings: [],
    }), empty);
    const oversized = await readResponse(await intakePost(intakeRequest("10.8.0.3", {
      ...input,
      report: { ...input.report, title: `${tag} oversized`, introduction: "x".repeat(MAX_SUBMISSION_PAYLOAD_BYTES) },
    })));
    expect("route", "413 Payload too large above 128 KiB", oversized.status === 413 && same(oversized.body, { error: "Payload too large." }), oversized);
    expect("route", "oversized body wrote nothing", (await count("tripReportSubmissions", '"title" = $1', [`${tag} oversized`])) === 0);

    const policy = getRateLimitPolicy("publicTripReportSubmit");
    const limitedIp = "10.8.0.4";
    const priorStatuses: number[] = [];
    for (let i = 0; i < policy.max; i += 1) priorStatuses.push((await intakePost(intakeRequest(limitedIp, {}))).status);
    const limited = await readResponse(await intakePost(intakeRequest(limitedIp, submissionInput(`${tag} rate limited`, authorName, members.admin, tag))));
    const limitedAgain = await readResponse(await intakePost(intakeRequest(limitedIp, {})));
    expect("route", `requests ${policy.max + 1} and ${policy.max + 2} from one IP inside ${policy.windowMs} ms answer 429`,
      priorStatuses.every((status) => status === 400) && limited.status === 429 && limitedAgain.status === 429
        && same(limited.body, { error: "Too many requests. Please try again later." }) && Number(limited.retryAfter) >= 1,
      { priorStatuses, limited, limitedAgain });
    expect("route", "a rate-limited valid submission wrote nothing", (await count("tripReportSubmissions", '"title" = $1', [`${tag} rate limited`])) === 0);
    const unlimitedElsewhere = await intakePost(intakeRequest("10.8.0.5", {}));
    expect("route", "another IP is not affected by the exhausted window", unlimitedElsewhere.status === 400);

    const wrongKeyRow = asSubmissionArg(createTripReportSubmission(submissionInput(`${tag} wrong key`, authorName, members.admin, tag), { id: `${tag}-wrong-key` }));
    const wrongKey = await rejection(() => client.mutation(api.tripReportSubmissions.create, { apiKey: `${tag}-not-a-key`, submission: wrongKeyRow }));
    expect("route", "create with an unknown apiKey is refused", messageOf(wrongKey) === "Authentication failed: Invalid API key", messageOf(wrongKey));
    const wrongIntent = await rejection(() => client.mutation(api.tripReportSubmissions.create, { apiKey: otherIntentToken, submission: wrongKeyRow }));
    expect("route", "create with a token scoped to another intent is refused", messageOf(wrongIntent) === "Authentication failed: Invalid API key", messageOf(wrongIntent));
    expect("route", "refused creates wrote nothing", (await count("tripReportSubmissions", '"id" = $1', [`${tag}-wrong-key`])) === 0);

    // ---------------------------------------------------------------- d. publish (promote)
    const editorTransition = await rejection(() => client.mutation(api.tripReportSubmissions.transition, { ...editorArgs, id: submissionId, status: "accepted", reviewer: members.editor }));
    expect("publish", "editor cannot transition a submission (admin floor)", messageOf(editorTransition) === "Admin access required", messageOf(editorTransition));
    const illegal = await rejection(() => client.mutation(api.tripReportSubmissions.transition, { ...adminArgs, id: submissionId, status: "exported", reviewer: members.admin }));
    expect("publish", "submitted -> exported is refused", messageOf(illegal) === "Illegal transition: submitted -> exported.", messageOf(illegal));
    const acceptedRow = await client.mutation(api.tripReportSubmissions.transition, { ...adminArgs, id: submissionId, status: "accepted", reviewer: members.admin, notes: "looks fine" });
    expect("publish", "admin moves the submission to accepted", acceptedRow.status === "accepted" && acceptedRow.reviewed_by === members.admin && acceptedRow.review_notes === "looks fine" && (await submissionRow(submissionId))?.status === "accepted");
    const preview = await client.query(api.tripReportSubmissions.previewPromotion, { ...editorArgs, id: submissionId, reviewer: members.editor });
    const expectedSlug = slugify(title);
    expect("publish", "editor previews the promotion payload", preview.payload.slug === expectedSlug && preview.payload.license === "public-domain" && preview.row.id === submissionId, preview.payload.slug);

    const promoted = await client.mutation(api.tripReportSubmissions.promote, { ...adminArgs, id: submissionId, reviewer: members.admin });
    const reportId = promoted.reportId as string;
    scratch.reportIds.push(reportId);
    scratch.reportSlugs.push(expectedSlug);
    const report = await reportRow(reportId);
    const subject = report?.subject as Record<string, unknown> | undefined;
    expect("publish", "promote inserts the published report with owner, license, and attribution marker",
      report?.slug === expectedSlug && report.owner_email === members.admin && report.license === "public-domain"
        && (report.attribution_review as { decision?: string } | null)?.decision === "declined" && subject?.name === authorName && !("profile_key" in (subject ?? {})),
      report && { slug: report.slug, owner_email: report.owner_email, license: report.license, attribution_review: report.attribution_review });
    expect("publish", "promote writes the tripReportSubstances associations in the same transaction",
      same(await substanceRows(reportId), [`${tag} alpha`, `${tag} beta`].sort()), await substanceRows(reportId));
    const exported = await submissionRow(submissionId);
    expect("publish", "submission is exported and points at the report", exported?.status === "exported" && exported.exported_trip_report_id === reportId && typeof exported.exported_at === "string");
    expect("publish", "promote queues the report publication outbox row", (await count("publicCachePublications", '"key" = $1 AND "pending" = true', [JSON.stringify({ kind: "report", slug: expectedSlug })])) === 1);
    const exportedPreview = await rejection(() => client.query(api.tripReportSubmissions.previewPromotion, { ...editorArgs, id: submissionId }));
    expect("publish", "an exported submission cannot be promoted twice", messageOf(exportedPreview) === "Only accepted submissions can be promoted. Current status: exported.", messageOf(exportedPreview));

    // ---------------------------------------------------------------- d. publish (update: ordered content + associations)
    const typedReportId = reportId as Id<"tripReports">;
    const record = await client.query(api.tripReports.getPortalRecord, { ...adminArgs, id: typedReportId });
    const updates = {
      ...record.fields,
      substances: [{ name: `${tag} Gamma`, dose: "5 mg" }, { name: `${tag} Alpha` }],
      onset: [{ time: "T+0:00", description: "first entry" }, { time: "T+0:15", description: "inserted entry" }, { time: "T+0:30", description: "second entry" }],
      peak: [{ time: "T+2:00", description: "peak entry" }, { time: "T+3:00", description: "late peak" }],
    };
    const before = await reportSnapshot(reportId, expectedSlug);
    const updated = await client.mutation(api.tripReports.update, {
      ...adminArgs, id: typedReportId, expected: record.fields, expectedRevision: record.revision, updates, operationId: `${tag}-op-1`,
    });
    const afterUpdate = await reportRow(reportId);
    const afterSnapshot = await reportSnapshot(reportId, expectedSlug);
    expect("publish", "update reports updated with a new revision", updated.updated === true && updated.slug === expectedSlug && updated.revision !== record.revision, updated);
    expect("publish", "ordered timeline and substances persisted in order",
      same(afterUpdate?.onset, updates.onset) && same(afterUpdate?.peak, updates.peak) && same(afterUpdate?.substances, JSON.parse(JSON.stringify(updates.substances))),
      afterUpdate && { onset: afterUpdate.onset, substances: afterUpdate.substances });
    expect("publish", "tripReportSubstances follow the new substance list (beta removed, gamma added)", same(afterSnapshot.substances, [`${tag} alpha`, `${tag} gamma`]), afterSnapshot.substances);
    expect("publish", "one revision journal row and a new outbox generation were written with the content",
      afterSnapshot.revisions === before.revisions + 1 && afterSnapshot.outboxHash !== before.outboxHash && afterSnapshot.reportHash !== before.reportHash,
      { before, after: afterSnapshot });
    const replayUpdate = await client.mutation(api.tripReports.update, {
      ...adminArgs, id: typedReportId, expected: record.fields, expectedRevision: record.revision, updates, operationId: `${tag}-op-1`,
    });
    expect("publish", "replaying the same operationId returns the recorded result without a second revision",
      replayUpdate.updated === true && (await reportSnapshot(reportId, expectedSlug)).revisions === afterSnapshot.revisions, replayUpdate);

    // Second half failure: content writes succeed, then the join-index insert
    // for an oversized substance name fails (btree tuple limit), so the whole
    // mutation must roll back.
    const hugeName = `${tag}-${randomBytes(6000).toString("base64")}`;
    const fresh = await client.query(api.tripReports.getPortalRecord, { ...adminArgs, id: typedReportId });
    const failing = { ...fresh.fields, introduction: "never visible", substances: [{ name: `${tag} Delta` }, { name: hugeName }] };
    const beforeFailure = await reportSnapshot(reportId, expectedSlug);
    const failure = await rejection(() => client.mutation(api.tripReports.update, {
      ...adminArgs, id: typedReportId, expected: fresh.fields, expectedRevision: fresh.revision, updates: failing, operationId: `${tag}-op-2`,
    }));
    const afterFailure = await reportSnapshot(reportId, expectedSlug);
    expect("publish", "update whose association write fails surfaces the SQL error", sqlCodeOf(failure) === "54000" && /index row size/.test(messageOf(failure)), messageOf(failure).slice(0, 120));
    expect("publish", "failed update left content, associations, revisions, and outbox unchanged", same(afterFailure, beforeFailure), { beforeFailure, afterFailure });
    expect("publish", "failed update recorded no operation receipt", (await count("contentRevisions", '"operationId" = $1', [`${tag}-op-2`])) === 0);
    expect("publish", "connection is reusable after the rollback", (await client.query(api.tripReports.getBySlug, { slug: expectedSlug }))?.title === title);

    const failingTitle = `${tag} never published`;
    const failingInput = submissionInput(failingTitle, authorName, "", tag);
    const failingRow = createTripReportSubmission({ ...failingInput, report: { ...failingInput.report, substances: [{ name: hugeName }] } }, { id: `${tag}-never-published` });
    scratch.submissionIds.push(failingRow.id);
    await client.mutation(api.tripReportSubmissions.create, { apiKey: intakeToken, submission: asSubmissionArg(failingRow) });
    await client.mutation(api.tripReportSubmissions.transition, { ...adminArgs, id: failingRow.id, status: "accepted", reviewer: members.admin });
    const failingSlug = slugify(failingTitle);
    const promoteFailure = await rejection(() => client.mutation(api.tripReportSubmissions.promote, { ...adminArgs, id: failingRow.id, reviewer: members.admin }));
    const failingSubmission = await submissionRow(failingRow.id);
    expect("publish", "promote whose association write fails surfaces the SQL error", sqlCodeOf(promoteFailure) === "54000", messageOf(promoteFailure).slice(0, 120));
    expect("publish", "failed promote left no report, no associations, no outbox row, and an unexported submission",
      (await count("tripReports", '"slug" = $1', [failingSlug])) === 0
        && (await count("tripReportSubstances", '"name_lower" LIKE $1', [`${tag}-%`])) === 0
        && (await count("publicCachePublications", '"key" = $1', [JSON.stringify({ kind: "report", slug: failingSlug })])) === 0
        && failingSubmission?.status === "accepted" && failingSubmission.exported_trip_report_id === null && failingSubmission.exported_at === null,
      failingSubmission && { status: failingSubmission.status, exported_trip_report_id: failingSubmission.exported_trip_report_id });

    // ---------------------------------------------------------------- e. public-projection
    const publicQueryArgs: Record<string, Record<string, unknown>> = {
      getAll: {},
      getBySlug: { slug: expectedSlug },
      getFeatured: {},
      getBySubstance: { substanceName: `${tag} GAMMA` },
      getBySubstanceNames: { substanceNames: [`${tag} gamma`, `${tag} nothing`] },
      getByAuthor: { authorName: authorName.toUpperCase() },
      getByContributor: { profileKey: "T08NONE", authorNames: [authorName] },
      getSubstanceNames: {},
      getAuthorNames: {},
    };
    const publicResults: Record<string, unknown> = {};
    for (const [name, args] of Object.entries(publicQueryArgs)) {
      const ref = (api.tripReports as unknown as Record<string, QueryRef>)[name];
      const error = await rejection(async () => { publicResults[name] = await client.query(ref, args); });
      const offending = new Set<string>();
      offendingFields(publicResults[name], offending);
      expect("public-projection", `tripReports.${name} returns only projection fields`, error === null && offending.size === 0, error ? messageOf(error).slice(0, 160) : [...offending]);
    }
    const bySlug = publicResults.getBySlug as Record<string, unknown> | null;
    expect("public-projection", "getBySlug exposes the promoted report with attribution_locked and no reviewer identity",
      bySlug !== null && bySlug.attribution_locked === true && bySlug.title === title && !("reviewer" in bySlug), bySlug && Object.keys(bySlug));
    const listedSlugs = (results: unknown) => (Array.isArray(results) ? results.map((row) => (row as { slug: string }).slug) : []);
    expect("public-projection", "getAll includes the promoted report", listedSlugs(publicResults.getAll).includes(expectedSlug));
    expect("public-projection", "getByAuthor matches the byline case-insensitively", same(listedSlugs(publicResults.getByAuthor), [expectedSlug]), publicResults.getByAuthor);
    expect("public-projection", "getByContributor does not attribute a reviewed byline to an unrelated profile", listedSlugs(publicResults.getByContributor).length === 0, publicResults.getByContributor);
    // The fixture leaves the tripReports read index unready, so this is the legacy scan; the join rows themselves are asserted in d.
    expect("public-projection", "getBySubstance finds the report by substance name, case-insensitively", listedSlugs(publicResults.getBySubstance).includes(expectedSlug), publicResults.getBySubstance);
    expect("public-projection", "getBySubstanceNames finds the report once", same(listedSlugs(publicResults.getBySubstanceNames), [expectedSlug]), publicResults.getBySubstanceNames);

    const adapter = getPublicDataReadAdapter();
    const adapterReads: Record<string, () => Promise<unknown>> = {
      getPublicTripReportRecords: () => adapter.getPublicTripReportRecords(),
      getPublicTripReportBySlug: () => adapter.getPublicTripReportBySlug(expectedSlug),
      getPublicTripReportsByAuthor: () => adapter.getPublicTripReportsByAuthor(authorName),
      getPublicTripReportsByContributor: () => adapter.getPublicTripReportsByContributor("T08NONE", [authorName]),
      getPublicTripReportsBySubstanceNames: () => adapter.getPublicTripReportsBySubstanceNames([`${tag} gamma`]),
    };
    const adapterResults: Record<string, unknown> = {};
    for (const [name, read] of Object.entries(adapterReads)) {
      const error = await rejection(async () => { adapterResults[name] = await read(); });
      const offending = new Set<string>();
      offendingFields(adapterResults[name], offending);
      expect("public-projection", `PublicDataReadAdapter.${name} returns only projection fields`, error === null && offending.size === 0, error ? messageOf(error).slice(0, 160) : [...offending]);
    }
    expect("public-projection", "adapter by-slug read is served from Postgres (scratch slug exists nowhere else)", (adapterResults.getPublicTripReportBySlug as { slug?: string } | null)?.slug === expectedSlug);
    expect("public-projection", "adapter records include the promoted report", listedSlugs(adapterResults.getPublicTripReportRecords).includes(expectedSlug));

    // ---------------------------------------------------------------- f. feedback
    const feedbackModules = [
      {
        module: "articleFeedback" as const,
        refs: api.articleFeedback as unknown as { create: MutationRef; list: QueryRef; countByStatus: QueryRef; transition: MutationRef },
        exists: "Article feedback already exists.",
        row: (i: number, createdAt: string, honeypot = false) => ({
          id: `${scratch.feedbackIdPrefix}article-${i}`, status: honeypot ? "spam" : "new", schema_version: 1, substance_slug: "lsd", substance_title: "LSD",
          category: "other", importance: "normal", details: `${tag} article feedback ${i}`, honeypot_triggered: honeypot, created_at: createdAt, updated_at: createdAt,
        }),
      },
      {
        module: "siteFeedback" as const,
        refs: api.siteFeedback as unknown as { create: MutationRef; list: QueryRef; countByStatus: QueryRef; transition: MutationRef },
        exists: "Site feedback already exists.",
        row: (i: number, createdAt: string, honeypot = false) => ({
          id: `${scratch.feedbackIdPrefix}site-${i}`, status: honeypot ? "spam" : "new", schema_version: 1, category: "misc", urgency: "normal",
          details: `${tag} site feedback ${i}`, page: "/lsd", honeypot_triggered: honeypot, created_at: createdAt, updated_at: createdAt,
        }),
      },
    ];
    for (const feedback of feedbackModules) {
      const scenario = `feedback:${feedback.module}`;
      const base = Date.now();
      const rows = [1, 2, 3].map((i) => feedback.row(i, new Date(base + i * 1000).toISOString()));
      for (const row of rows) await client.mutation(feedback.refs.create, { apiKey: intakeToken, feedback: row });
      expect(scenario, "three scratch rows created through create", (await count(feedback.module, '"id" = ANY($1)', [rows.map((row) => row.id)])) === 3);
      const duplicate = await rejection(() => client.mutation(feedback.refs.create, { apiKey: intakeToken, feedback: rows[0] }));
      expect(scenario, "replaying a public id is refused", messageOf(duplicate) === feedback.exists && (await count(feedback.module, '"id" = $1', [rows[0].id])) === 1, messageOf(duplicate));
      const wrongStart = await rejection(() => client.mutation(feedback.refs.create, { apiKey: intakeToken, feedback: { ...feedback.row(9, rows[0].created_at), status: "resolved" } }));
      expect(scenario, "create refuses a row that does not start as new", messageOf(wrongStart) === "Created feedback must start as new.", messageOf(wrongStart));

      const intakeList = await rejection(() => client.query(feedback.refs.list, { apiKey: intakeToken }));
      expect(scenario, "intake token cannot list the queue", messageOf(intakeList) === "Authentication failed: Invalid API key", messageOf(intakeList));
      const viewerList = await rejection(() => client.query(feedback.refs.list, { ...viewerArgs }));
      expect(scenario, "viewer cannot list the queue", messageOf(viewerList) === "Editor access required", messageOf(viewerList));
      const viewerReview = await rejection(() => client.mutation(feedback.refs.transition, { ...viewerArgs, id: rows[0].id, status: "reviewing", reviewer: members.viewer }));
      expect(scenario, "viewer cannot review", messageOf(viewerReview) === "Admin access required", messageOf(viewerReview));
      const editorReview = await rejection(() => client.mutation(feedback.refs.transition, { ...editorArgs, id: rows[0].id, status: "reviewing", reviewer: members.editor }));
      expect(scenario, "editor cannot review (admin floor)", messageOf(editorReview) === "Admin access required", messageOf(editorReview));
      const editorRows = (await client.query(feedback.refs.list, { ...editorArgs, status: "new", limit: 250 })) as { id: string }[];
      expect(scenario, "editor lists the queue (positive control)", rows.every((row) => editorRows.some((listed) => listed.id === row.id)));

      // Paging: the queue is newest-first by created_at and pages by limit.
      const full = (await client.query(feedback.refs.list, { ...adminArgs, status: "new", limit: 250 })) as { id: string; created_at: string }[];
      const sortedDesc = full.every((row, index) => index === 0 || full[index - 1].created_at >= row.created_at);
      const scratchOrder = full.filter((row) => row.id.startsWith(scratch.feedbackIdPrefix)).map((row) => row.id);
      expect(scenario, "list is ordered newest first with the scratch rows in creation order", sortedDesc && same(scratchOrder, [rows[2].id, rows[1].id, rows[0].id]), scratchOrder);
      const pages: string[][] = [];
      for (let offset = 0; ; offset += 2) {
        const page = (await client.query(feedback.refs.list, { ...adminArgs, status: "new", limit: offset + 2 })) as { id: string }[];
        pages.push(page.slice(offset).map((row) => row.id));
        if (page.length < offset + 2 || offset + 2 >= 250) break;
      }
      const paged = pages.flat();
      expect(scenario, `${pages.length} pages of size 2 reproduce the full order without duplicates`,
        same(paged, full.map((row) => row.id)) && new Set(paged).size === paged.length && pages.slice(0, -1).every((page) => page.length === 2) && rows.every((row) => paged.includes(row.id)),
        { pages: pages.length, paged: paged.length, full: full.length });

      // Transitions: enumerated from VALID_TRANSITIONS in the module.
      const newBefore = await client.query(feedback.refs.countByStatus, { ...adminArgs, statuses: ["new"] });
      const reviewing = await client.mutation(feedback.refs.transition, { ...adminArgs, id: rows[0].id, status: "reviewing", reviewer: members.admin, note: "taking a look" });
      const resolved = await client.mutation(feedback.refs.transition, { ...adminArgs, id: rows[0].id, status: "resolved", reviewer: members.admin });
      expect(scenario, "new -> reviewing -> resolved is allowed and keeps the note", reviewing.status === "reviewing" && resolved.status === "resolved" && resolved.review_notes === "taking a look" && resolved.reviewed_by === members.admin);
      const backToNew = await rejection(() => client.mutation(feedback.refs.transition, { ...adminArgs, id: rows[0].id, status: "new", reviewer: members.admin }));
      const storedStatus = (await pool.query(`SELECT "status" FROM "${feedback.module}" WHERE "id" = $1`, [rows[0].id])).rows[0]?.status;
      expect(scenario, "resolved -> new is refused and the row stays resolved", messageOf(backToNew) === "Illegal transition: resolved -> new." && storedStatus === "resolved", { error: messageOf(backToNew), storedStatus });
      const newAfter = await client.query(feedback.refs.countByStatus, { ...adminArgs, statuses: ["new"] });
      expect(scenario, "countByStatus reflects the transition", newAfter === newBefore - 1, { newBefore, newAfter });
      const spamRow = feedback.row(4, new Date(base + 4000).toISOString(), true);
      await client.mutation(feedback.refs.create, { apiKey: intakeToken, feedback: spamRow });
      const spamToResolved = await rejection(() => client.mutation(feedback.refs.transition, { ...adminArgs, id: spamRow.id, status: "resolved", reviewer: members.admin }));
      const spamToReviewing = await client.mutation(feedback.refs.transition, { ...adminArgs, id: spamRow.id, status: "reviewing", reviewer: members.admin });
      expect(scenario, "spam -> resolved is refused while spam -> reviewing is allowed", messageOf(spamToResolved) === "Illegal transition: spam -> resolved." && spamToReviewing.status === "reviewing", messageOf(spamToResolved));
      const missing = await rejection(() => client.mutation(feedback.refs.transition, { ...adminArgs, id: `${tag}-missing`, status: "reviewing", reviewer: members.admin }));
      expect(scenario, "transition of an unknown id is refused", /not found\.$/.test(messageOf(missing)), messageOf(missing));
    }

    // ---------------------------------------------------------------- c. route (persistence failure -> 500), last: it swaps the runtime target
    resetServerDataWriteCapabilityCacheForTests();
    process.env.POSTGRES_POOLED_URL = "postgres://localhost:1/dosewiki";
    process.env.POSTGRES_DIRECT_URL = process.env.POSTGRES_POOLED_URL;
    process.env.TARGET_POSTGRES_URL = process.env.POSTGRES_POOLED_URL;
    let failed: { status: number; body: unknown; retryAfter: string | null } | null = null;
    try {
      failed = await readResponse(await intakePost(intakeRequest("10.8.0.6", submissionInput(`${tag} unreachable`, authorName, members.admin, tag))));
    } finally {
      process.env.POSTGRES_POOLED_URL = target;
      process.env.POSTGRES_DIRECT_URL = target;
      process.env.TARGET_POSTGRES_URL = target;
      resetServerDataWriteCapabilityCacheForTests();
    }
    expect("route", "unreachable persistence returns a server error without disclosing the database target",
      failed?.status === 500 && !JSON.stringify(failed.body).includes("postgres://"), failed);
    expect("route", "unreachable persistence wrote nothing", (await count("tripReportSubmissions", '"title" = $1', [`${tag} unreachable`])) === 0);
  } finally {
    if (!keep) {
      const reportKeys = scratch.reportSlugs.map((slug) => JSON.stringify({ kind: "report", slug }));
      await pool.query('DELETE FROM "tripReportSubstances" WHERE "report_id" = ANY($1) OR "name_lower" LIKE $2', [scratch.reportIds, `${tag}%`]);
      await pool.query('DELETE FROM "publicCachePublications" WHERE "key" = ANY($1)', [reportKeys]);
      await pool.query('DELETE FROM "contentRevisions" WHERE "table" = $1 AND "key" = ANY($2)', ["tripReports", scratch.reportSlugs]);
      await pool.query('DELETE FROM "tripReports" WHERE "_id" = ANY($1) OR "slug" = ANY($2)', [scratch.reportIds, scratch.reportSlugs]);
      await pool.query('DELETE FROM "tripReportSubmissions" WHERE "id" = ANY($1) OR "title" LIKE $2', [scratch.submissionIds, `${tag}%`]);
      await pool.query('DELETE FROM "articleFeedback" WHERE "id" LIKE $1', [`${scratch.feedbackIdPrefix}%`]);
      await pool.query('DELETE FROM "siteFeedback" WHERE "id" LIKE $1', [`${scratch.feedbackIdPrefix}%`]);
      await pool.query('DELETE FROM "memberships" WHERE "_id" = ANY($1)', [scratch.membershipIds]);
    }
    const passed = checks.filter((c) => c.pass).length;
    const summary = {
      target: target.replace(/\/\/[^@]*@/, "//<redacted>@"),
      tag,
      kept: keep,
      elapsedMs: Math.round(performance.now() - started),
      passed,
      failed: checks.length - passed,
      checks,
    };
    fs.mkdirSync(runDirectory, { recursive: true });
    fs.writeFileSync(path.join(runDirectory, "report.json"), JSON.stringify(summary, null, 2));
    console.log(`\nReport: ${path.relative(ROOT, runDirectory)}/report.json`);
    console.log(JSON.stringify({ passed, failed: summary.failed, elapsedMs: summary.elapsedMs }));
    process.exitCode = summary.failed === 0 ? 0 : 1;
    await pool.end();
    for (const runtime of clients) await runtime.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : error);
  process.exit(1);
});
