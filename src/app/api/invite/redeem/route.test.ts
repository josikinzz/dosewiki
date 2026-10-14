import { beforeEach, describe, expect, it, vi } from "vitest";
import { generateInviteCode, hashInviteCode, normalizeInviteCode } from "@server/auth/inviteCodes";
import { POST } from "./route";

vi.mock("server-only", () => ({}));

const rateLimitMocks = vi.hoisted(() => ({
  enforceRateLimit: vi.fn(async () => null),
}));

vi.mock("@server/http/nextRateLimit", () => ({
  enforceRateLimit: rateLimitMocks.enforceRateLimit,
}));

const mocks = vi.hoisted(() => ({
  redeemInviteCode: vi.fn(),
  hashPassword: vi.fn(async (plain: string) => `hashed:${plain}`),
}));

vi.mock("@server/auth/memberships", () => ({
  redeemInviteCode: mocks.redeemInviteCode,
}));

vi.mock("@server/auth/passwords", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@server/auth/passwords")>()),
  hashPassword: mocks.hashPassword,
}));

const CODE = generateInviteCode();
const PASSPHRASE = "correct horse battery";

const validBody = {
  code: CODE,
  username: "Ada",
  password: PASSPHRASE,
};

const request = (body: unknown) =>
  new Request("https://dev.dose.wiki/api/invite/redeem", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  mocks.redeemInviteCode.mockResolvedValue({ email: "ada@members.dose.wiki", role: "editor" });
});

describe("POST /api/invite/redeem", () => {
  it("is braked by the sign-in rate limit policy", async () => {
    rateLimitMocks.enforceRateLimit.mockResolvedValueOnce(
      Response.json({ error: "Too many attempts." }, { status: 429 }) as never,
    );

    const response = await POST(request(validBody));

    expect(response.status).toBe(429);
    expect(rateLimitMocks.enforceRateLimit).toHaveBeenCalledWith(expect.any(Request), "authCredentialAttempt");
    expect(mocks.redeemInviteCode).not.toHaveBeenCalled();
  });

  it("hashes the normalized code and the password, then signs the visitor up under the lowercased username", async () => {
    const response = await POST(
      request({
        ...validBody,
        code: ` ${CODE.toUpperCase()} `,
        email: " Ada@Example.com ",
        name: " Ada Lovelace ",
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true, username: "ada" });
    expect(mocks.hashPassword).toHaveBeenCalledWith(PASSPHRASE);
    expect(mocks.redeemInviteCode).toHaveBeenCalledWith({
      codeHash: hashInviteCode(normalizeInviteCode(CODE)),
      username: "ada",
      passwordHash: `hashed:${PASSPHRASE}`,
      email: "ada@example.com",
      name: "Ada Lovelace",
    });
  });

  it("hides an unexpected failure behind a generic 500", async () => {
    mocks.redeemInviteCode.mockRejectedValueOnce(new Error("Postgres is down"));

    const response = await POST(request(validBody));

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: "Unable to create your account right now. Try again in a moment.",
    });
  });
});
