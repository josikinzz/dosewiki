import { PostgresError } from "../../lib/postgres/runtime/values"
import type { Doc, Id } from "../../lib/postgres/runtime/dataModel"
import type { MutationCtx, QueryCtx } from "../../lib/postgres/runtime/server"
import { contentHash } from "../../lib/proposals/contentHash";
import { requireRole, roleMeetsFloor } from "./auth";
import { findRevisionOperation, recordRevision } from "./contentRevisions";
import {
  assertAuthorNameClaimAdjudicated,
  normalizeAssignedProfileKey,
  normalizeAuthorMatchName,
  resolveEditorAssignedProfileKey,
} from "./tripReportAttribution";
import {
  editableSnapshotOf,
  editableSnapshotsAgree,
  normalizeEditableFields,
  validateEditableFields,
  type TripReportEditableFields,
} from "./tripReportEditing";
import { findMembershipByEmail, ownsReport, refuseNotOwner } from "./tripReportOwnership";
export async function getPortalRowsHandler(
  ctx: QueryCtx,
  args: { apiKey?: string; actorEmail?: string },
) {
  await requireRole(
    ctx,
    { apiKey: args.apiKey, actorEmail: args.actorEmail, adminIntent: "editorArticleWrite" },
    "editor",
  );
  const reports = await ctx.db.query("tripReports").collect();
  return reports.map((report) => {
    const fields = editableSnapshotOf(report);
    return {
      id: report._id,
      slug: report.slug,
      title: fields.title,
      subject: { name: fields.subject.name, trip_date: fields.subject.trip_date },
      substances: fields.substances,
      tags: fields.tags,
      featured: report.featured ?? false,
      license: report.license,
      profileKey: report.subject.profile_key,
      ownerEmail: report.owner_email,
      attributionReview: report.attribution_review,
      createdAt: report._creationTime,
    };
  });
}

type EditableFieldsInput = TripReportEditableFields;
type UpdateTripReportArgs = {
  apiKey?: string;
  actorEmail?: string;
  id: Id<"tripReports">;
  expected: EditableFieldsInput;
  expectedRevision: string;
  updates: EditableFieldsInput;
  profileKey?: string;
  confirmAuthorNameClaim?: boolean;
  operationId?: string;
};

async function reportRevision(ctx: QueryCtx | MutationCtx, report: Doc<"tripReports">) {
  const latest = await ctx.db.query("contentRevisions")
    .withIndex("by_table_key", (q) => q.eq("table", "tripReports").eq("key", report.slug))
    .order("desc").first();
  return contentHash({ report, journalId: latest?._id ?? null });
}

export async function getPortalRecordHandler(
  ctx: QueryCtx,
  args: {
    apiKey?: string;
    actorEmail?: string;
    id?: Id<"tripReports">;
    slug?: string;
    contextual?: boolean;
  },
) {
  const actor = await requireRole(
    ctx,
    { apiKey: args.apiKey, actorEmail: args.actorEmail, adminIntent: "editorArticleWrite" },
    "contributor",
  );

  const report = args.id ? await ctx.db.get(args.id) : args.slug
    ? await ctx.db.query("tripReports").withIndex("by_slug", (q) => q.eq("slug", args.slug!)).unique()
    : null;
  if (!report) throw new Error(`Trip report ${args.id} no longer exists.`);
  if (!roleMeetsFloor(actor.role, "editor") && !ownsReport(actor, report)) refuseNotOwner(report);
  if (args.contextual && actor.role !== "admin" && !ownsReport(actor, report)) refuseNotOwner(report);

  return {
    id: report._id,
    slug: report.slug,
    ...(!args.contextual ? { ownerEmail: report.owner_email } : {}),
    canEdit: actor.role === "admin" || ownsReport(actor, report),
    fields: editableSnapshotOf(report),
    revision: await reportRevision(ctx, report),
  };
}

