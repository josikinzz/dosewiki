import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import type { AppRole, RoleFloor } from "@/lib/auth/roles";
import type { RateLimitPolicyName } from "@server/http/rateLimitPolicy";
import { roleSessionFor } from "./routeSession";

/**
 * Shared boundary mocks for routes built on `protectedRouteOperation` (and hand-rolled
 * routes that call the same three modules).
 *
 * `vi.mock` is hoisted only within the file that contains it, so this helper registers
 * the mocks with `vi.doMock`. Consequence for every caller: import the route AFTER
 * `installProtectedRouteMocks()` runs, with `await import("./route")` inside the test
 * (or inside `beforeEach`). A static `import { POST } from "./route"` at the top of the
 * test file will bypass these mocks.
 *
 * `server-only` is aliased to a stub in vitest.config.ts and needs no mock.
 */
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

/** Sign the fake session in as `role`; `null` is signed out. */
export function signInAs(role: AppRole | null, user?: SessionUser): void {
  routeMocks.requireRoleSession.mockImplementation(roleSessionFor(role, user));
}

/**
 * Grant the dataWrite capability around a client. Pass `intentToken` when the route
 * asks `getAdminIntentToken(...)`; omit it to exercise the adminKey fallback.
 */
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

/**
 * Reset every mock to the happy path: limiter allows, `role` signed in, capability
 * granted around `routeMocks.query`/`routeMocks.mutation`. Call in `beforeEach`.
 */
export function resetRouteMocks(role: AppRole = "editor", user?: SessionUser): void {
  vi.resetModules();
  for (const mock of Object.values(routeMocks)) mock.mockReset();
  routeMocks.enforceRateLimit.mockResolvedValue(null);
  signInAs(role, user);
  grantWriteCapability();
}

type RouteCall = { name: string; call: () => Promise<Response> };

/**
 * The floor contract every protected route owns individually: the exact `RoleFloor`
 * it asks for, the exact rate-limit policy, and that a refused role never reaches
 * Postgres. Refusal mechanics (401/403 bodies, ordering) are owned by
 * src/lib/http/protectedRouteOperation.test.ts and are not re-asserted here.
 */
export function describeRoleFloor(options: {
  floor: RoleFloor;
  rateLimit: RateLimitPolicyName;
  /** A role below the floor. */
  refused: AppRole;
  /** A role at or above the floor, used for the accept probe. */
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

    it(`throttles under the "${options.rateLimit}" policy before checking the session`, async () => {
      routeMocks.enforceRateLimit.mockResolvedValue(new Response(null, { status: 429 }));

      const response = await options.calls[0].call();

      expect(response.status).toBe(429);
      expect(routeMocks.enforceRateLimit).toHaveBeenCalledWith(expect.any(Request), options.rateLimit);
      expect(routeMocks.requireRoleSession).not.toHaveBeenCalled();
    });
  });
}
