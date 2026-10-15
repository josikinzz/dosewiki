import { v } from "../../lib/postgres/runtime/values";

export const membershipRoleValidator = v.union(
  v.literal("admin"),
  v.literal("editor"),
  v.literal("editor_translator"),
  v.literal("translator"),
  v.literal("contributor"),
  v.literal("viewer"),
);

export const membership = v.object({
  email: v.string(),
  username: v.optional(v.string()),
  passwordHash: v.optional(v.string()),
  passwordUpdatedAt: v.optional(v.string()),
  resetTokenHash: v.optional(v.string()),
  resetTokenExpiresAt: v.optional(v.string()),
  invitedBy: v.optional(v.string()),
  inviteCodeId: v.optional(v.id("inviteCodes")),
  bannedAt: v.optional(v.string()),
  name: v.optional(v.string()),
  image: v.optional(v.string()),
  role: membershipRoleValidator,
  glossaryLocales: v.optional(v.array(v.string())),
  provider: v.optional(v.string()),
  providerAccountId: v.optional(v.string()),
  createdAt: v.string(),
  updatedAt: v.string(),
  lastSeenAt: v.optional(v.string()),
});

export const inviteCode = v.object({
  codeHash: v.string(),
  role: v.union(v.literal("editor"), v.literal("translator"), v.literal("editor_translator"), v.literal("contributor")),
  glossaryLocales: v.optional(v.array(v.string())),
  createdBy: v.string(),
  createdAt: v.string(),
  expiresAt: v.string(),
  maxUses: v.number(),
  redemptions: v.array(v.object({ email: v.string(), at: v.string() })),
  revokedAt: v.optional(v.string()),
  note: v.optional(v.string()),
});

export const changeProposalStatusValidator = v.union(
  v.literal("submitted"),
  v.literal("changes_requested"),
  v.literal("applied"),
  v.literal("rejected"),
  v.literal("superseded"),
  v.literal("reverted"),
);

const changeProposalTargetKindValidator = v.union(
  v.literal("article"),
  v.literal("indexLayout"),
  v.literal("about"),
  v.literal("copyBlock"),
  v.literal("writing"),
);

const changeProposalTargetValidator = v.object({
  kind: changeProposalTargetKindValidator,
  key: v.string(),
  baseHash: v.string(),
});

export const changeProposal = v.object({
  proposedBy: v.string(),
  createdAt: v.string(),
  updatedAt: v.string(),
  status: changeProposalStatusValidator,
  targets: v.array(changeProposalTargetValidator),
  payload: v.any(),
  summary: v.string(),
  diff: v.string(),
  diffVersion: v.optional(v.literal(1)),
  revisionOf: v.optional(v.id("changeProposals")),
  reviewedBy: v.optional(v.string()),
  reviewedAt: v.optional(v.string()),
  reviewNotes: v.optional(v.string()),
  comments: v.array(v.object({ by: v.string(), at: v.string(), text: v.string() })),
  appliedAt: v.optional(v.string()),
  appliedChangelogEntryId: v.optional(v.string()),
  snapshotBefore: v.optional(v.any()),
  appliedHashes: v.optional(
    v.array(v.object({ kind: changeProposalTargetKindValidator, key: v.string(), hash: v.string() })),
  ),
  revertedAt: v.optional(v.string()),
  conflictReason: v.optional(v.string()),
});