function assertOwnerEditsContentOnly(
  row: Doc<"tripReports">,
  args: UpdateTripReportArgs,
  updates: TripReportEditableFields,
): void {
  const carried = args.updates as Record<string, unknown>;
  const subject = carried.subject as Record<string, unknown> | undefined;
  const locked = ["featured", "slug"].filter((key) => key in carried);
  if (subject && "profile_key" in subject) locked.push("subject.profile_key");
  if (args.profileKey !== undefined) locked.push("profileKey");
  if (normalizeAuthorMatchName(updates.subject.name) !== normalizeAuthorMatchName(row.subject.name)) {
    locked.push("subject.name");
  }
  if (locked.length > 0) {
    throw new PostgresError({
      code: "EDITOR_ONLY_REPORT_FIELD",
      message: `Only an admin can change ${locked.join(", ")} on trip report ${row.slug}.`,
    });
  }
}

export async function updateHandler(ctx: MutationCtx, args: UpdateTripReportArgs) {
  const actor = await requireRole(
    ctx,
    { apiKey: args.apiKey, actorEmail: args.actorEmail, adminIntent: "editorArticleWrite" },
    "contributor",
  );

  const row = await ctx.db.get(args.id);
  if (!row) throw new Error(`Trip report ${args.id} no longer exists.`);

  if (actor.role !== "admin" && !ownsReport(actor, row)) refuseNotOwner(row);
  const requestIdentity = contentHash({ id: args.id, expectedRevision: args.expectedRevision, expected: normalizeEditableFields(args.expected), updates: normalizeEditableFields(args.updates), profileKey: args.profileKey, confirmAuthorNameClaim: args.confirmAuthorNameClaim });
  const prior = await findRevisionOperation(ctx, "tripReports", row.slug, args.operationId, actor.email);
  if (prior) {
    if (prior.requestIdentity !== requestIdentity || !prior.after || !prior.revision) {
      throw new PostgresError({ code: "REPORT_OPERATION_REUSED", message: "This publication ID belongs to a different report correction. Reconcile the original correction before publishing again." });
    }
    return { updated: contentHash(prior.before) !== contentHash(prior.after), slug: row.slug, fields: editableSnapshotOf(prior.after as Doc<"tripReports">), revision: contentHash({ report: prior.after, journalId: prior._id }) };
  }
  if (!args.expectedRevision || args.expectedRevision !== await reportRevision(ctx, row)) {
    throw new PostgresError({ code: "REPORT_CONFLICT", message: "This report or its attribution changed since it was opened. Your local corrections are retained; reload and reconcile before publishing." });
  }
  if (!editableSnapshotsAgree(editableSnapshotOf(row), normalizeEditableFields(args.expected))) {
    throw new PostgresError({ code: "REPORT_CONFLICT", message: "This report's editable fields changed since it was opened. Your local corrections are retained; reload and reconcile before publishing." });
  }

  const updates = normalizeEditableFields(args.updates);
  if (actor.role !== "admin") {
    if (!ownsReport(actor, row)) refuseNotOwner(row);
    assertOwnerEditsContentOnly(row, args, updates);
  }

  const problems = validateEditableFields(updates);
  if (problems.length > 0) throw new Error(`Trip report ${row.slug} cannot be saved: ${problems.join(" ")}`);

  const storedProfileKey = normalizeAssignedProfileKey(row.subject.profile_key);
  const reassigningProfile = args.profileKey !== undefined;
  const assignedProfileKey = reassigningProfile
    ? await resolveEditorAssignedProfileKey(ctx, args.profileKey)
    : storedProfileKey;
  const bylineMoved = normalizeAuthorMatchName(updates.subject.name) !== normalizeAuthorMatchName(row.subject.name);

  if (bylineMoved) {
    await assertAuthorNameClaimAdjudicated(ctx, {
      authorName: updates.subject.name,
      assignedProfileKey,
      confirmAuthorNameClaim: args.confirmAuthorNameClaim,
    });
  }

  const subject: typeof row.subject = { ...updates.subject };
  if (row.subject.avatar_url !== undefined) subject.avatar_url = row.subject.avatar_url;
  if (row.subject.pdf_url !== undefined) subject.pdf_url = row.subject.pdf_url;
  if (assignedProfileKey) subject.profile_key = assignedProfileKey;

  const patch: Partial<Omit<Doc<"tripReports">, "_id" | "_creationTime">> = {
    title: updates.title,
    subject,
    substances: updates.substances,
    introduction: updates.introduction,
    onset: updates.onset,
    peak: updates.peak,
    offset: updates.offset,
    conclusion: updates.conclusion,
    tags: updates.tags,
  };
  const attributionDecided = bylineMoved || assignedProfileKey !== storedProfileKey;
  if (row.attribution_review && attributionDecided) {
    patch.attribution_review = {
      reviewed_by: actor.name || actor.email,
      reviewed_at: new Date().toISOString(),
      decision: assignedProfileKey ? ("assigned" as const) : ("declined" as const),
    };
  }
  const baseline = editableSnapshotOf(row);
  for (const key of ["title", "substances", "introduction", "onset", "peak", "offset", "conclusion", "tags"] as const) {
    if (JSON.stringify(baseline[key]) === JSON.stringify(updates[key])) delete patch[key];
  }
  for (const key of ["name", "trip_date", "age", "gender", "height", "weight", "medications", "setting"] as const) {
    if (baseline.subject[key] === updates.subject[key]) {
      if (row.subject[key] === undefined) delete subject[key];
      else subject[key] = row.subject[key];
    }
  }
  const revision = args.operationId ?? new Date().toISOString();
  if (editableSnapshotsAgree(baseline, updates) && !attributionDecided) {
    if (args.operationId) await recordRevision(ctx, { table: "tripReports", key: row.slug, action: "update", before: row, after: row, actor, operationId: args.operationId, revision, publications: ["dose.wiki", "Effect Index"], requestIdentity });
    return { updated: false, slug: row.slug, fields: baseline, revision: await reportRevision(ctx, row) };
  }

  await recordRevision(ctx, { table: "tripReports", key: row.slug, action: "update", before: row, after: { ...row, ...patch }, actor, operationId: args.operationId, revision, publications: ["dose.wiki", "Effect Index"], requestIdentity });
  await ctx.db.patch(args.id, patch);
  return { updated: true, slug: row.slug, fields: updates, revision: await reportRevision(ctx, { ...row, ...patch } as Doc<"tripReports">) };
}

