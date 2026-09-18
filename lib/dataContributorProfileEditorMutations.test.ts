import { afterEach, describe, expect, it, vi } from "vitest";
import { saveProfileAsEditor, setContributorOrdering } from "../server/contributorProfiles";
import { replicationRevision } from "../server/lib/replicationEditJournal";
import {
  buildEditorProfilePatch,
  editorProfilePatchValidator,
  normalizeOrderSlugs,
  profileInputValidator,
  pruneOrderSlugs,
  type StoredProfile,
} from "../server/lib/contributorProfiles";

type Role = "admin" | "editor" | "viewer";

const baseProfile: StoredProfile = {
  key: "JOSIE",
  displayName: "Josie Kins",
  aliases: ["josie kins"],
  bio: "Founder.",
  role: "Founder",
  links: [{ label: "Site", url: "https://example.com" }],
  membershipEmail: "josie@example.com",
  avatarStorageId: "storage-1",
  replicationOrder: ["geometry"],
  reportOrder: ["first-report"],
  createdAt: "2024-01-01T00:00:00.000Z",
  updatedAt: "2024-01-01T00:00:00.000Z",
};

/**
 * Mirrors the mocked-ctx shape in `dataSubstanceIndexEditorReadAuth.test.ts`,
 * plus the `by_slug` existence lookups the ordering write performs and the
 * `contributorProfiles` row the profile patch reads back.
 */
function createCtx({
  memberships = {},
  profile = baseProfile,
  replicationSlugs = [],
  reportSlugs = [],
}: {
  memberships?: Record<string, Role>;
  profile?: StoredProfile | null;
  replicationSlugs?: string[];
  reportSlugs?: string[];
} = {}) {
  const patch = vi.fn(async (_id: string, patchValue: Record<string, unknown>) => {
    if (stored) {
      stored = { ...stored, ...patchValue } as StoredProfile;
    }
  });
  let stored: StoredProfile | null = profile;

  const lookup = (table: string, value: string) => {
    if (table === "contributorProfiles") {
      return stored && stored.key === value ? { _id: "profile-1", ...stored } : null;
    }
    if (table === "replications") {
      return replicationSlugs.includes(value) ? { _id: `rep-${value}`, slug: value } : null;
    }
    if (table === "tripReports") {
      return reportSlugs.includes(value) ? { _id: `rep-${value}`, slug: value } : null;
    }
    return null;
  };

  const insert = vi.fn(async (_table: string, _doc: Record<string, unknown>) => "revision-1");
  const ctx = {
    auth: { getUserIdentity: vi.fn(async () => null) },
    storage: { getUrl: vi.fn(async () => "https://cdn.example.com/avatar.png") },
    db: {
      normalizeId: () => null, // This fixture only mutates contributor profiles.
      patch,
      insert,
      query: vi.fn((table: string) => ({
        withIndex: (
          _indexName: string,
          selector: (query: { eq: (field: string, value: string) => unknown }) => unknown,
        ) => {
          let captured = "";
          const filter = {
            eq: (_field: string, value: string) => {
              captured = value;
              return filter;
            },
          };
          selector(filter);

          return {
            order: () => ({ first: async () => lookup(table, captured) }),
            first: vi.fn(async () => lookup(table, captured)),
            unique: vi.fn(async () => {
              if (table !== "memberships") {
                return lookup(table, captured);
              }
              const role = memberships[captured];
              return role ? { email: captured, role } : null;
            }),
          };
        },
      })),
    },
  };

  return {
    ctx: ctx as never,
    patch,
    insert,
    read: () => stored,
  };
}

// Postgres registered functions keep the original handler on `_handler`; there is
// no in-repo Postgres runtime harness, so the handler is exercised directly.
const asHandler = (fn: unknown) =>
  (fn as { _handler: (ctx: never, args: unknown) => Promise<never> })._handler;

const saveHandler = asHandler(saveProfileAsEditor);
const orderingHandler = asHandler(setContributorOrdering);

// `editorArgs` is an editor who does not own JOSIE; `ownerArgs` is the editor
// whose membership email the JOSIE row carries.
const editorArgs = { apiKey: "secret", actorEmail: "editor@example.com", expectedUpdatedAt: baseProfile.updatedAt };
const ownerArgs = { apiKey: "secret", actorEmail: "josie@example.com", expectedUpdatedAt: baseProfile.updatedAt };
const adminArgs = { apiKey: "secret", actorEmail: "admin@example.com", expectedUpdatedAt: baseProfile.updatedAt };
const editorMemberships: Record<string, Role> = {
  "editor@example.com": "editor",
  "josie@example.com": "editor",
  "admin@example.com": "admin",
};

