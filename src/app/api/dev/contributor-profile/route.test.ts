import { beforeEach, describe, expect, it, vi } from "vitest";

import { roleSessionFor } from "@/test/routeSession";
import type { AppRole } from "@/lib/auth/roles";

import { GET, POST } from "./route";

vi.mock("server-only", () => ({}));

vi.mock("@server/postgres/runtime/api", () => ({
  api: {
    contributorProfiles: {
      getEditorProfile: "contributorProfiles.getEditorProfile",
      getOwnedProfile: "contributorProfiles.getOwnedProfile",
      saveProfile: "contributorProfiles.saveProfile",
      saveProfileAsEditor: "contributorProfiles.saveProfileAsEditor",
    },
    replications: { getByArtistNames: "replications.getByArtistNames" },
    tripReports: { getByContributor: "tripReports.getByContributor" },
  },
}));

const sessionMocks = vi.hoisted(() => ({
  requireRoleSession: vi.fn(),
}));

vi.mock("@/lib/auth/requireEditorSession", () => ({
  requireRoleSession: sessionMocks.requireRoleSession,
}));

vi.mock("@server/http/nextRateLimit", () => ({
  enforceRateLimit: vi.fn(async () => null),
}));

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  mutation: vi.fn(),
  revalidateContributorSurfaces: vi.fn(),
}));

vi.mock("@server/data/serverWriteCapability", () => ({
  getServerDataWriteCapability: () => ({
    ok: true,
    capability: {
      client: { query: mocks.query, mutation: mocks.mutation },
      adminKey: "admin-key",
    },
  }),
}));

vi.mock("./contributorRevalidation", () => ({
  revalidateContributorSurfaces: mocks.revalidateContributorSurfaces,
}));

vi.mock("@server/next/contributorAvatarUpload", () => ({
  normalizeAvatarUpload: () => null,
  uploadAvatarToR2: vi.fn(),
}));

function signIn(role: AppRole, email: string) {
  sessionMocks.requireRoleSession.mockImplementation(
    roleSessionFor(role, { email, name: "Someone" }),
  );
}

const storedProfile = (overrides: Record<string, unknown> = {}) => ({
  key: "ADA",
  displayName: "Ada",
  aliases: ["Lady Lovelace"],
  bio: "Analytical engines.",
  role: "Researcher",
  links: [],
  membershipEmail: "ada@example.com",
  avatarUrl: null,
  avatarStorageId: null,
  avatarR2Key: null,
  storedAvatarUrl: null,
  replicationOrder: [],
  reportOrder: [],
  exclude_from_gallery: false,
  archival: false,
  approved_replicator: false,
  staffNote: { markdown: "Internal note." },
  updatedAt: null,
  updatedBy: null,
  ...overrides,
});

function routeQueries(answers: {
  owned?: { key: string } | null;
  editorProfile?: Record<string, unknown> | null;
}) {
  mocks.query.mockImplementation(async (name: string) => {
    switch (name) {
      case "contributorProfiles.getOwnedProfile":
        return answers.owned ?? null;
      case "contributorProfiles.getEditorProfile":
        return answers.editorProfile ?? null;
      default:
        return [];
    }
  });
}

const getRequest = (key: string) =>
  new Request(`https://dose.wiki/api/dev/contributor-profile?key=${key}`);

const postRequest = (body: Record<string, unknown>) =>
  new Request("https://dose.wiki/api/dev/contributor-profile", {
    method: "POST",
    headers: { Origin: "https://dose.wiki", "Content-Type": "application/json" },
    body: JSON.stringify({ expectedUpdatedAt: null, ...body }),
  });

