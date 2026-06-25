import { afterEach, describe, expect, it, vi } from "vitest";

import { encodeRepositoryPath, githubRequest, loadFileFromRepo } from "./client.mjs";

describe("GitHub repository adapter", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("serializes repository paths segment by segment", () => {
    expect(encodeRepositoryPath("src/data/content/about content.md")).toBe("src/data/content/about%20content.md");
  });

  it("returns empty content for GitHub 404 file loads", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: false,
      status: 404,
      json: async () => ({ message: "Not Found" }),
    } as unknown as Response);

    await expect(loadFileFromRepo("token", "src/data/missing.json")).resolves.toEqual({
      content: null,
      sha: null,
    });
  });

  it("handles non-JSON GitHub error payloads", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: false,
      status: 502,
      json: async () => {
        throw new Error("Not JSON");
      },
    } as unknown as Response);

    const { response, payload } = await githubRequest("token", "/git/ref/heads/main");

    expect(response.status).toBe(502);
    expect(payload).toEqual({});
  });
});
