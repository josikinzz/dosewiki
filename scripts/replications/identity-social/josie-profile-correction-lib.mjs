import { digest } from "./executor-lib.mjs";

export const JOSIE_PROFILE_ID = "kx73mtdhqbqj5hszsgfn8ecrzh853fvx";
export const JOSIE_PROFILE_KEY = "JOSIE";
export const JOSIE_PERSONAL_WEBSITE = Object.freeze({
  label: "personal website",
  url: "https://josiekins.xyz/",
});
export const JOSIE_RESTORED_AVATAR = Object.freeze({
  publicUrl: "https://dose.wiki/profile-avatars/josie/avatar.webp",
  sha256: "81bb237d8653e5183678588df069b7e4c986817e5acea96c754c3ce7e20074b6",
  byteSize: 20_166,
});
export const JOSIE_REPLACEMENT_AVATAR = Object.freeze({
  publicUrl: "https://dosewiki-media.gremblinzuwu.workers.dev/media/sha256/3a/3a25402323f1e8da1cca71611e8f30a912254fc4bc1a69a31caf43d553e8f545.webp",
  r2Key: "media/sha256/3a/3a25402323f1e8da1cca71611e8f30a912254fc4bc1a69a31caf43d553e8f545.webp",
  sha256: "3a25402323f1e8da1cca71611e8f30a912254fc4bc1a69a31caf43d553e8f545",
});

const EXPECTED_PROFILE = Object.freeze({
  key: JOSIE_PROFILE_KEY,
  displayName: "Josie Kins",
  aliases: ["josie", "josikinz", "josie kins", "josikins"],
  avatarStorageId: null,
  avatarR2Key: null,
  avatarUrl: JOSIE_RESTORED_AVATAR.publicUrl,
  bio: "Hi, my name is josie and i have been learning web development ^_^",
  role: "Founder",
  links: [
    JOSIE_PERSONAL_WEBSITE,
    { label: "Reddit", url: "https://www.reddit.com/user/josikins/" },
  ],
});

function assertTrustedReceipt(receipt) {
  if (!receipt || receipt.url !== JOSIE_RESTORED_AVATAR.publicUrl) {
    throw new Error("Josie avatar receipt must verify the deployed restored-avatar URL.");
  }
  if (receipt.content_sha256 !== JOSIE_RESTORED_AVATAR.sha256 || receipt.byte_size !== JOSIE_RESTORED_AVATAR.byteSize) {
    throw new Error("Josie avatar receipt bytes do not match the owner-preferred pre-campaign avatar.");
  }
  if (![200, 206].includes(receipt.http_status) || !Number.isInteger(receipt.verified_at)) {
    throw new Error("Josie avatar receipt must be a successful timestamped byte verification.");
  }
  if (receipt.verifier !== "dosewiki-admin/identity-social-full-byte-verifier-v1") {
    throw new Error("Josie avatar receipt was not produced by the trusted delivery verifier.");
  }
  const { receipt_digest: suppliedDigest, ...receiptCore } = receipt;
  if (suppliedDigest !== digest(receiptCore)) throw new Error("Josie avatar receipt digest is invalid.");
}