describe("contributorProfiles.saveProfileAsEditor authorization", () => {
  afterEach(() => {
    delete process.env.DATA_ADMIN_KEY;
    delete process.env.DATA_ADMIN_TOKEN_PROFILE_MEDIA_WRITE;
  });

  it("rejects a non-editor membership", async () => {
    process.env.DATA_ADMIN_KEY = "secret";
    const harness = createCtx({ memberships: { "viewer@example.com": "viewer" } });

    await expect(
      saveHandler(harness.ctx, {
        apiKey: "secret",
        actorEmail: "viewer@example.com",
        key: "JOSIE",
        patch: { bio: "rewritten" },
      }),
    ).rejects.toThrow("Editor access required");

    expect(harness.patch).not.toHaveBeenCalled();
  });

  it("refuses an editor on a profile that is not their own", async () => {
    process.env.DATA_ADMIN_KEY = "secret";
    const harness = createCtx({ memberships: editorMemberships });

    await expect(
      saveHandler(harness.ctx, { ...editorArgs, key: "josie", patch: { bio: "New bio." } }),
    ).rejects.toThrow("You can only edit your own contributor profile.");

    expect(harness.patch).not.toHaveBeenCalled();
  });

  it("lets an editor edit their own profile", async () => {
    process.env.DATA_ADMIN_KEY = "secret";
    const harness = createCtx({ memberships: editorMemberships });

    const result = await saveHandler(harness.ctx, {
      ...ownerArgs,
      key: "josie",
      patch: { displayName: "Josie", bio: "New bio.", aliases: ["jo"] },
    });

    expect(harness.patch).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({
      updated: true,
      profile: { key: "JOSIE", displayName: "Josie", bio: "New bio." },
    });
    expect(harness.read()?.updatedBy).toBe("josie@example.com");
    // The version before the edit is journaled, whole, before the patch lands.
    expect(harness.insert).toHaveBeenCalledTimes(1);
    const [table, revision] = harness.insert.mock.calls[0] as [string, Record<string, unknown>];
    expect(table).toBe("contentRevisions");
    expect(revision).toMatchObject({
      table: "contributorProfiles",
      key: "JOSIE",
      action: "update",
      actorEmail: "josie@example.com",
      actorRole: "editor",
    });
    expect((revision.before as { bio?: string }).bio).toBe(baseProfile.bio);
    expect(harness.insert.mock.invocationCallOrder[0]).toBeLessThan(harness.patch.mock.invocationCallOrder[0]);
  });

  it("lets an admin edit a profile that is not their own", async () => {
    process.env.DATA_ADMIN_KEY = "secret";
    const harness = createCtx({ memberships: editorMemberships });

    const result = await saveHandler(harness.ctx, {
      ...adminArgs,
      key: "josie",
      patch: { bio: "Staff edit." },
    });

    expect(result).toMatchObject({ updated: true, profile: { key: "JOSIE", bio: "Staff edit." } });
    expect(harness.read()?.updatedBy).toBe("admin@example.com");
  });

  it.each([
    ["role", { role: "Project Lead" }],
    ["membershipEmail", { membershipEmail: "someone@example.com" }],
    ["approved_replicator", { approved_replicator: true }],
    ["exclude_from_gallery", { exclude_from_gallery: false }],
    ["archival", { archival: true }],
    ["staffNote", { staffNote: null }],
  ])("refuses an owning editor's patch that names the %s field, even alongside allowed ones", async (field, patch) => {
    process.env.DATA_ADMIN_KEY = "secret";
    const harness = createCtx({ memberships: editorMemberships });

    await expect(
      saveHandler(harness.ctx, { ...ownerArgs, key: "JOSIE", patch: { bio: "fine", ...patch } }),
    ).rejects.toMatchObject({
      data: { code: "ADMIN_ONLY_PROFILE_FIELD", field },
    });

    expect(harness.patch).not.toHaveBeenCalled();
  });

  it("lets an admin set the trust fields", async () => {
    process.env.DATA_ADMIN_KEY = "secret";
    const harness = createCtx({ memberships: editorMemberships });

    const result = await saveHandler(harness.ctx, {
      ...adminArgs,
      key: "josie",
      patch: { role: "Project Lead", membershipEmail: "josie@new.example" },
    });

    expect(result).toMatchObject({ profile: { key: "JOSIE", role: "Project Lead" } });
    expect(harness.read()?.membershipEmail).toBe("josie@new.example");
    expect(harness.read()?.updatedBy).toBe("admin@example.com");
  });

  it("patches only the named fields and never clears the omitted ones", async () => {
    process.env.DATA_ADMIN_KEY = "secret";
    const harness = createCtx({ memberships: editorMemberships });

    await saveHandler(harness.ctx, { ...ownerArgs, key: "JOSIE", patch: { bio: "Only the bio." } });

    const [, patchValue] = harness.patch.mock.calls[0] as [string, Record<string, unknown>];
    expect(Object.keys(patchValue).sort()).toEqual(["bio", "updatedAt", "updatedBy"]);
    expect(patchValue).not.toHaveProperty("role");
    expect(patchValue).not.toHaveProperty("links");
    expect(patchValue).not.toHaveProperty("avatarStorageId");

    const after = harness.read();
    expect(after?.role).toBe("Founder");
    expect(after?.links).toEqual(baseProfile.links);
    expect(after?.membershipEmail).toBe("josie@example.com");
    expect(after?.replicationOrder).toEqual(["geometry"]);
  });

  it("refuses a key that has no profile row", async () => {
    process.env.DATA_ADMIN_KEY = "secret";
    const harness = createCtx({ memberships: editorMemberships, profile: null });

    await expect(
      saveHandler(harness.ctx, { ...editorArgs, key: "GHOST", patch: { bio: "x" } }),
    ).rejects.toThrow('Profile "GHOST" not found.');
  });
});

