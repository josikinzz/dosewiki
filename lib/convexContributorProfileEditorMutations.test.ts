import { afterEach, describe, expect, it, vi } from "vitest";
import { saveProfileAsEditor, setContributorOrdering } from "../convex/contributorProfiles";
import {
  buildEditorProfilePatch,
  normalizeOrderSlugs,
  pruneOrderSlugs,
  type StoredProfile,
} from "../convex/lib/contributorProfiles";

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
 * Mirrors the mocked-ctx shape in `convexSubstanceIndexEditorReadAuth.test.ts`,
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

  const ctx = {
    auth: { getUserIdentity: vi.fn(async () => null) },
    storage: { getUrl: vi.fn(async () => "https://cdn.example.com/avatar.png") },
    db: {
      patch,
      query: vi.fn((table: string) => ({
        withIndex: (
          _indexName: string,
          selector: (query: { eq: (field: string, value: string) => unknown }) => unknown,
        ) => {
          let captured = "";
          selector({
            eq: (_field, value) => {
              captured = value;
              return {};
            },
          });

          return {
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
    read: () => stored,
  };
}

// Convex registered functions keep the original handler on `_handler`; there is
// no in-repo Convex runtime harness, so the handler is exercised directly.
const asHandler = (fn: unknown) =>
  (fn as { _handler: (ctx: never, args: unknown) => Promise<never> })._handler;

const saveHandler = asHandler(saveProfileAsEditor);
const orderingHandler = asHandler(setContributorOrdering);

const editorArgs = { apiKey: "secret", actorEmail: "editor@example.com" };
const editorMemberships: Record<string, Role> = { "editor@example.com": "editor" };

describe("contributorProfiles.saveProfileAsEditor authorization", () => {
  afterEach(() => {
    delete process.env.CONVEX_ADMIN_KEY;
    delete process.env.CONVEX_ADMIN_TOKEN_PROFILE_MEDIA_WRITE;
  });

  it("rejects an unauthenticated caller before touching the profile row", async () => {
    const harness = createCtx();

    await expect(
      saveHandler(harness.ctx, { key: "JOSIE", patch: { bio: "rewritten" } }),
    ).rejects.toThrow("Authentication required");

    expect(harness.patch).not.toHaveBeenCalled();
  });

  it("rejects a non-editor membership", async () => {
    process.env.CONVEX_ADMIN_KEY = "secret";
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

  it("lets an editor edit a profile that is not their own", async () => {
    process.env.CONVEX_ADMIN_KEY = "secret";
    const harness = createCtx({ memberships: editorMemberships });

    const result = await saveHandler(harness.ctx, {
      ...editorArgs,
      key: "josie",
      patch: { displayName: "Josie", bio: "New bio.", role: "Project Lead" },
    });

    expect(harness.patch).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({
      updated: true,
      profile: { key: "JOSIE", displayName: "Josie", bio: "New bio.", role: "Project Lead" },
    });
    expect(harness.read()?.updatedBy).toBe("editor@example.com");
  });

  it("patches only the named fields and never clears the omitted ones", async () => {
    process.env.CONVEX_ADMIN_KEY = "secret";
    const harness = createCtx({ memberships: editorMemberships });

    await saveHandler(harness.ctx, { ...editorArgs, key: "JOSIE", patch: { bio: "Only the bio." } });

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
    process.env.CONVEX_ADMIN_KEY = "secret";
    const harness = createCtx({ memberships: editorMemberships, profile: null });

    await expect(
      saveHandler(harness.ctx, { ...editorArgs, key: "GHOST", patch: { bio: "x" } }),
    ).rejects.toThrow('Profile "GHOST" not found.');
  });
});

describe("contributorProfiles.setContributorOrdering", () => {
  afterEach(() => {
    delete process.env.CONVEX_ADMIN_KEY;
    delete process.env.CONVEX_ADMIN_TOKEN_PROFILE_MEDIA_WRITE;
  });

  it("rejects an unauthenticated caller before writing an ordering", async () => {
    const harness = createCtx();

    await expect(
      orderingHandler(harness.ctx, { key: "JOSIE", replicationOrder: ["geometry"] }),
    ).rejects.toThrow("Authentication required");

    expect(harness.patch).not.toHaveBeenCalled();
  });

  it("rejects a non-editor membership", async () => {
    process.env.CONVEX_ADMIN_KEY = "secret";
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

  it("stores the requested order and prunes slugs with no row", async () => {
    process.env.CONVEX_ADMIN_KEY = "secret";
    const harness = createCtx({
      memberships: editorMemberships,
      replicationSlugs: ["geometry", "tracers"],
      reportSlugs: ["first-report"],
    });

    const result = await orderingHandler(harness.ctx, {
      ...editorArgs,
      key: "JOSIE",
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
    process.env.CONVEX_ADMIN_KEY = "secret";
    const harness = createCtx({
      memberships: editorMemberships,
      replicationSlugs: ["geometry"],
      reportSlugs: ["first-report"],
    });

    await orderingHandler(harness.ctx, { ...editorArgs, key: "JOSIE", reportOrder: [] });

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
    // A cleared field must be PRESENT and undefined: that is how Convex's patch
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
});
