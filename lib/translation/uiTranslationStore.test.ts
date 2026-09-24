import { beforeEach, describe, expect, it, vi } from "vitest";
import { isUiCatalogRefreshed, readUiTranslations, writeUiTranslation } from "./uiTranslationStore";
import { TranslationReviewError } from "./reviewStore";
vi.mock("server-only", () => ({}));
const mutate = vi.hoisted(() => vi.fn());
const entries = vi.hoisted(() => vi.fn(async (): Promise<unknown[]> => []));
vi.mock("./reviewStore", async (actual) => ({ ...await actual<typeof import("./reviewStore")>(), mutateReviewEntry: mutate, readReviewEntries: entries }));
// The glossary check reads Postgres; route tests cover it over PGlite.
vi.mock("./glossaryConflictCheck", () => ({ readGlossaryMentionIndex: async () => [], glossaryMentionsFor: () => [], assertCorrectionKeepsGlossary: async () => [] }));
vi.mock("./uiWorkbenchDefinitions", () => {
  const definition = { source: "Read [About](/about) for {{name}}.", context: "Copy Studio Markdown", locations: [], glossaryTerms: [], catalogKey: "link" };
  const back = { source: "Back to replications", context: "Gallery link", locations: [], glossaryTerms: [], catalogKey: "Back to replications" };
  const inventory: Record<string, typeof definition> = { link: definition, back };
  return { UI_MESSAGE_INVENTORY: inventory, getUiMessageInventoryDefinition: (id: string) => inventory[id] };
});
// The shape checked in today: bare keys, with terms only in the QA misses.
vi.mock("../../src/i18n/catalogPublication.json", () => ({ default: { "zh-Hans": {
  compiledAt: "2026-09-21", catalogDigest: "c", approvedUiDigest: null, approvedUiSource: "offline-unverified", sourceInventoryDigest: "s", exactLabels: {},
  pendingRefresh: ["Back to replications"],
  qaGlossaryMisses: [{ catalogKey: "Back to replications", term: "Replications", expectedTarget: "体验再现", humanApproved: false }],
} } }));
describe("UI rows waiting for a glossary refresh", () => {
  it("flags each waiting row with its term and marks an offline list not refreshed", async () => {
    const rows = await readUiTranslations("zh-Hans");
    expect(rows.find((row) => row.id === "back")?.pendingRefresh).toEqual({ term: "Replications", expectedTarget: "体验再现" });
    expect(rows.find((row) => row.id === "link")?.pendingRefresh).toBeNull();
    expect(isUiCatalogRefreshed("zh-Hans")).toBe(false);
  });
  it("does not flag a row a person approved, since approval outranks the glossary", async () => {
    const approved = { source: "Back to replications", context: "Gallery link", target: "返回复现" };
    entries.mockResolvedValueOnce([{ sourceId: "back", revision: 1, approved, draft: null, updatedAt: 1 }]);
    const rows = await readUiTranslations("zh-Hans");
    expect(rows.find((row) => row.id === "back")).toMatchObject({ status: "approved", pendingRefresh: null });
  });
});
describe("human UI approval structural checks", () => {
  beforeEach(() => {
    mutate.mockReset().mockImplementation(async (input, options) => {
      await options.onApprove({}, { source: input.source, context: input.context, target: input.target });
      return { revision: 2, approved: { source: input.source, context: input.context, target: input.target }, draft: null, updatedAt: 1 };
    });
  });
  const approve = (target: string) => writeUiTranslation({ locale: "zh-Hans", id: "link", action: "approve", expectedRevision: 1, actor: "reviewer@example.com", reason: "Reviewed", target });
  it("allows changing Markdown link labels while retaining routes and placeholders", async () => {
    const row = await approve("为 {{name}} 阅读[关于](/about)。");
    expect(row.status).toBe("approved");
  });
  it("rejects lost and rewritten Markdown targets", async () => {
    await expect(approve("为 {{name}} 阅读关于。")).rejects.toThrow("MARKUP_LOSS");
    await expect(approve("为 {{name}} 阅读[关于](/other)。")).rejects.toThrow("MARKUP_LOSS");
  });
  it("rejects a lost placeholder even when the Markdown target survives", async () => {
    await expect(approve("阅读[关于](/about)。")).rejects.toThrow("PLACEHOLDER_LOSS");
  });
  it("rejects undeclared messages before entering a transaction", async () => {
    await expect(writeUiTranslation({ locale: "zh-Hans", id: "unknown", action: "save", expectedRevision: 0, actor: "reviewer@example.com", reason: "Reviewed", target: "文字" })).rejects.toBeInstanceOf(TranslationReviewError);
    expect(mutate).not.toHaveBeenCalled();
  });
});
