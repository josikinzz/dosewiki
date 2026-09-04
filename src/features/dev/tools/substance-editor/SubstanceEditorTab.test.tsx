import type { ReactNode } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createEmptyArticle } from "@/data/schema";

const applyArticlesTransformMock = vi.fn();
const articles = [{
  ...createEmptyArticle(),
  slug: "lsd",
  title: "LSD",
  priority: "normal" as const,
  identification: { ...createEmptyArticle().identification, common_name: "LSD" },
  editorial_review: { ...createEmptyArticle().editorial_review, status: "needed" as const },
}, {
  ...createEmptyArticle(),
  slug: "mdma",
  title: "MDMA",
  priority: "normal" as const,
  identification: { ...createEmptyArticle().identification, common_name: "MDMA" },
  editorial_review: { ...createEmptyArticle().editorial_review, status: "needed" as const },
}, {
  ...createEmptyArticle(),
  slug: "quiet",
  title: "Quiet",
  priority: "low" as const,
  identification: { ...createEmptyArticle().identification, common_name: "Quiet" },
}, {
  ...createEmptyArticle(),
  slug: "hidden-for-now",
  title: "Hidden for now",
  priority: "hide_for_now" as const,
  identification: { ...createEmptyArticle().identification, common_name: "Hidden for now" },
}];

vi.mock("../../context/DevModeContext", () => ({
  useDevMode: () => ({
    articles,
    applyArticlesTransform: applyArticlesTransformMock,
    articleHydration: createHydratedArticleHydration(),
  }),
}));

import { createHydratedArticleHydration } from "@/test/fixtures/devArticleHydration";
import { SubstanceEditorTab } from "./SubstanceEditorTab";

async function selectLsdAndDirtyTheForm() {
  fireEvent.click(screen.getByRole("button", { name: /lsd/i }));
  expect(await screen.findByText("Substance Article: LSD")).toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: /Overview/ }));
  const titleInput = await screen.findByLabelText("Display Name / Title");
  fireEvent.change(titleInput, { target: { value: "LSD edited" } });

  await waitFor(() => {
    expect(screen.getByText("Unsaved changes")).toBeInTheDocument();
  });
}

function renderCommitPanel(actionSlot?: ReactNode) {
  return (
    <div>
      <span>Commit panel</span>
      {actionSlot}
    </div>
  );
}

afterEach(() => {
  vi.restoreAllMocks();
  applyArticlesTransformMock.mockClear();
});

