import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const query = vi.hoisted(() => vi.fn());
vi.mock("../postgres/runtime/backend", () => ({ getPostgresClient: () => ({ query }) }));

import { queryData } from "./serverClient";

beforeEach(() => { query.mockReset(); vi.useFakeTimers(); });

describe("server data reads", () => {
  it("retries a native connection reset and returns the next result", async () => {
    query.mockRejectedValueOnce(Object.assign(new Error("connection reset"), { code: "ECONNRESET" }))
      .mockResolvedValueOnce({ slug: "lsd" });
    const result = queryData("substanceIndex:getBySlug", { slug: "lsd" });
    await vi.runAllTimersAsync();
    await expect(result).resolves.toEqual({ slug: "lsd" });
    expect(query).toHaveBeenCalledTimes(2);
  });

  it("does not retry a permanent Postgres error", async () => {
    const error = Object.assign(new Error("invalid column"), { code: "42703" });
    query.mockRejectedValue(error);
    await expect(queryData("substanceIndex:getBySlug", { slug: "lsd" })).rejects.toBe(error);
    expect(query).toHaveBeenCalledTimes(1);
  });

  it("retries an HTTP error with a plain-object timeout cause", async () => {
    query.mockRejectedValueOnce(Object.assign(new Error("request interrupted"), { cause: { code: "ETIMEDOUT" } }))
      .mockResolvedValueOnce({ slug: "lsd" });
    const result = queryData("substanceIndex:getBySlug", { slug: "lsd" });
    await vi.runAllTimersAsync();
    await expect(result).resolves.toEqual({ slug: "lsd" });
    expect(query).toHaveBeenCalledTimes(2);
  });
});
