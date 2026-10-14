import { describe, expect, it, vi } from "vitest";
import type { EditorServerConfigHealth } from "@/hooks/useEditorServerConfigHealth";
import {
  buildDataCommandPayload,
  buildDevSaveDraft,
  createDataSaveAdapter,
  createProposalSaveAdapter,
  type DevSaveCredentials,
} from "./devSaveCommand";

const healthyServer: EditorServerConfigHealth = {
  status: "healthy",
  canSaveToPostgres: true,
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
      { id: 1, title: "LSD", slug: "lsd" },
      { id: 2, title: "MDMA", slug: "mdma" },
    ] as never[],
    originalArticles: [{ id: 1, title: "LSD", slug: "lsd" }] as never[],
    layouts: [
      {
        type: "psychoactive",
        label: "Psychoactive class",
        data: { version: 1, categories: ["classic"] },
        originalData: { version: 1, categories: [] },
        changelog: { markdown: "# Psychoactive Index\n\n+ classic", hasChanges: true },
      },
      {
        type: "chemical",
        label: "Chemical class",
        data: { version: 1, categories: ["tryptamines"] },
        originalData: { version: 1, categories: [] },
        changelog: { markdown: "# Chemical Index\n\n+ tryptamines", hasChanges: true },
      },
      {
        type: "mechanism",
        label: "Mechanism of action",
        data: { version: 1, categories: ["5ht2a"] },
        originalData: { version: 1, categories: [] },
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
  it("builds Postgres payloads from changed document snapshots", () => {
    expect(buildDataCommandPayload(createDraft())).toEqual({
      changedArticles: [{ id: 2, title: "MDMA", slug: "mdma" }],
      payload: {
        articles: [{ id: 2, title: "MDMA", slug: "mdma" }],
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

  it("keeps warning Postgres saves from marking local changes saved", async () => {
    const saveArticle = vi.fn().mockResolvedValue({
      success: true,
      savedItems: ["1 article(s)"],
      submittedBy: "",
      warnings: ["Skipped malformed article"],
    });
    const adapter = createDataSaveAdapter({ serverHealth: healthyServer, saveArticle });

    await expect(adapter.execute(createDraft(), credentials)).resolves.toMatchObject({
      savedItems: ["1 article(s)"],
      warnings: ["Skipped malformed article"],
      resolvedSubmitterKey: "EDITOR",
      markChangesSaved: false,
    });
  });

  it("normalizes no-op Postgres saves without marking local changes saved", async () => {
    const saveArticle = vi.fn().mockResolvedValue({
      success: true,
      savedItems: [],
      submittedBy: "JOSIE",
      warnings: [],
    });
    const adapter = createDataSaveAdapter({ serverHealth: healthyServer, saveArticle });

    await expect(adapter.execute(createDraft(), credentials)).resolves.toMatchObject({
      savedItems: [],
      warnings: [],
      resolvedSubmitterKey: "JOSIE",
      markChangesSaved: false,
      changelogEntry: null,
    });
  });

  it("reports unavailable Postgres credentials before mutation", () => {
    const adapter = createDataSaveAdapter({
      serverHealth: {
        ...healthyServer,
        status: "unhealthy",
        canSaveToPostgres: false,
        issues: ["Missing DATA_ADMIN_KEY"],
      },
      saveArticle: vi.fn(),
    });

    expect(adapter.validateAvailability(createDraft())).toEqual({
      ok: false,
      message: "Missing DATA_ADMIN_KEY",
    });
  });

  it("sends revisionOf when the draft rebases a returned proposal", async () => {
    const submitProposal = vi.fn().mockResolvedValue({ proposalId: "k57zyx987654" });
    const draft = createDraft();

    await createProposalSaveAdapter({ submitProposal, revisionOf: "cp_old" }).execute(draft, credentials);
    expect(submitProposal).toHaveBeenLastCalledWith(expect.objectContaining({ revisionOf: "cp_old" }));

    await createProposalSaveAdapter({ submitProposal, revisionOf: null }).execute(draft, credentials);
    expect(submitProposal).toHaveBeenLastCalledWith(expect.not.objectContaining({ revisionOf: expect.anything() }));
  });
});