describe("SubstanceEditorTab", () => {
  it("supports manual article editing without source or generation controls", async () => {
    render(<SubstanceEditorTab renderCommitPanel={renderCommitPanel} />);

    expect(screen.queryByText(/available sources/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/openrouter/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /generate/i })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /lsd/i }));

    expect(await screen.findByText("Substance Article: LSD")).toBeInTheDocument();
    expect(screen.getByText("Commit panel")).toBeInTheDocument();
  });

  it("prompts for a substance before any article is selected", () => {
    render(<SubstanceEditorTab renderCommitPanel={renderCommitPanel} />);

    expect(screen.getByText("Select a substance to begin editing")).toBeInTheDocument();
  });

  it("records the open substance in the URL and opens on a deep link without rewriting it", async () => {
    const replaceState = vi.spyOn(window.history, "replaceState");
    const { unmount } = render(<SubstanceEditorTab renderCommitPanel={renderCommitPanel} />);

    fireEvent.click(screen.getByRole("button", { name: /lsd/i }));
    expect(await screen.findByText("Substance Article: LSD")).toBeInTheDocument();
    expect(screen.getByText("Review Needed", { selector: "h2 *" })).toBeInTheDocument();
    expect(replaceState).toHaveBeenLastCalledWith(null, "", "/dev/articles/lsd");
    unmount();
    replaceState.mockClear();

    render(<SubstanceEditorTab renderCommitPanel={renderCommitPanel} initialSlug="mdma" />);
    expect(await screen.findByText("Substance Article: MDMA")).toBeInTheDocument();
    expect(replaceState).not.toHaveBeenCalled();
  });

  it("opens a URL-only deep link with the URL-only toggle already on", async () => {
    render(<SubstanceEditorTab renderCommitPanel={renderCommitPanel} initialSlug="quiet" />);

    expect(await screen.findByText("Substance Article: Quiet")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /quiet/i })).toBeInTheDocument();
  });

  it("reveals low and hide-for-now articles through the URL-only toggle", () => {
    render(<SubstanceEditorTab renderCommitPanel={renderCommitPanel} />);

    expect(screen.queryByText("Quiet")).not.toBeInTheDocument();
    expect(screen.queryByText("Hidden for now")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Include URL-only" }));

    expect(screen.getByText("Quiet")).toBeInTheDocument();
    expect(screen.getByText("Hidden for now")).toBeInTheDocument();
  });

  it("keeps the current substance when the discard dialog is dismissed", async () => {
    render(<SubstanceEditorTab renderCommitPanel={renderCommitPanel} />);
    await selectLsdAndDirtyTheForm();

    fireEvent.click(screen.getByRole("button", { name: /mdma/i }));

    expect(await screen.findByText("Discard unapplied form edits?")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Keep editing" }));

    await waitFor(() => {
      expect(screen.queryByText("Discard unapplied form edits?")).not.toBeInTheDocument();
    });
    expect(screen.getByText("Unsaved changes")).toBeInTheDocument();
    expect(screen.getByLabelText("Display Name / Title")).toHaveValue("LSD edited");
  });

  it("switches substances once the edits are discarded", async () => {
    render(<SubstanceEditorTab renderCommitPanel={renderCommitPanel} />);
    await selectLsdAndDirtyTheForm();

    fireEvent.click(screen.getByRole("button", { name: /mdma/i }));
    fireEvent.click(await screen.findByRole("button", { name: "Discard changes" }));

    expect(await screen.findByText("Substance Article: MDMA")).toBeInTheDocument();
    expect(screen.queryByText("Unsaved changes")).not.toBeInTheDocument();
  });

  it("switches without asking when the form has no unapplied edits", async () => {
    render(<SubstanceEditorTab renderCommitPanel={renderCommitPanel} />);
    fireEvent.click(screen.getByRole("button", { name: /lsd/i }));
    expect(await screen.findByText("Substance Article: LSD")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /mdma/i }));

    expect(await screen.findByText("Substance Article: MDMA")).toBeInTheDocument();
    expect(screen.queryByText("Discard unapplied form edits?")).not.toBeInTheDocument();
  });

  it("names the two-step save and warns while form edits are unapplied", async () => {
    render(<SubstanceEditorTab renderCommitPanel={renderCommitPanel} />);
    await selectLsdAndDirtyTheForm();

    expect(screen.getByRole("button", { name: "Apply to draft" })).toBeInTheDocument();
    expect(screen.getByText("Unapplied form edits")).toBeInTheDocument();
  });

  it("confirms the in-memory apply with a status pill", async () => {
    render(<SubstanceEditorTab renderCommitPanel={renderCommitPanel} />);
    await selectLsdAndDirtyTheForm();

    fireEvent.click(screen.getByRole("button", { name: "Apply to draft" }));

    expect(await screen.findByText("Applied to draft")).toBeInTheDocument();
    expect(applyArticlesTransformMock).toHaveBeenCalledTimes(1);
  });

  it("reports a clipboard result on the toolbar Copy control", async () => {
    const writeText = vi.fn(async () => undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });

    render(<SubstanceEditorTab renderCommitPanel={renderCommitPanel} />);
    fireEvent.click(screen.getByRole("button", { name: /lsd/i }));
    expect(await screen.findByText("Substance Article: LSD")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Copy" }));

    expect(await screen.findByRole("button", { name: "Copied" })).toBeInTheDocument();
    expect(writeText).toHaveBeenCalledTimes(1);
  });

  it("reports a failed clipboard write instead of staying silent", async () => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: vi.fn(async () => { throw new Error("denied"); }) },
    });

    render(<SubstanceEditorTab renderCommitPanel={renderCommitPanel} />);
    fireEvent.click(screen.getByRole("button", { name: /lsd/i }));
    expect(await screen.findByText("Substance Article: LSD")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Copy" }));

    expect(await screen.findByRole("button", { name: "Copy failed" })).toBeInTheDocument();
  });
});