describe("contributor profile route", () => {
  beforeEach(() => {
    mocks.query.mockReset();
    mocks.mutation.mockReset();
    mocks.revalidateContributorSurfaces.mockReset();
    sessionMocks.requireRoleSession.mockReset();
  });

  it("refuses a legacy viewer sign-in on both verbs before touching Postgres", async () => {
    signIn("viewer", "ada@example.com");

    expect((await GET(getRequest("ADA"))).status).toBe(403);
    expect((await POST(postRequest({ key: "ADA", displayName: "Ada" }))).status).toBe(403);
    expect(sessionMocks.requireRoleSession).toHaveBeenCalledWith("contributor");
    expect(mocks.query).not.toHaveBeenCalled();
    expect(mocks.mutation).not.toHaveBeenCalled();
  });

  describe("as a contributor without editor role", () => {
    beforeEach(() => signIn("contributor", "ada@example.com"));

    it("refuses to read anyone else's record", async () => {
      routeQueries({ owned: { key: "ADA" }, editorProfile: storedProfile({ key: "JOSIE" }) });

      const response = await GET(getRequest("JOSIE"));

      expect(response.status).toBe(403);
      expect(mocks.query).not.toHaveBeenCalledWith(
        "contributorProfiles.getEditorProfile",
        expect.anything(),
      );
    });

    it("reads its own record with the staff-only fields withheld", async () => {
      routeQueries({ owned: { key: "ADA" }, editorProfile: storedProfile() });

      const response = await GET(getRequest("ada"));

      expect(response.status).toBe(200);
      const payload = await response.json();
      expect(payload.profile).toMatchObject({
        key: "ADA",
        displayName: "Ada",
        aliases: ["Lady Lovelace"],
        staffNote: null,
        membershipEmail: null,
      });
    });

    it("refuses a derived key whose record belongs to another sign-in", async () => {
      routeQueries({
        owned: null,
        editorProfile: storedProfile({ membershipEmail: "someone-else@example.com" }),
      });

      expect((await GET(getRequest("ADA"))).status).toBe(403);
    });

    it("saves through the self mutation and drops the admin fields", async () => {
      mocks.mutation.mockResolvedValue({
        profile: { key: "ADA", displayName: "Ada L." },
        revalidate: { contributorKeys: ["ADA"], reportSlugs: [] },
      });

      const response = await POST(
        postRequest({
          key: "ADA",
          displayName: "Ada L.",
          bio: "Updated bio.",
          links: [{ label: "Site", url: "https://example.com" }],
          avatarUrl: null,
          aliases: ["Countess"],
          role: "Admin",
          approved_replicator: true,
          staffNote: { markdown: "self-awarded" },
        }),
      );

      expect(response.status).toBe(200);
      expect(mocks.mutation).toHaveBeenCalledTimes(1);
      const [, args] = mocks.mutation.mock.calls[0] as [string, { actorEmail: string; profile: Record<string, unknown> }];
      expect(args.actorEmail).toBe("ada@example.com");
      for (const field of ["role", "aliases", "approved_replicator", "staffNote"]) {
        expect(args.profile).not.toHaveProperty(field);
      }
    });

    it("maps Postgres's ownership refusal to 403", async () => {
      mocks.mutation.mockRejectedValue(
        new Error("Uncaught Error: You can only edit your own contributor profile."),
      );

      const response = await POST(
        postRequest({ key: "JOSIE", displayName: "Josie", bio: "", links: [] }),
      );

      expect(response.status).toBe(403);
    });
  });

  describe("as an editor", () => {
    beforeEach(() => signIn("editor", "editor@example.com"));

    it("refuses a patch on a record another sign-in holds with 403, before any write", async () => {
      routeQueries({ editorProfile: storedProfile() });

      const response = await POST(postRequest({ key: "ADA", aliases: ["Countess"] }));

      expect(response.status).toBe(403);
      expect(await response.json()).toEqual({
        error: "You can only edit your own contributor profile.",
      });
      expect(mocks.mutation).not.toHaveBeenCalled();
    });

  });

  it("refuses an editor's link to a record another sign-in holds, before any write", async () => {
    signIn("editor", "editor@example.com");
    routeQueries({ editorProfile: storedProfile() });

    const response = await POST(postRequest({ key: "ADA", membershipEmail: "editor@example.com" }));

    expect(response.status).toBe(403);
    expect(mocks.mutation).not.toHaveBeenCalled();
  });
});
