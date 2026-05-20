import { describe, expect, it, vi } from "vitest";

import {
  GitHubFileChangeError,
  applyGitHubFileChangeSet,
  validateGitHubFileChangeSet,
} from "./fileChange.js";

describe("GitHub file change module", () => {
  it("validates and normalizes a backup change set", () => {
    const normalized = validateGitHubFileChangeSet({
      kind: "backup",
      actor: { key: " JOSIE " },
      message: " Update backup ",
      files: [{ path: "src/data/example.json", content: "{}\n" }],
    });

    expect(normalized.target).toEqual({
      owner: "josikinzz",
      repo: "dosewiki-admin",
      branch: "main",
    });
    expect(normalized.actor.key).toBe("JOSIE");
    expect(normalized.message).toBe("Update backup");
    expect(normalized.files).toEqual([
      {
        name: "src/data/example.json",
        path: "src/data/example.json",
        content: "{}\n",
        encoding: "utf-8",
      },
    ]);
  });

  it("rejects live-write shaped change sets", () => {
    expect(() =>
      validateGitHubFileChangeSet({
        kind: "live",
        actor: { key: "JOSIE" },
        message: "Update live data",
        files: [{ path: "src/data/example.json", content: "{}" }],
      }),
    ).toThrow("backup or export");
  });

  it("creates blobs, tree, commit, and updates the expected branch", async () => {
    const repository = {
      getState: vi.fn(async () => ({ parentSha: "parent-sha", baseTreeSha: "tree-sha" })),
      createBlob: vi.fn(async (content: string) => `blob-${content.length}`),
      createTree: vi.fn(async () => "new-tree-sha"),
      createCommit: vi.fn(async () => "commit-sha"),
      updateReference: vi.fn(async () => undefined),
      buildCommitUrl: vi.fn((sha: string) => `https://example.test/commit/${sha}`),
    };

    const result = await applyGitHubFileChangeSet(
      {
        kind: "export",
        target: { owner: "owner", repo: "repo", branch: "draft" },
        actor: { key: "EDITOR" },
        message: "Export files",
        timestamp: "2026-04-26T12:00:00.000Z",
        files: [
          { name: "json", path: "src/data/example.json", content: "{}\n" },
          { name: "avatar", path: "public/avatar.png", content: "abc123", encoding: "base64" },
        ],
      },
      { repository },
    );

    expect(repository.getState).toHaveBeenCalledWith("draft");
    expect(repository.createBlob).toHaveBeenNthCalledWith(1, "{}\n", "utf-8");
    expect(repository.createBlob).toHaveBeenNthCalledWith(2, "abc123", "base64");
    expect(repository.createTree).toHaveBeenCalledWith("tree-sha", [
      { path: "src/data/example.json", mode: "100644", type: "blob", sha: "blob-3" },
      { path: "public/avatar.png", mode: "100644", type: "blob", sha: "blob-6" },
    ]);
    expect(repository.createCommit).toHaveBeenCalledWith(
      "Export files",
      "new-tree-sha",
      "parent-sha",
      "2026-04-26T12:00:00.000Z",
      expect.objectContaining({ name: "dose.wiki Dev Editor" }),
    );
    expect(repository.updateReference).toHaveBeenCalledWith("commit-sha", "draft");
    expect(result.commitUrl).toBe("https://example.test/commit/commit-sha");
    expect(result.files.map((file) => file.path)).toEqual(["src/data/example.json", "public/avatar.png"]);
  });

  it("maps protected branch update failures", async () => {
    const repository = {
      getState: vi.fn(async () => ({ parentSha: "parent-sha", baseTreeSha: "tree-sha" })),
      createBlob: vi.fn(async () => "blob-sha"),
      createTree: vi.fn(async () => "new-tree-sha"),
      createCommit: vi.fn(async () => "commit-sha"),
      updateReference: vi.fn(async () => {
        throw new Error("Protected branch update failed");
      }),
    };

    await expect(
      applyGitHubFileChangeSet(
        {
          kind: "backup",
          actor: { key: "EDITOR" },
          message: "Update backup",
          files: [{ path: "src/data/example.json", content: "{}\n" }],
        },
        { repository },
      ),
    ).rejects.toMatchObject({
      name: "GitHubFileChangeError",
      code: "BRANCH_UPDATE_FAILED",
      message: "Unable to update GitHub branch reference: Protected branch update failed",
    } satisfies Partial<GitHubFileChangeError>);
  });

  it("fails when repository state omits required SHAs", async () => {
    const repository = {
      getState: vi.fn(async () => ({ parentSha: "", baseTreeSha: "tree-sha" })),
    };

    await expect(
      applyGitHubFileChangeSet(
        {
          kind: "backup",
          actor: { key: "EDITOR" },
          message: "Update backup",
          files: [{ path: "src/data/example.json", content: "{}\n" }],
        },
        { repository },
      ),
    ).rejects.toMatchObject({ code: "MISSING_REPOSITORY_SHA" });
  });
});