describe("contributorProfiles.setContributorOrdering", () => {
  afterEach(() => {
    delete process.env.DATA_ADMIN_KEY;
    delete process.env.DATA_ADMIN_TOKEN_PROFILE_MEDIA_WRITE;
  });

  it("rejects a non-editor membership", async () => {
    process.env.DATA_ADMIN_KEY = "secret";
    const harness = createCtx({ memberships: { "viewer@example.com": "viewer" } });

    await expect(
      orderingHandler(harness.ctx, {
        apiKey: "secret",
        actorEmail: "viewer@example.com",
        key: "JOSIE",
        replicationOrder: ["geometry"],
      }),
    ).rejects.toThrow("Editor access required");

    expect(harness.patch).not.toHaveBeenCalled();
  });

  it("refuses an editor on a profile that is not their own", async () => {
    process.env.DATA_ADMIN_KEY = "secret";
    const harness = createCtx({ memberships: editorMemberships, replicationSlugs: ["geometry"] });

    await expect(
      orderingHandler(harness.ctx, { ...editorArgs, key: "JOSIE", replicationOrder: ["geometry"] }),
    ).rejects.toThrow("You can only edit your own contributor profile.");

    expect(harness.patch).not.toHaveBeenCalled();
  });

  it("lets an admin order a profile that is not their own", async () => {
    process.env.DATA_ADMIN_KEY = "secret";
    const harness = createCtx({ memberships: editorMemberships, replicationSlugs: ["geometry"] });

    const result = await orderingHandler(harness.ctx, {
      ...adminArgs,
      key: "JOSIE",
      expectedRevision: await replicationRevision(harness.ctx, { _id: "profile-1", ...harness.read() }, "artist:JOSIE"),
      replicationOrder: ["geometry"],
    });

    expect(result).toMatchObject({ status: "ok", key: "JOSIE", replicationOrder: ["geometry"] });
    expect(harness.read()?.updatedBy).toBe("admin@example.com");
  });

  it("stores the requested order and prunes slugs with no row", async () => {
    process.env.DATA_ADMIN_KEY = "secret";
    const harness = createCtx({
      memberships: editorMemberships,
      replicationSlugs: ["geometry", "tracers"],
      reportSlugs: ["first-report"],
    });

    const result = await orderingHandler(harness.ctx, {
      ...ownerArgs,
      key: "JOSIE",
      expectedRevision: await replicationRevision(harness.ctx, { _id: "profile-1", ...harness.read() }, "artist:JOSIE"),
      replicationOrder: ["tracers", "deleted-one", "geometry", "tracers"],
      reportOrder: ["first-report", "gone"],
    });

    expect(result).toMatchObject({
      key: "JOSIE",
      replicationOrder: ["tracers", "geometry"],
      reportOrder: ["first-report"],
      prunedReplicationSlugs: ["deleted-one"],
      prunedReportSlugs: ["gone"],
    });
  });

  it("leaves an omitted ordering alone and clears one given as an empty array", async () => {
    process.env.DATA_ADMIN_KEY = "secret";
    const harness = createCtx({
      memberships: editorMemberships,
      replicationSlugs: ["geometry"],
      reportSlugs: ["first-report"],
    });

    await orderingHandler(harness.ctx, { ...ownerArgs, key: "JOSIE", reportOrder: [] });

    const [, patchValue] = harness.patch.mock.calls[0] as [string, Record<string, unknown>];
    expect(patchValue).not.toHaveProperty("replicationOrder");
    expect(patchValue.reportOrder).toEqual([]);
    expect(harness.read()?.replicationOrder).toEqual(["geometry"]);
  });
});

