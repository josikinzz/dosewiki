import { afterEach, describe, expect, it, vi } from "vitest";
import { saveProfileAsEditor, setContributorOrdering } from "../server/contributorProfiles";
import {
  editorProfilePatchValidator,
  profileInputValidator,
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
 * plus the `contributorProfiles` row the profile patch reads back.
 */
function createCtx({
  memberships = {},
  profile = baseProfile,
}: {
  memberships?: Record<string, Role>;
  profile?: StoredProfile | null;
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
    const harness = createCtx({ memberships: editorMemberships });

    await expect(
      orderingHandler(harness.ctx, { ...editorArgs, key: "JOSIE", replicationOrder: ["geometry"] }),
    ).rejects.toThrow("You can only edit your own contributor profile.");

    expect(harness.patch).not.toHaveBeenCalled();
  });
});

describe("profile validator surfaces", () => {
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
