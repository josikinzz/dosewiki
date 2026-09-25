import { v } from "../../lib/postgres/runtime/values";

/** Account, invite, and change-proposal document validators for `server/schema.ts`. */

// One row per account. `email` is the actor key every write is stamped with;
// `username` is what the person types at sign-in. `viewer` is a legacy stored
// value from the retired GitHub sign-in and grants nothing.
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

// Invite codes: the only way an account is created. The plaintext is shown
// once at mint time; only its hash is stored.
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

// Editor change proposals: one staged commit-panel save per row, held for an
// admin. `payload` is the exact save-article body the shell built; `targets`
// pins each production row it touches with a content hash taken at submit
// time, so apply can refuse a proposal whose base has moved on. Status moves
// only along lib/proposals/proposalStatus.ts.
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
  /** Present only when submit generated this diff from a verified server baseline. */
  diffVersion: v.optional(v.literal(1)),
  revisionOf: v.optional(v.id("changeProposals")),
  reviewedBy: v.optional(v.string()),
  reviewedAt: v.optional(v.string()),
  reviewNotes: v.optional(v.string()),
  comments: v.array(v.object({ by: v.string(), at: v.string(), text: v.string() })),
  appliedAt: v.optional(v.string()),
  appliedChangelogEntryId: v.optional(v.string()),
  /** Per-target `readProposalTarget` documents captured right before apply; what revert writes back. */
  snapshotBefore: v.optional(v.any()),
  /** Per-target live hashes right after apply; revert refuses when production has moved past them. */
  appliedHashes: v.optional(
    v.array(v.object({ kind: changeProposalTargetKindValidator, key: v.string(), hash: v.string() })),
  ),
  revertedAt: v.optional(v.string()),
  conflictReason: v.optional(v.string()),
});
