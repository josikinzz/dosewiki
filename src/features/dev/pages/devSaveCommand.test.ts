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
    articlesAreComplete: true,
    layouts: [
      {
        type: "psychoactive",
        label: "Psychoactive class",
        data: { version: 1, categories: ["classic"] },
        changelog: { markdown: "# Psychoactive Index\n\n+ classic", hasChanges: true },
      },
      {
        type: "chemical",
        label: "Chemical class",
        data: { version: 1, categories: ["tryptamines"] },
        changelog: { markdown: "# Chemical Index\n\n+ tryptamines", hasChanges: true },
      },
      {
        type: "mechanism",
        label: "Mechanism of action",
        data: { version: 1, categories: ["5ht2a"] },
        changelog: { markdown: "# Mechanism Index\n\n+ 5ht2a", hasChanges: true },
      },
    ],
    aboutMarkdown: "About body",
    aboutSubtitle: "About subtitle",
    aboutFounderKeys: ["JOSIE"],
    convexEnabled: true,
    datasetChangelog: {
      markdown: "# Dataset\n\n+ MDMA",
      articles: [{ id: 2, title: "MDMA", slug: "mdma" }],
      sections: [{ index: 1, heading: "MDMA", markdown: "# Dataset\n\n+ MDMA" }],
    },
    aboutMarkdownChangelog: { markdown: "# About\n\n+ body", hasChanges: true },
    aboutSubtitleChangelog: { markdown: "# Subtitle\n\n+ subtitle", hasChanges: true },
    aboutFounderChangelog: { markdown: "# Founders\n\n+ JOSIE", hasChanges: true },
    hasAboutMarkdownChanges: true,
    hasAboutSubtitleChanges: true,
    hasAboutFounderChanges: true,
    hasPendingChanges: true,
  });
}

describe("dev save command contract", () => {
  it("builds a draft snapshot from article, About, layout, and changelog state", () => {
    const draft = createDraft();

    expect(draft.about).toMatchObject({
      markdown: "About body",
      subtitle: "About subtitle",
      founderKeys: ["JOSIE"],
      hasChanges: true,
    });
    expect(draft.layouts.map((layout) => layout.type)).toEqual([
      "psychoactive",
      "chemical",
      "mechanism",
    ]);
    expect("generatorPrompt" in draft).toBe(false);
  });

  it("builds Convex payloads from changed document snapshots", () => {
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
          markdown:
            "# Dataset\n\n+ MDMA\n\n---\n\n# Psychoactive Index\n\n+ classic\n\n---\n\n# Chemical Index\n\n+ tryptamines\n\n---\n\n# Mechanism Index\n\n+ 5ht2a",
          articles: [{ id: 2, title: "MDMA", slug: "mdma" }],
        },
        indexLayouts: [
          {
            type: "psychoactive",
            version: 1,
            categories: ["classic"],
          },
          {
            type: "chemical",
            version: 1,
            categories: ["tryptamines"],
          },
          {
            type: "mechanism",
            version: 1,
            categories: ["5ht2a"],
          },
        ],
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
      psychoactiveIndexManualData: { version: 1, categories: ["classic"] },
      chemicalIndexManualData: { version: 1, categories: ["tryptamines"] },
      mechanismIndexManualData: { version: 1, categories: ["5ht2a"] },
      aboutMarkdown: "About body",
      aboutSubtitleMarkdown: "About subtitle",
      aboutConfig: { founderProfileKeys: ["JOSIE"] },
      skipArticles: true,
    });
    expect("generatorPrompt" in payload).toBe(false);
    expect(payload.commitMessage).toContain("Dev editor update - ");
    expect(payload.changelogMarkdown).toContain("# Dataset\n\n+ MDMA");
    expect(payload.changelogMarkdown).toContain("# Founders\n\n+ JOSIE");
    expect(payload.changelogMarkdown).toContain("# Chemical Index\n\n+ tryptamines");
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
