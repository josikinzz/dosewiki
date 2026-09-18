import { afterEach, expect, it, vi } from "vitest";
import { postMailingListSignup } from "./subscribe";

afterEach(() => vi.unstubAllGlobals());

it("does not report a temporary signup outage as invalid input or throttling", async () => {
  const fetch = vi.fn()
    .mockResolvedValueOnce(new Response(null, { status: 400 }))
    .mockResolvedValueOnce(new Response(null, { status: 429 }))
    .mockResolvedValueOnce(new Response(null, { status: 503 }));
  vi.stubGlobal("fetch", fetch);

  const invalid = await postMailingListSignup("invalid", "dosewiki", "");
  const throttled = await postMailingListSignup("reader@example.test", "dosewiki", "");
  const unavailable = await postMailingListSignup("reader@example.test", "dosewiki", "");

  expect(unavailable.ok).toBe(false);
  expect(unavailable).not.toEqual(invalid);
  expect(unavailable).not.toEqual(throttled);
});
