import { describe, expect, it, vi } from "vitest";
import type { EditorServerConfigHealth } from "@/hooks/useEditorServerConfigHealth";
import {
  buildConvexCommandPayload,
  buildDevSaveDraft,
  buildGitHubSavePayload,
  createConvexSaveAdapter,
  createGitHubSaveAdapter,
  type DevSaveCredentials,
} from "./devSaveCommand";

const healthyServer: EditorServerConfigHealth = {
  status: "healthy",
  canSaveToConvex: true,
  issues: [],
  summary: "Server ready",
  checkedAt: null,
  isRefreshing: false,
};

const credentials: DevSaveCredentials = {
  username: "editor",
  password: "secret",
  key: "EDITOR",
};

function createDraft() {
  return buildDevSaveDraft({
    articles: [
      { id: 1, title: "LSD" },
      { id: 2, title: "MDMA" },
    ] as never[],
    originalArticles: [{ id: 1, title: "LSD" }] as never[],
    psychoactiveIndexManual: { categories: ["classic"] },
    aboutMarkdown: "About body",
    aboutSubtitle: "About subtitle",
    aboutFounderKeys: ["JOSIE"],
    generatorPrompt: "New prompt",
    convexEnabled: true,
    datasetChangelog: {
      markdown: "# Dataset\n\n+ MDMA",
      articles: [{ id: 2, title: "MDMA", slug: "mdma" }],
      sections: [{ index: 1, heading: "MDMA", markdown: "# Dataset\n\n+ MDMA" }],
    },
    psychoactiveManualChangelog: { markdown: "# Index\n\n+ classic", hasChanges: true },
    aboutMarkdownChangelog: { markdown: "# About\n\n+ body", hasChanges: true },
    aboutSubtitleChangelog: { markdown: "# Subtitle\n\n+ subtitle", hasChanges: true },
    aboutFounderChangelog: { markdown: "# Founders\n\n+ JOSIE", hasChanges: true },
    hasAboutMarkdownChanges: true,
    hasAboutSubtitleChanges: true,
    hasAboutFounderChanges: true,
    hasGeneratorPromptChanges: true,
    hasPendingChanges: true,
  });
}

