import { beforeEach, describe, expect, it, vi } from "vitest";
import { writeUiTranslation } from "./uiTranslationStore";
import { TranslationReviewError } from "./reviewStore";
vi.mock("server-only", () => ({}));
const mutate = vi.hoisted(() => vi.fn());
vi.mock("./reviewStore", async (actual) => ({ ...await actual<typeof import("./reviewStore")>(), mutateReviewEntry: mutate }));
vi.mock("./uiWorkbenchDefinitions", () => {
  const definition = { source: "Read [About](/about) for {{name}}.", context: "Copy Studio Markdown", locations: [], glossaryTerms: [], catalogKey: "link" };
  return { UI_MESSAGE_INVENTORY: { link: definition }, getUiMessageInventoryDefinition: (id: string) => id === "link" ? definition : undefined };
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
