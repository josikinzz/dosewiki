import { beforeEach, describe, expect, it, vi } from "vitest";

const { handlerMock } = vi.hoisted(() => ({
  handlerMock: vi.fn(async () => new Response("next-auth passthrough")),
}));

vi.mock("next-auth", () => ({
  default: vi.fn(() => handlerMock),
}));

vi.mock("@auth", () => ({
  authOptions: { providers: [] },
}));

import { POST } from "./route";

const CREDENTIALS_CALLBACK = "https://dev.dose.wiki/api/auth/callback/credentials";
const context = { params: Promise.resolve({ nextauth: ["callback", "credentials"] }) };

function credentialsRequest(ip: string): Request {
  return new Request(CREDENTIALS_CALLBACK, {
    method: "POST",
    headers: { "x-forwarded-for": ip },
    body: new URLSearchParams({ csrfToken: "test", username: "JOSIE", password: "guess" }),
  });
}

describe("credentials callback rate limiting", () => {
  beforeEach(() => {
    handlerMock.mockClear();
  });

  it("passes non-credentials NextAuth actions through untouched", async () => {
    const signOutRequest = new Request("https://dev.dose.wiki/api/auth/signout", {
      method: "POST",
      headers: { "x-forwarded-for": "192.0.2.56" },
      body: new URLSearchParams({ csrfToken: "test" }),
    });

    for (let index = 0; index < 15; index += 1) {
      const response = await POST(signOutRequest, {
        params: Promise.resolve({ nextauth: ["signout"] }),
      });
      expect(response.status).toBe(200);
    }

    expect(handlerMock).toHaveBeenCalledTimes(15);
  });

  it("allows the policy budget of credential attempts then answers 429 in the NextAuth client shape", async () => {
    // Unique IP per test: the limiter's in-memory fallback store is module-global.
    const ip = "192.0.2.55";

    for (let index = 0; index < 10; index += 1) {
      const response = await POST(credentialsRequest(ip), context);
      expect(response.status).toBe(200);
    }
    const passthroughCalls = handlerMock.mock.calls.length;
    expect(passthroughCalls).toBe(10);

    const limited = await POST(credentialsRequest(ip), context);
    expect(limited.status).toBe(429);
    expect(limited.headers.get("Retry-After")).toBeTruthy();

    const body = (await limited.json()) as { url?: string };
    // next-auth/react reads new URL(data.url).searchParams.get("error") — the url must be absolute.
    expect(new URL(body.url ?? "").pathname).toBe("/sign-in");
    expect(new URL(body.url ?? "").searchParams.get("error")).toBe("RateLimited");
    // The limited request never reaches NextAuth.
    expect(handlerMock.mock.calls.length).toBe(passthroughCalls);

    // The window is per-IP: another address is unaffected.
    const otherIp = await POST(credentialsRequest("192.0.2.57"), context);
    expect(otherIp.status).toBe(200);
  });

});
