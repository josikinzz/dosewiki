import { createHash } from "node:crypto";
import { PostgresError } from "@server/postgres/runtime/values";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { verifyPassword } from "@server/auth/passwords";

import { POST } from "./route";

vi.mock("server-only", () => ({}));

const rateLimit = vi.hoisted(() => ({ enforceRateLimit: vi.fn() }));

vi.mock("@server/http/nextRateLimit", () => ({
  enforceRateLimit: rateLimit.enforceRateLimit,
}));

const memberships = vi.hoisted(() => ({ consumePasswordReset: vi.fn() }));

vi.mock("@server/auth/memberships", () => memberships);

const TOKEN = "a".repeat(64);
const PASSPHRASE = "correct horse battery";

const post = (body: Record<string, unknown>) =>
  new Request("https://dev.dose.wiki/api/reset-password", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

describe("POST /api/reset-password", () => {
  beforeEach(() => {
    rateLimit.enforceRateLimit.mockReset().mockResolvedValue(null);
    memberships.consumePasswordReset.mockReset().mockResolvedValue(undefined);
  });

  it("shares the sign-in brake and stops at the limiter", async () => {
    const limited = Response.json({ error: "Too many attempts." }, { status: 429 });
    rateLimit.enforceRateLimit.mockResolvedValue(limited);

    const response = await POST(post({ token: TOKEN, password: PASSPHRASE }));

    expect(response).toBe(limited);
    expect(rateLimit.enforceRateLimit).toHaveBeenCalledWith(expect.any(Request), "authCredentialAttempt");
    expect(memberships.consumePasswordReset).not.toHaveBeenCalled();
  });

  it("hashes the token and the password, then consumes the reset", async () => {
    const response = await POST(post({ token: TOKEN.toUpperCase(), password: PASSPHRASE }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
    expect(memberships.consumePasswordReset).toHaveBeenCalledTimes(1);

    const [tokenHash, passwordHash] = memberships.consumePasswordReset.mock.calls[0] as [string, string];
    expect(tokenHash).toBe(createHash("sha256").update(TOKEN).digest("hex"));
    expect(passwordHash.startsWith("scrypt$")).toBe(true);
    await expect(verifyPassword(PASSPHRASE, passwordHash)).resolves.toBe(true);
  });

  it("refuses a malformed token and a weak password before touching Postgres", async () => {
    for (const body of [
      { password: PASSPHRASE },
      { token: "not-a-token", password: PASSPHRASE },
      { token: TOKEN, password: "short" },
      { token: TOKEN, password: ` ${PASSPHRASE}` },
    ]) {
      const response = await POST(post(body));
      expect(response.status, JSON.stringify(body)).toBe(400);
    }
    expect(memberships.consumePasswordReset).not.toHaveBeenCalled();
  });

  it("maps an unknown or expired token to a 4xx with the reader-facing message", async () => {
    memberships.consumePasswordReset.mockRejectedValue(
      new PostgresError({
        code: "RESET_TOKEN_INVALID",
        message: "This reset link is invalid or has expired. Ask an admin for a new one.",
      }),
    );

    const response = await POST(post({ token: TOKEN, password: PASSPHRASE }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      code: "RESET_TOKEN_INVALID",
      error: "This reset link is invalid or has expired. Ask an admin for a new one.",
    });
  });

  it("reports an outage as 500 without leaking the error", async () => {
    memberships.consumePasswordReset.mockRejectedValue(new Error("connect ECONNREFUSED"));
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const response = await POST(post({ token: TOKEN, password: PASSPHRASE }));

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ error: "Unable to reset your password right now." });
    errorSpy.mockRestore();
  });
});
