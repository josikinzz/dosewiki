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
  expect(await screen.findByText("Substance Article")).toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: /Overview/ }));
  const titleInput = await screen.findByLabelText("Display Name / Title");
  fireEvent.change(titleInput, { target: { value: "LSD edited" } });

  await waitFor(() => {
    expect(screen.getByText("Unsaved changes")).toBeInTheDocument();
  });
}

afterEach(() => {
  vi.restoreAllMocks();
  applyArticlesTransformMock.mockClear();
});

describe("SubstanceEditorTab", () => {
  it("supports manual article editing without source or generation controls", async () => {
    render(<SubstanceEditorTab commitPanel={<div>Commit panel</div>} />);

    expect(screen.queryByText(/available sources/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/openrouter/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /generate/i })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /lsd/i }));

    expect(await screen.findByText("Substance Article")).toBeInTheDocument();
    expect(screen.getByText("Commit panel")).toBeInTheDocument();
  });

  it("prompts for a substance before any article is selected", () => {
    render(<SubstanceEditorTab commitPanel={<div>Commit panel</div>} />);

    expect(screen.getByText("Select a substance to begin editing")).toBeInTheDocument();
  });

  it("reveals low and hide-for-now articles through the URL-only toggle", () => {
    render(<SubstanceEditorTab commitPanel={<div>Commit panel</div>} />);

    expect(screen.queryByText("Quiet")).not.toBeInTheDocument();
    expect(screen.queryByText("Hidden for now")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Include URL-only" }));

    expect(screen.getByText("Quiet")).toBeInTheDocument();
    expect(screen.getByText("Hidden for now")).toBeInTheDocument();
  });

  it("keeps the current substance when the unsaved-edits confirm is declined", async () => {
    render(<SubstanceEditorTab commitPanel={<div>Commit panel</div>} />);
    await selectLsdAndDirtyTheForm();

    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
    fireEvent.click(screen.getByRole("button", { name: /mdma/i }));

    expect(confirmSpy).toHaveBeenCalledWith(
      "This article has unapplied form edits that will be discarded. Switch substances anyway?",
    );
    expect(screen.getByText("Unsaved changes")).toBeInTheDocument();
    expect(screen.getByLabelText("Display Name / Title")).toHaveValue("LSD edited");
  });

  it("switches substances once the confirm is accepted", async () => {
    render(<SubstanceEditorTab commitPanel={<div>Commit panel</div>} />);
    await selectLsdAndDirtyTheForm();

    vi.spyOn(window, "confirm").mockReturnValue(true);
    fireEvent.click(screen.getByRole("button", { name: /mdma/i }));

    await waitFor(() => {
      expect(screen.queryByText("Unsaved changes")).not.toBeInTheDocument();
    });
  });

  it("does not confirm when the form has no unapplied edits", async () => {
    render(<SubstanceEditorTab commitPanel={<div>Commit panel</div>} />);
    fireEvent.click(screen.getByRole("button", { name: /lsd/i }));
    expect(await screen.findByText("Substance Article")).toBeInTheDocument();

    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
    fireEvent.click(screen.getByRole("button", { name: /mdma/i }));

    expect(confirmSpy).not.toHaveBeenCalled();
  });

  it("names the two-step save and warns while form edits are unapplied", async () => {
    render(<SubstanceEditorTab renderCommitPanel={(actionSlot) => <div>{actionSlot}</div>} />);
    await selectLsdAndDirtyTheForm();

    expect(screen.getByRole("button", { name: "Apply to draft" })).toBeInTheDocument();
    expect(screen.getByText("Unapplied form edits")).toBeInTheDocument();
  });

  it("confirms the in-memory apply with a status pill", async () => {
    render(<SubstanceEditorTab renderCommitPanel={(actionSlot) => <div>{actionSlot}</div>} />);
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

    render(<SubstanceEditorTab commitPanel={<div>Commit panel</div>} />);
    fireEvent.click(screen.getByRole("button", { name: /lsd/i }));
    expect(await screen.findByText("Substance Article")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Copy" }));

    expect(await screen.findByRole("button", { name: "Copied" })).toBeInTheDocument();
    expect(writeText).toHaveBeenCalledTimes(1);
  });

  it("reports a failed clipboard write instead of staying silent", async () => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: vi.fn(async () => { throw new Error("denied"); }) },
    });

    render(<SubstanceEditorTab commitPanel={<div>Commit panel</div>} />);
    fireEvent.click(screen.getByRole("button", { name: /lsd/i }));
    expect(await screen.findByText("Substance Article")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Copy" }));

    expect(await screen.findByRole("button", { name: "Copy failed" })).toBeInTheDocument();
  });
});
