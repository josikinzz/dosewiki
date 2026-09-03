import { describe, expect, it, vi } from "vitest";
import type { EditorServerConfigHealth } from "@/hooks/useEditorServerConfigHealth";
import {
  buildConvexCommandPayload,
  buildDevSaveDraft,
  buildProposalSummary,
  createConvexSaveAdapter,
  createProposalSaveAdapter,
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
  key: "EDITOR",
};

function createDraft() {
  return buildDevSaveDraft({
    articles: [
      { id: 1, title: "LSD" },
      { id: 2, title: "MDMA" },
    ] as never[],
    originalArticles: [{ id: 1, title: "LSD" }] as never[],
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
    datasetChangelog: {
      markdown: "# Dataset\n\n+ MDMA",
      articles: [{ id: 2, title: "MDMA", slug: "mdma" }],
      sections: [{ index: 1, heading: "MDMA", markdown: "# Dataset\n\n+ MDMA" }],
    },
    hasPendingChanges: true,
  });
}

describe("dev save command contract", () => {
  it("builds a draft snapshot from article, layout, and changelog state; About is not staged", () => {
    const draft = createDraft();

    expect(draft.layouts.map((layout) => layout.type)).toEqual([
      "psychoactive",
      "chemical",
      "mechanism",
    ]);
    expect("about" in draft).toBe(false);
    expect("generatorPrompt" in draft).toBe(false);
  });

  it("builds Convex payloads from changed document snapshots", () => {
    expect(buildConvexCommandPayload(createDraft())).toEqual({
      changedArticles: [{ id: 2, title: "MDMA" }],
      payload: {
        articles: [{ id: 2, title: "MDMA" }],
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

  it("submits the same payload as a proposal, never touches Convex health, and points at the queue", async () => {
    const submitProposal = vi.fn().mockResolvedValue({ proposalId: "k57zyx987654" });
    const adapter = createProposalSaveAdapter({ submitProposal });
    const draft = createDraft();

    expect(adapter.validateAvailability(draft)).toEqual({ ok: true });
    expect(adapter.noChangesMessage).toBe("No changes to submit.");
    expect(adapter.verifiedMessage("EDITOR")).toContain("Submitting for review");

    await expect(adapter.execute(draft, credentials)).resolves.toEqual({
      destination: "proposal",
      savedItems: ["Proposal #987654"],
      warnings: [],
      resolvedSubmitterKey: "EDITOR",
      changelogEntry: null,
      markChangesSaved: true,
      actionLabel: "View in queue",
      actionHref: "/dev/queue",
    });
    expect(submitProposal).toHaveBeenCalledWith({
      payload: buildConvexCommandPayload(draft).payload,
      summary: "Update MDMA, Psychoactive class, Chemical class and 1 more",
      diff: buildConvexCommandPayload(draft).payload.changelog?.markdown,
    });
  });

  it("summarizes a proposal from the changed titles and layout labels", () => {
    const draft = createDraft();
    expect(buildProposalSummary(draft, { articles: [{ id: 2, title: "MDMA" }] })).toBe("Update MDMA");
    expect(buildProposalSummary(draft, { indexLayouts: [{ type: "mechanism", version: 1, categories: [] }] })).toBe(
      "Update Mechanism of action",
    );
    expect(buildProposalSummary(draft, {})).toBe("Editor update");
  });
});
