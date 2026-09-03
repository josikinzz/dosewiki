import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { COPY_BLOCK_DEFAULTS } from "@/data/content/copyBlocks";

const { useQueryMock } = vi.hoisted(() => ({
  useQueryMock: vi.fn(),
}));

vi.mock("convex/react", () => ({
  useQuery: useQueryMock,
}));

vi.mock("../../../../../convex/_generated/api", () => ({
  api: { siteConfig: { getAbout: "siteConfig.getAbout" } },
}));

vi.mock("@/data/SubstanceIndexProvider", () => ({
  useLibrary: () => ({
    chemicalClassIndexGroups: [],
    dosageCategoryGroups: [],
    mechanismIndexGroups: [],
    substanceRecords: [{ slug: "lsd" }, { slug: "mdma" }],
  }),
}));

vi.mock("@/components/pages/AboutMissionMarkdown", () => ({
  AboutMissionMarkdown: ({ content }: { content: string }) => (
    <div data-testid="mission-preview">{content}</div>
  ),
}));

import { ABOUT_COPY_BLOCKS } from "./aboutEditorUtils";
import { AboutEditorTab } from "./AboutEditorTab";

const ABOUT = {
  aboutMarkdown: "We index {{compoundCount}} compounds.",
  aboutSubtitle: "An open library.",
  founderProfileKeys: ["JOSIE"],
};

describe("AboutEditorTab", () => {
  beforeEach(() => {
    useQueryMock.mockReturnValue(ABOUT);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("links to the four About copy blocks in Copy Studio", () => {
    render(<AboutEditorTab availableProfiles={[]} canApprove />);

    const links = within(screen.getByRole("list", { name: "About copy blocks" })).getAllByRole("link");
    expect(links.map((link) => link.getAttribute("href"))).toEqual([
      "/dev/copy-studio/about-reuse-notice",
      "/dev/copy-studio/about-reuse-notice-effect-index",
      "/dev/copy-studio/about-doc-link-blurbs",
      "/dev/copy-studio/about-mission-effect-index",
    ]);
  });

  it("lists exactly the catalogue's About group", () => {
    expect(ABOUT_COPY_BLOCKS.map((block) => block.key)).toEqual(
      COPY_BLOCK_DEFAULTS.filter((block) => block.group === "About").map((block) => block.key),
    );
  });

  it("saves the whole document immediately and clears the pending changes", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        ok: true,
        about: {
          aboutMarkdown: "We index {{compoundCount}} compounds. Edited.",
          aboutSubtitle: "An open library.",
          founderProfileKeys: ["JOSIE"],
        },
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<AboutEditorTab availableProfiles={[]} canApprove />);

    const saveButton = screen.getByRole("button", { name: "Save About page" });
    expect(saveButton).toBeDisabled();

    await userEvent.type(screen.getByLabelText("Markdown source"), " Edited.");
    expect(screen.getByText("1 section changed")).toBeTruthy();
    expect(saveButton).toBeEnabled();

    await userEvent.click(saveButton);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("/api/dev/about", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          aboutMarkdown: "We index {{compoundCount}} compounds. Edited.",
          aboutSubtitle: "An open library.",
          founderProfileKeys: ["JOSIE"],
        }),
      });
    });
    expect(await screen.findByText("Saved. The public About page is rebuilding with it now.")).toBeTruthy();
    expect(screen.getByText("No pending changes.")).toBeTruthy();
    expect(saveButton).toBeDisabled();
  });

  it("keeps edits typed while a save is in flight and shows them as pending", async () => {
    let resolveSave: ((response: unknown) => void) | undefined;
    const saveResponse = new Promise<unknown>((resolve) => {
      resolveSave = resolve;
    });
    const fetchMock = vi.fn(() => saveResponse);
    vi.stubGlobal("fetch", fetchMock);

    render(<AboutEditorTab availableProfiles={[]} canApprove />);
    const markdown = screen.getByLabelText("Markdown source");
    const saveButton = screen.getByRole("button", { name: "Save About page" });

    await userEvent.type(markdown, " Edited.");
    await userEvent.click(saveButton);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    await userEvent.type(markdown, " Later.");

    resolveSave!({
      ok: true,
      json: async () => ({
        ok: true,
        about: {
          aboutMarkdown: "We index {{compoundCount}} compounds. Edited.",
          aboutSubtitle: "An open library.",
          founderProfileKeys: ["JOSIE"],
        },
      }),
    });

    expect(await screen.findByText("Saved. The public About page is rebuilding with it now.")).toBeTruthy();
    expect(markdown).toHaveValue("We index {{compoundCount}} compounds. Edited. Later.");
    expect(screen.getByText("1 section changed")).toBeTruthy();
    expect(saveButton).toBeEnabled();
  });

  it("keeps the draft and reports the failure when the save is refused", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        json: async () => ({ error: "The subtitle must be 2000 characters or fewer." }),
      }),
    );
    vi.spyOn(console, "error").mockImplementation(() => {});

    render(<AboutEditorTab availableProfiles={[]} canApprove />);
    await userEvent.type(screen.getByLabelText("Meta description source"), "!");
    await userEvent.click(screen.getByRole("button", { name: "Save About page" }));

    expect(await screen.findByText("The subtitle must be 2000 characters or fewer.")).toBeTruthy();
    expect(screen.getByText("1 section changed")).toBeTruthy();
  });

  it("submits an editor's document as a proposal with a field diff and keeps the draft pending", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, proposalId: "cp_abc123" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<AboutEditorTab availableProfiles={[]} canApprove={false} />);
    expect(screen.queryByRole("button", { name: "Save About page" })).not.toBeInTheDocument();
    const submitButton = screen.getByRole("button", { name: "Submit for review" });
    expect(submitButton).toBeDisabled();

    await userEvent.type(screen.getByLabelText("Markdown source"), " Edited.");
    expect(screen.getByText("Changes to propose")).toBeTruthy();
    await userEvent.click(submitButton);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/dev/proposals");
    expect(init.method).toBe("POST");
    const body = JSON.parse(init.body as string);
    expect(body).toMatchObject({
      payload: {
        about: {
          aboutMarkdown: "We index {{compoundCount}} compounds. Edited.",
          aboutSubtitle: "An open library.",
          founderProfileKeys: ["JOSIE"],
        },
      },
      summary: "Update the About page",
    });
    expect(body.diff).toContain("# About copy");
    expect(body.diff).toContain("-We index {{compoundCount}} compounds.");
    expect(body.diff).toContain("+We index {{compoundCount}} compounds. Edited.");
    expect(body.diff).not.toContain("# About subtitle");

    expect(await screen.findByText("Submitted for review")).toBeTruthy();
    expect(screen.getByRole("link", { name: "View in queue" })).toHaveAttribute("href", "/dev/queue");
    // Production is untouched, so the edit is still pending against it.
    expect(screen.getByText("1 section changed")).toBeTruthy();
  });
});
