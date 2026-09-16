import { beforeEach, describe, expect, it, vi } from "vitest";

import { roleSessionFor } from "@/test/routeSession";

import { POST } from "./route";

vi.mock("server-only", () => ({}));

vi.mock("@server/postgres/runtime/api", () => ({
  api: {
    contributorProfiles: {
      mergeProfileInto: "contributorProfiles.mergeProfileInto",
      deleteProfile: "contributorProfiles.deleteProfile",
      retargetTripReportsToContributor: "contributorProfiles.retargetTripReportsToContributor",
    },
  },
}));

const authMocks = vi.hoisted(() => ({ requireRoleSession: vi.fn() }));

vi.mock("@/lib/auth/requireEditorSession", () => ({
  requireRoleSession: authMocks.requireRoleSession,
}));

vi.mock("@server/http/nextRateLimit", () => ({
  enforceRateLimit: vi.fn(async () => null),
}));

const mocks = vi.hoisted(() => ({
  mutation: vi.fn(),
  revalidateContributorSurfaces: vi.fn(),
}));

vi.mock("@server/data/serverWriteCapability", () => ({
  getServerDataWriteCapability: () => ({
    ok: true,
    capability: { client: { mutation: mocks.mutation }, adminKey: "admin-key" },
  }),
}));

vi.mock("../contributorRevalidation", () => ({
  revalidateContributorSurfaces: mocks.revalidateContributorSurfaces,
}));

const ADMIN = { email: "admin@example.com", name: "Admin" };

const dangerRequest = (body: Record<string, unknown>) =>
  new Request("https://dose.wiki/api/dev/contributor-profile/danger", {
    method: "POST",
    headers: { "content-type": "application/json", Origin: "https://dose.wiki" },
    body: JSON.stringify(body),
  });

describe("contributor profile danger route", () => {
  beforeEach(() => {
    mocks.mutation.mockReset();
    mocks.revalidateContributorSurfaces.mockReset();
    authMocks.requireRoleSession.mockReset().mockImplementation(roleSessionFor("admin", ADMIN));
  });

  it("refuses an editor on every action before touching Postgres", async () => {
    authMocks.requireRoleSession.mockImplementation(roleSessionFor("editor"));

    for (const body of [
      { action: "delete", key: "ADA", confirmKey: "ADA" },
      { action: "merge", fromKey: "ADA", toKey: "JOSIE", confirmKey: "ADA" },
      { action: "retarget", authorName: "ada", contributorKey: "ADA", confirmKey: "ADA" },
    ]) {
      const response = await POST(dangerRequest(body));
      expect(response.status).toBe(403);
    }
    expect(authMocks.requireRoleSession).toHaveBeenCalledWith("admin");
    expect(mocks.mutation).not.toHaveBeenCalled();
  });

  it("deletes as the signed-in admin, naming them as the actor", async () => {
    mocks.mutation.mockResolvedValue({
      deleted: true,
      key: "ADA",
      displayName: "Ada",
      aliasesRemoved: ["countess"],
    });

    const response = await POST(dangerRequest({ action: "delete", key: "ADA", confirmKey: "ada" }));

    expect(response.status).toBe(200);
    expect(mocks.mutation).toHaveBeenCalledWith("contributorProfiles.deleteProfile", {
      apiKey: "admin-key",
      actorEmail: "admin@example.com",
      key: "ADA",
      confirmDelete: true,
    });
  });

  it("merges as the signed-in admin, naming them as the actor", async () => {
    mocks.mutation.mockResolvedValue({
      mergedFrom: "ADA",
      mergedInto: "JOSIE",
      aliases: ["ada"],
      reportsUpdated: 2,
      revalidate: { contributorKeys: ["ADA", "JOSIE"], reportSlugs: [] },
    });

    const response = await POST(
      dangerRequest({ action: "merge", fromKey: "ADA", toKey: "JOSIE", confirmKey: "ADA" }),
    );

    expect(response.status).toBe(200);
    expect(mocks.mutation).toHaveBeenCalledWith("contributorProfiles.mergeProfileInto", {
      apiKey: "admin-key",
      actorEmail: "admin@example.com",
      fromKey: "ADA",
      toKey: "JOSIE",
      discardSourceContent: false,
    });
  });
});