describe("ordering slug normalization", () => {
  it("trims, drops blanks, and de-duplicates while preserving order", () => {
    expect(normalizeOrderSlugs([" b ", "a", "b", "", "   ", "a"])).toEqual(["b", "a"]);
    expect(normalizeOrderSlugs(undefined)).toEqual([]);
  });

  it("splits an ordering into surviving and stale slugs", () => {
    expect(pruneOrderSlugs(["a", "ghost", "b"], ["a", "b", "c"])).toEqual({
      order: ["a", "b"],
      pruned: ["ghost"],
    });
  });

  it("keeps curation partial: unlisted known slugs are not added", () => {
    expect(pruneOrderSlugs(["b"], ["a", "b", "c"]).order).toEqual(["b"]);
  });
});

describe("buildEditorProfilePatch", () => {
  it("omits every field the caller did not name", () => {
    const patch = buildEditorProfilePatch({ bio: "hi" }, baseProfile, "editor@example.com");
    expect(Object.keys(patch).sort()).toEqual(["bio", "updatedAt", "updatedBy"]);
  });

  it("clears a clearable field only on an explicit null", () => {
    // A cleared field must be PRESENT and undefined: that is how Postgres's patch
    // spells a delete. An absent key would leave the stored value in place.
    const clearedRole = buildEditorProfilePatch({ role: null }, baseProfile, "e@example.com");
    expect(Object.keys(clearedRole)).toContain("role");
    expect(clearedRole.role).toBeUndefined();

    const clearedEmail = buildEditorProfilePatch(
      { membershipEmail: null },
      baseProfile,
      "e@example.com",
    );
    expect(Object.keys(clearedEmail)).toContain("membershipEmail");
    expect(clearedEmail.membershipEmail).toBeUndefined();

    expect(Object.keys(buildEditorProfilePatch({}, baseProfile, "e@example.com"))).not.toContain(
      "role",
    );
  });

  it("refuses to blank the display name and folds a rename into the aliases", () => {
    const patch = buildEditorProfilePatch({ displayName: "   " }, baseProfile, "e@example.com");
    expect(patch.displayName).toBe("Josie Kins");

    const renamed = buildEditorProfilePatch({ displayName: "Jo" }, baseProfile, "e@example.com");
    expect(renamed.aliases).toEqual(expect.arrayContaining(["josie kins", "josie", "jo"]));
  });

  it("swaps a stored avatar between storage and url without stranding the other", () => {
    const uploaded = buildEditorProfilePatch(
      { avatarStorageId: "storage-2" },
      baseProfile,
      "e@example.com",
    );
    expect(uploaded).toMatchObject({ avatarStorageId: "storage-2", avatarUrl: undefined });

    const cleared = buildEditorProfilePatch({ avatarUrl: null }, baseProfile, "e@example.com");
    expect(cleared).toMatchObject({ avatarStorageId: undefined, avatarUrl: undefined });
  });

  it("stores the gallery exclusion as true-or-absent, never as a stored false", () => {
    const excluded = buildEditorProfilePatch(
      { exclude_from_gallery: true },
      baseProfile,
      "e@example.com",
    );
    expect(excluded.exclude_from_gallery).toBe(true);

    // Toggling back to included deletes the field: present-but-undefined is
    // Postgres's spelling of a delete, and absent is the "included" default.
    const included = buildEditorProfilePatch(
      { exclude_from_gallery: false },
      { ...baseProfile, exclude_from_gallery: true },
      "e@example.com",
    );
    expect(Object.keys(included)).toContain("exclude_from_gallery");
    expect(included.exclude_from_gallery).toBeUndefined();

    expect(
      Object.keys(buildEditorProfilePatch({ bio: "hi" }, baseProfile, "e@example.com")),
    ).not.toContain("exclude_from_gallery");
  });

  it("stores the archival flag as true-or-absent, never as a stored false", () => {
    const archived = buildEditorProfilePatch({ archival: true }, baseProfile, "e@example.com");
    expect(archived.archival).toBe(true);

    const restored = buildEditorProfilePatch(
      { archival: false },
      { ...baseProfile, archival: true },
      "e@example.com",
    );
    expect(Object.keys(restored)).toContain("archival");
    expect(restored.archival).toBeUndefined();

    expect(
      Object.keys(buildEditorProfilePatch({ bio: "hi" }, baseProfile, "e@example.com")),
    ).not.toContain("archival");
  });

  it("stores the approved replicator flag as true-or-absent, never as a stored false", () => {
    const approved = buildEditorProfilePatch(
      { approved_replicator: true },
      baseProfile,
      "e@example.com",
    );
    expect(approved.approved_replicator).toBe(true);

    const withdrawn = buildEditorProfilePatch(
      { approved_replicator: false },
      { ...baseProfile, approved_replicator: true },
      "e@example.com",
    );
    expect(Object.keys(withdrawn)).toContain("approved_replicator");
    expect(withdrawn.approved_replicator).toBeUndefined();

    expect(
      Object.keys(buildEditorProfilePatch({ bio: "hi" }, baseProfile, "e@example.com")),
    ).not.toContain("approved_replicator");
  });

  it("stores a staff note sanitized and clears it on null or an emptied note", () => {
    const noted = buildEditorProfilePatch(
      { staffNote: { markdown: "A **note**.\r\n", attribution: "  Josie Kins ·  founder  " } },
      baseProfile,
      "e@example.com",
    );
    expect(noted.staffNote).toEqual({
      markdown: "A **note**.\n",
      attribution: "Josie Kins · founder",
    });

    // A blank attribution is omitted entirely rather than stored as "".
    const unattributed = buildEditorProfilePatch(
      { staffNote: { markdown: "Kept.", attribution: "   " } },
      baseProfile,
      "e@example.com",
    );
    expect(unattributed.staffNote).toEqual({ markdown: "Kept." });

    // Cleared notes are present-but-undefined: Postgres's spelling of a delete.
    for (const cleared of [
      buildEditorProfilePatch(
        { staffNote: null },
        { ...baseProfile, staffNote: { markdown: "Old." } },
        "e@example.com",
      ),
      buildEditorProfilePatch(
        { staffNote: { markdown: "   " } },
        { ...baseProfile, staffNote: { markdown: "Old." } },
        "e@example.com",
      ),
    ]) {
      expect(Object.keys(cleared)).toContain("staffNote");
      expect(cleared.staffNote).toBeUndefined();
    }

    expect(
      Object.keys(buildEditorProfilePatch({ bio: "hi" }, baseProfile, "e@example.com")),
    ).not.toContain("staffNote");
  });

  it("keeps the staff-only fields off the self-serve validator surface", () => {
    // `saveProfile` (the self-serve path) validates against a strict object,
    // so a field the validator does not name is rejected at the Postgres
    // boundary. The editor patch naming them is what makes them admin-only.
    const selfServeFields = Object.keys(profileInputValidator.fields);
    expect(selfServeFields).not.toContain("archival");
    expect(selfServeFields).not.toContain("staffNote");
    expect(selfServeFields).not.toContain("exclude_from_gallery");
    expect(selfServeFields).not.toContain("approved_replicator");

    const editorFields = Object.keys(editorProfilePatchValidator.fields);
    expect(editorFields).toEqual(
      expect.arrayContaining([
        "archival",
        "staffNote",
        "exclude_from_gallery",
        "approved_replicator",
      ]),
    );
  });
});