function summarizeOwnedReport(report: Doc<"tripReports">) {
  return {
    id: report._id,
    slug: report.slug,
    title: report.title.trim(),
    ownerEmail: report.owner_email,
    tripDate: report.subject.trip_date,
    createdAt: report._creationTime,
  };
}

export async function listOwnedHandler(
  ctx: QueryCtx,
  args: { apiKey?: string; actorEmail?: string; all?: boolean },
) {
  const actor = await requireRole(
    ctx,
    { apiKey: args.apiKey, actorEmail: args.actorEmail, adminIntent: "editorArticleWrite" },
    "contributor",
  );
  if (args.all === true) {
    if (actor.role !== "admin") {
      throw new PostgresError({ code: "FORBIDDEN", message: "Only an admin can list every owned report." });
    }
    const reports = await ctx.db.query("tripReports").collect();
    return reports.filter((report) => report.owner_email !== undefined).map(summarizeOwnedReport);
  }
  const reports = await ctx.db.query("tripReports")
    .withIndex("by_owner_email", (q) => q.eq("owner_email", actor.email)).collect();
  return reports.map(summarizeOwnedReport);
}

export async function assignOwnerHandler(
  ctx: MutationCtx,
  args: { apiKey?: string; actorEmail?: string; slug: string; email: string },
) {
  await requireRole(
    ctx,
    { apiKey: args.apiKey, actorEmail: args.actorEmail, adminIntent: "editorArticleWrite" },
    "admin",
  );
  const report = await ctx.db.query("tripReports")
    .withIndex("by_slug", (q) => q.eq("slug", args.slug)).unique();
  if (!report) {
    throw new PostgresError({ code: "REPORT_NOT_FOUND", message: `No trip report has the slug "${args.slug}".` });
  }
  const membership = await findMembershipByEmail(ctx, args.email);
  if (!membership) {
    throw new PostgresError({ code: "MEMBER_NOT_FOUND", message: `No membership for ${args.email.trim()}.` });
  }
  await ctx.db.patch(report._id, { owner_email: membership.email });
  return { slug: report.slug, ownerEmail: membership.email };
}
