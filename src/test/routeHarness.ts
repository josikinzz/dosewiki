import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import type { AppRole, RoleFloor } from "@/lib/auth/roles";
import { roleSessionFor } from "./routeSession";

export const routeMocks = {
  requireRoleSession: vi.fn(),
  enforceRateLimit: vi.fn(),
  getServerDataWriteCapability: vi.fn(),
  query: vi.fn(),
  mutation: vi.fn(),
};

export type RouteClient = { query: Mock; mutation: Mock };

export function installProtectedRouteMocks(): void {
  vi.doMock("@/lib/auth/requireEditorSession", () => ({
    requireRoleSession: routeMocks.requireRoleSession,
  }));
  vi.doMock("@server/http/nextRateLimit", () => ({
    enforceRateLimit: routeMocks.enforceRateLimit,
  }));
  vi.doMock("@server/data/serverWriteCapability", () => ({
    getServerDataWriteCapability: routeMocks.getServerDataWriteCapability,
  }));
}

type SessionUser = { email: string; name?: string | null };

export function signInAs(role: AppRole | null, user?: SessionUser): void {
  routeMocks.requireRoleSession.mockImplementation(roleSessionFor(role, user));
}

export function grantWriteCapability(
  client: RouteClient = { query: routeMocks.query, mutation: routeMocks.mutation },
  options: { adminKey?: string; intentToken?: string } = {},
): RouteClient {
  routeMocks.getServerDataWriteCapability.mockReturnValue({
    ok: true,
    capability: {
      adminKey: options.adminKey ?? "admin-key",
      client,
      ...(options.intentToken ? { getAdminIntentToken: vi.fn(() => options.intentToken) } : {}),
    },
  });
  return client;
}

export function resetRouteMocks(role: AppRole = "editor", user?: SessionUser): void {
  vi.resetModules();
  for (const mock of Object.values(routeMocks)) mock.mockReset();
  routeMocks.enforceRateLimit.mockResolvedValue(null);
  signInAs(role, user);
  grantWriteCapability();
}

type RouteCall = { name: string; call: () => Promise<Response> };

export function describeRoleFloor(options: {
  floor: RoleFloor;
  refused: AppRole;
  admitted?: AppRole;
  calls: RouteCall[];
}) {
  describe(`role floor "${options.floor}"`, () => {
    beforeEach(() => {
      resetRouteMocks(options.admitted ?? options.floor);
    });

    it.each(options.calls.map((c) => [c.name, c] as const))(
      `refuses a ${options.refused} on %s before touching Postgres`,
      async (_name, route) => {
        signInAs(options.refused);

        const response = await route.call();

        expect(response.status).toBe(403);
        expect(routeMocks.requireRoleSession).toHaveBeenCalledWith(options.floor);
        expect(routeMocks.query).not.toHaveBeenCalled();
        expect(routeMocks.mutation).not.toHaveBeenCalled();
      },
    );

    it("refuses a signed-out caller with 401 before touching Postgres", async () => {
      signInAs(null);

      const response = await options.calls[0].call();

      expect(response.status).toBe(401);
      expect(routeMocks.query).not.toHaveBeenCalled();
      expect(routeMocks.mutation).not.toHaveBeenCalled();
    });
  });
}