export function buildJosieProfileCorrection({ receipt }) {
  assertTrustedReceipt(receipt);
  const expectedBefore = {
    currentAvatarSha256: JOSIE_REPLACEMENT_AVATAR.sha256,
    currentAvatarUrl: JOSIE_REPLACEMENT_AVATAR.publicUrl,
    currentAvatarProvenance: "profile-controlled",
  };
  const evidenceCore = {
    kind: "editorial-review",
    note: "Profile owner explicitly rejected the campaign replacement and selected the previously installed avatar for restoration.",
  };
  const evidence = { ...evidenceCore, digest: digest(evidenceCore) };
  const projectionCore = {
    kind: "profile-avatar",
    target: { profileKey: JOSIE_PROFILE_KEY },
    // Use the deployed identity/social contract's supported replacement action.
    // The owner-directed restoration semantics remain content-bound below.
    action: "propose-provenance-improving-avatar-replacement",
    expectedBefore,
    expectedBeforeSha256: digest(expectedBefore),
    after: {
      publicUrl: JOSIE_RESTORED_AVATAR.publicUrl,
      derivativeSha256: JOSIE_RESTORED_AVATAR.sha256,
      derivativeByteSize: JOSIE_RESTORED_AVATAR.byteSize,
      derivativeFormat: "image/webp",
      upscaled: false,
    },
    evidence: {
      reviewDecision: "owner-directed-restore",
      preservationNote: "Preserve the replaced campaign avatar and all prior avatar history; append this restored avatar as a new history row.",
    },
  };
  const projectionOperationId = `identity-social:profile-avatar-correction:${digest(projectionCore).slice(0, 24)}`;
  const projection = {
    operationId: projectionOperationId,
    ...projectionCore,
    cas: {
      comparison: "canonical-json-sha256",
      expectedBeforeSha256: digest(expectedBefore),
      onMismatch: "abort-without-write",
    },
  };
  const value = {
    profile_id: JOSIE_PROFILE_ID,
    provenance: "profile-controlled",
    public_url: JOSIE_RESTORED_AVATAR.publicUrl,
    source_url: JOSIE_RESTORED_AVATAR.publicUrl,
    media_digest: JOSIE_RESTORED_AVATAR.sha256,
    delivery_verification: "verified",
    delivery_verified_at: receipt.verified_at,
    delivery_receipt: receipt,
    evidence: [evidence],
  };
  const baseProjectionDigest = digest({ schemaVersion: 1, correction: projection });
  const entryCore = {
    schemaVersion: 1,
    projection,
    target: { kind: "avatar", profile_id: JOSIE_PROFILE_ID, media_digest: value.media_digest },
    value,
    base_projection_digest: baseProjectionDigest,
    receipt_sidecar_digest: null,
  };
  const avatarEntry = {
    kind: "avatar",
    item_operation_id: `identity-social-item:v1:${digest(entryCore).slice(0, 24)}`,
    expected_operation_id: null,
    projection,
    base_projection_digest: baseProjectionDigest,
    receipt_sidecar_digest: null,
    value,
  };
  const avatarBatchOperationId = `identity-social-batch:avatar:${digest({ kind: "avatar", entries: [avatarEntry] }).slice(0, 24)}`;
  const profileOperationId = `josie-owner-profile-correction:${digest({
    profileId: JOSIE_PROFILE_ID,
    expectedLinks: EXPECTED_PROFILE.links,
    desiredLinks: [JOSIE_PERSONAL_WEBSITE],
    avatarSha256: JOSIE_RESTORED_AVATAR.sha256,
  }).slice(0, 24)}`;
  const expectedProfile = structuredClone(EXPECTED_PROFILE);
  const desiredProfile = { ...structuredClone(EXPECTED_PROFILE), links: [JOSIE_PERSONAL_WEBSITE] };
  const profileEntry = {
    outcome: "existing-profile",
    creatorName: "Josie Kins",
    creatorKind: "person",
    profileId: JOSIE_PROFILE_ID,
    expected: expectedProfile,
    profile: desiredProfile,
  };

  return {
    profileId: JOSIE_PROFILE_ID,
    avatar: {
      operationId: avatarBatchOperationId,
      kind: "avatar",
      entries: [avatarEntry],
    },
    profile: {
      operationId: profileOperationId,
      entries: [profileEntry],
    },
    rollback: [
      { kind: "profile", operationId: profileOperationId, entries: [profileEntry] },
      {
        kind: "avatar",
        operation_id: `identity-social-rollback:${digest({ rollbackOf: avatarBatchOperationId }).slice(0, 24)}`,
        rollback_of: avatarBatchOperationId,
      },
    ],
  };
}

export function assertJosieCorrectionLiveState({ profile, avatarHistory }, correction) {
  if (!profile || profile._id !== JOSIE_PROFILE_ID || profile.key !== JOSIE_PROFILE_KEY) {
    throw new Error("Josie immutable profile identity changed.");
  }
  if (profile.avatarUrl !== JOSIE_RESTORED_AVATAR.publicUrl || profile.avatarSha256 !== JOSIE_RESTORED_AVATAR.sha256) {
    throw new Error("Josie restored avatar is not current.");
  }
  if (profile.avatarR2Key != null || profile.avatarStorageId != null || profile.avatarProvenance !== "profile-controlled") {
    throw new Error("Josie restored avatar references are inconsistent.");
  }
  if (JSON.stringify(profile.links) !== JSON.stringify([JOSIE_PERSONAL_WEBSITE])) {
    throw new Error("Josie must expose only her personal website.");
  }
  const history = Array.isArray(avatarHistory) ? avatarHistory : [];
  if (!history.some((item) => item.media_digest === JOSIE_REPLACEMENT_AVATAR.sha256)) {
    throw new Error("The replaced campaign avatar was not preserved in history.");
  }
  if (!history.some((item) => item.media_digest === JOSIE_RESTORED_AVATAR.sha256)) {
    throw new Error("The restored avatar was not appended to history.");
  }
  if (correction.profileId !== profile._id) throw new Error("Correction readback targets a different profile.");
  return true;
}
