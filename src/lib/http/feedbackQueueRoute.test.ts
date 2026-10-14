import { beforeEach, describe, expect, it, vi } from "vitest";

import { roleSessionFor } from "@/test/routeSession";

const authMocks = vi.hoisted(() => ({ requireRoleSession: vi.fn(), enforceRateLimit: vi.fn() }));

vi.mock("@/lib/auth/requireEditorSession", () => ({
  requireRoleSession: authMocks.requireRoleSession,
}));
vi.mock("@server/http/nextRateLimit", () => ({
  enforceRateLimit: authMocks.enforceRateLimit,
}));

import { feedbackQueueRoute } from "./feedbackQueueRoute";

class Unconfigured extends Error {}
type Status = "new" | "reviewing" | "resolved" | "rejected" | "spam";
const STATUSES: readonly Status[] = ["new", "reviewing", "resolved", "rejected", "spam"];
const isStatus = (value: unknown): value is Status =>
  typeof value === "string" && (STATUSES as readonly string[]).includes(value);

const getStore = vi.fn();

const GET = feedbackQueueRoute<Status>({
  isStatus,
  getStore,
  StorageConfigurationError: Unconfigured,
  sourceLabel: "thing",
  unexpectedErrorLabel: "Failed to load thing queue:",
  unexpectedErrorMessage: "Unable to load thing right now.",
});

describe("feedbackQueueRoute", () => {
  beforeEach(() => {
    authMocks.enforceRateLimit.mockReset().mockResolvedValue(null);
    getStore.mockReset();
  });

  it("needs an editor session", async () => {
    authMocks.requireRoleSession.mockImplementation(roleSessionFor(null));
    expect((await GET(new Request("https://dose.wiki/api/thing/queue"))).status).toBe(401);
    expect(getStore).not.toHaveBeenCalled();
  });
});
