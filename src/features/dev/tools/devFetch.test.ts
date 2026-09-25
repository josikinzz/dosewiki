import { afterEach, describe, expect, it, vi } from "vitest";

import { devFetch, devPost, UNREADABLE_RESPONSE } from "./devFetch";

const messages = { network: "Network error while loading.", failure: "Unable to load." };

function respond(status: number, body: unknown) {
  const text = body === undefined ? "" : typeof body === "string" ? body : JSON.stringify(body);
  vi.stubGlobal("fetch", vi.fn(async () => new Response(text, { status })));
}

describe("devFetch", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns the payload of a successful request", async () => {
    respond(200, { rows: [1] });
    await expect(devFetch("/api/x", { messages })).resolves.toEqual({ rows: [1] });
  });

  it("names a network failure with the caller's message", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("offline"); }));
    await expect(devFetch("/api/x", { messages })).rejects.toThrow("Network error while loading.");
  });

  it("prefers the route's error string, then the caller's failure message", async () => {
    respond(400, { error: "Slug is taken." });
    await expect(devFetch("/api/x", { messages })).rejects.toThrow("Slug is taken.");
    respond(500, "not json");
    await expect(devFetch("/api/x", { messages })).rejects.toThrow("Unable to load.");
  });

  it("lets the caller build a status-specific error", async () => {
    class Conflict extends Error {}
    respond(409, { error: "Changed since you loaded it." });
    const failure = devFetch("/api/x", {
      messages,
      onError: (status, _payload, message) => (status === 409 ? new Conflict(message) : undefined),
    });
    await expect(failure).rejects.toBeInstanceOf(Conflict);
    await expect(failure).rejects.toThrow("Changed since you loaded it.");
  });

  it("treats an unreadable success as an error, never as an empty result", async () => {
    for (const body of ["not json", [], null]) {
      respond(200, body);
      await expect(devFetch("/api/x", { messages })).rejects.toThrow(UNREADABLE_RESPONSE);
    }
    respond(200, "not json");
    await expect(devFetch("/api/x", { messages: { ...messages, unreadable: "Refresh to check." } })).rejects.toThrow("Refresh to check.");
  });

  it("resolves an empty success to {} only when the caller opts in", async () => {
    respond(200, undefined);
    await expect(devFetch("/api/x", { messages, emptyBodyOk: true })).resolves.toEqual({});
  });

  it("posts JSON", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await devPost("/api/x", { a: 1 }, { messages });
    expect(fetchMock).toHaveBeenCalledWith("/api/x", expect.objectContaining({
      method: "POST",
      body: JSON.stringify({ a: 1 }),
      headers: { "Content-Type": "application/json" },
    }));
  });
});