describe("dev save command contract", () => {
  it("builds a draft snapshot from article, About, prompt, index, and changelog state", () => {
    const draft = createDraft();

    expect(draft.about).toMatchObject({
      markdown: "About body",
      subtitle: "About subtitle",
      founderKeys: ["JOSIE"],
      hasChanges: true,
    });
    expect(draft.generatorPrompt).toEqual({ content: "New prompt", hasChanges: true });
    expect(draft.psychoactiveIndexManual).toEqual({ categories: ["classic"] });
    expect(draft.changelog.psychoactiveManual).toEqual({
      markdown: "# Index\n\n+ classic",
      hasChanges: true,
    });
  });

  it("builds Convex payloads from the draft snapshot", () => {
    expect(buildConvexCommandPayload(createDraft())).toEqual({
      changedArticles: [{ id: 2, title: "MDMA" }],
      payload: {
        articles: [{ id: 2, title: "MDMA" }],
        about: {
          aboutMarkdown: "About body",
          aboutSubtitle: "About subtitle",
          founderProfileKeys: ["JOSIE"],
        },
        changelog: {
          markdown: "# Dataset\n\n+ MDMA",
          articles: [{ id: 2, title: "MDMA", slug: "mdma" }],
        },
      },
    });
  });

  it("builds GitHub payloads from the same draft snapshot", () => {
    const payload = buildGitHubSavePayload(
      createDraft(),
      credentials,
      new Date("2026-04-26T12:00:00.000Z"),
    );

    expect(payload).toMatchObject({
      username: "editor",
      password: "secret",
      articlesData: [
        { id: 1, title: "LSD" },
        { id: 2, title: "MDMA" },
      ],
      changedArticles: [{ id: 2, title: "MDMA", slug: "mdma" }],
      psychoactiveIndexManualData: { categories: ["classic"] },
      aboutMarkdown: "About body",
      aboutSubtitleMarkdown: "About subtitle",
      aboutConfig: { founderProfileKeys: ["JOSIE"] },
      generatorPrompt: "New prompt",
      skipArticles: true,
    });
    expect(payload.commitMessage).toContain("Dev editor update - ");
    expect(payload.changelogMarkdown).toContain("# Dataset\n\n+ MDMA");
    expect(payload.changelogMarkdown).toContain("# Founders\n\n+ JOSIE");
  });

  it("normalizes successful Convex saves and marks local changes saved", async () => {
    const saveToConvex = vi.fn().mockResolvedValue({
      success: true,
      requestId: "save-1",
      savedItems: ["1 article(s)"],
      submittedBy: "JOSIE",
      warnings: [],
      revalidatedPaths: ["/mdma", "/substances"],
      entry: {
        id: "entry-1",
        createdAt: "2026-04-26T12:00:00.000Z",
        commit: { sha: "", url: "", message: "Saved" },
        articles: [{ id: 2, title: "MDMA", slug: "mdma" }],
        markdown: "# Saved",
        submittedBy: "JOSIE",
      },
    });
    const adapter = createConvexSaveAdapter({ serverHealth: healthyServer, saveToConvex });

    await expect(adapter.execute(createDraft(), credentials)).resolves.toMatchObject({
      destination: "convex",
      savedItems: ["1 article(s)"],
      warnings: [],
      resolvedSubmitterKey: "JOSIE",
      markChangesSaved: true,
      revalidatedPaths: ["/mdma", "/substances"],
      changelogEntry: {
        id: "entry-1",
        submittedBy: "JOSIE",
      },
    });
  });

  it("keeps warning Convex saves from marking local changes saved", async () => {
    const saveToConvex = vi.fn().mockResolvedValue({
      success: true,
      savedItems: ["1 article(s)"],
      submittedBy: "",
      warnings: ["Skipped malformed article"],
    });
    const adapter = createConvexSaveAdapter({ serverHealth: healthyServer, saveToConvex });

    await expect(adapter.execute(createDraft(), credentials)).resolves.toMatchObject({
      savedItems: ["1 article(s)"],
      warnings: ["Skipped malformed article"],
      resolvedSubmitterKey: "EDITOR",
      markChangesSaved: false,
    });
  });

  it("normalizes no-op Convex saves without marking local changes saved", async () => {
    const saveToConvex = vi.fn().mockResolvedValue({
      success: true,
      savedItems: [],
      submittedBy: "JOSIE",
      warnings: [],
    });
    const adapter = createConvexSaveAdapter({ serverHealth: healthyServer, saveToConvex });

    await expect(adapter.execute(createDraft(), credentials)).resolves.toMatchObject({
      savedItems: [],
      warnings: [],
      resolvedSubmitterKey: "JOSIE",
      markChangesSaved: false,
      changelogEntry: null,
    });
  });

  it("surfaces GitHub credential failures before returning a command result", async () => {
    const saveArticles = vi.fn().mockRejectedValue(new Error("Invalid credentials."));
    const adapter = createGitHubSaveAdapter({ saveArticles });

    await expect(adapter.execute(createDraft(), credentials)).rejects.toThrow("Invalid credentials.");
  });

  it("reports unavailable Convex credentials before mutation", () => {
    const adapter = createConvexSaveAdapter({
      serverHealth: {
        ...healthyServer,
        status: "unhealthy",
        canSaveToConvex: false,
        issues: ["Missing CONVEX_ADMIN_KEY"],
      },
      saveToConvex: vi.fn(),
    });

    expect(adapter.validateAvailability(createDraft())).toEqual({
      ok: false,
      message: "Missing CONVEX_ADMIN_KEY",
    });
  });

  it("normalizes GitHub saves without marking local changes saved", async () => {
    const saveArticles = vi.fn().mockResolvedValue({
      success: true,
      commitUrl: "https://github.example/commit/abc",
      submittedBy: "JOSIE",
      entry: {
        timestamp: "2026-04-26T12:00:00.000Z",
        commit: { sha: "abc", url: "https://github.example/commit/abc", message: "Saved" },
        submittedBy: "JOSIE",
        articles: [{ id: 2, title: "MDMA", slug: "mdma" }],
      },
    });
    const adapter = createGitHubSaveAdapter({
      saveArticles,
      now: () => new Date("2026-04-26T12:00:00.000Z"),
    });

    await expect(adapter.execute(createDraft(), credentials)).resolves.toMatchObject({
      destination: "github",
      savedItems: ["GitHub"],
      warnings: [],
      resolvedSubmitterKey: "JOSIE",
      markChangesSaved: false,
      actionHref: "https://github.example/commit/abc",
      actionLabel: "Open commit",
      changelogEntry: {
        id: "2026-04-26T12:00:00.000Z",
        submittedBy: "JOSIE",
      },
    });
  });
});
