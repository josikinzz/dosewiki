import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// cmdk scrolls the active picker row into view; jsdom has no scrollIntoView.
beforeAll(() => {
  Element.prototype.scrollIntoView ??= () => {};
});

import { COPY_BLOCK_DEFAULTS } from "@/data/content/copyBlocks";

const { useQueryMock } = vi.hoisted(() => ({
  useQueryMock: vi.fn(),
}));

vi.mock("../useCopyIndexSource", () => ({ useCopyIndexSource: () => ({ data: useQueryMock(), error: null, reload: vi.fn() }) }));

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

  it("links to the five About copy blocks in Copy Studio", () => {
    render(<AboutEditorTab availableProfiles={[]} canApprove />);

    const links = within(screen.getByRole("list", { name: "About copy blocks" })).getAllByRole("link");
    expect(links.map((link) => link.getAttribute("href"))).toEqual([
      "/dev/copy-studio/about-reuse-notice",
      "/dev/copy-studio/about-reuse-notice-effect-index",
      "/dev/copy-studio/about-doc-link-blurbs",
      "/dev/copy-studio/about-mission-effect-index",
      "/dev/copy-studio/about-community-intro",
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
        revision: 1, replayed: false, unchanged: false,
        about: {
          aboutMarkdown: "We index {{compoundCount}} compounds. Edited.",
          aboutSubtitle: "An open library.",
          founderProfileKeys: ["JOSIE"],
          revision: 1,
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
    expect(fetchMock).not.toHaveBeenCalled();
    await userEvent.click(within(screen.getByRole("dialog", { name: "Publish About copy?" })).getByRole("button", { name: "Publish About copy" }));

    expect(await screen.findByText("Saved. The public About page is rebuilding with it now.")).toBeTruthy();
    expect(screen.getByText("No pending changes.")).toBeTruthy();
    expect(saveButton).toBeDisabled();
  });

  it("shows the chosen founders as cards and adds another through the picker", async () => {
    const profile = (key: string, displayName: string) => ({
      key,
      displayName,
      aliases: [],
      avatarUrl: null,
      bio: "",
      links: [],
      hasCustomBio: false,
    });
    render(
      <AboutEditorTab
        availableProfiles={[profile("JOSIE", "Josie Kins"), profile("AVA", "Ava Lane"), profile("BEN", "Ben Ray")]}
        canApprove
      />,
    );

    const founders = () => within(screen.getByRole("list", { name: "Founders" }));
    expect(founders().getAllByRole("listitem")).toHaveLength(1);
    expect(founders().getByText("Josie Kins")).toBeInTheDocument();
    // The directory is searched, never listed: nobody unselected is on the page.
    expect(screen.queryByText("Ava Lane")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("combobox", { name: "Add founder" }));
    fireEvent.change(await screen.findByPlaceholderText("Find a contributor"), { target: { value: "ava" } });
    fireEvent.click(await screen.findByRole("option", { name: /Ava Lane/ }));

    expect(founders().getAllByRole("listitem")).toHaveLength(2);
    expect(screen.getByText("1 section changed")).toBeTruthy();

    fireEvent.click(founders().getByRole("button", { name: "Remove Josie Kins" }));
    expect(founders().getAllByRole("listitem")).toHaveLength(1);
    expect(founders().queryByText("Josie Kins")).not.toBeInTheDocument();
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
    await userEvent.click(within(screen.getByRole("dialog", { name: "Publish About copy?" })).getByRole("button", { name: "Publish About copy" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    await userEvent.type(markdown, " Later.");

    resolveSave!({
      ok: true,
      json: async () => ({
        ok: true,
        revision: 1, replayed: false, unchanged: false,
        about: {
          aboutMarkdown: "We index {{compoundCount}} compounds. Edited.",
          aboutSubtitle: "An open library.",
          founderProfileKeys: ["JOSIE"],
          revision: 1,
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
    await userEvent.click(within(screen.getByRole("dialog", { name: "Publish About copy?" })).getByRole("button", { name: "Publish About copy" }));

    expect(await screen.findByText("The subtitle must be 2000 characters or fewer.")).toBeTruthy();
    expect(screen.getByText("1 section changed")).toBeTruthy();
  });

  it("submits an editor's document and keeps the draft pending", async () => {
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

    expect(await screen.findByText("Submitted for review")).toBeTruthy();
    expect(screen.getByRole("link", { name: "View in queue" })).toHaveAttribute("href", "/dev/queue");
    // Production is untouched, so the edit is still pending against it.
    expect(screen.getByText("1 section changed")).toBeTruthy();
  });

  it("preserves a stale draft and its loaded baseline across a production refresh and rejection", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false, json: async () => ({ error: "Production changed. Your draft is preserved." }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const { rerender } = render(<AboutEditorTab availableProfiles={[]} canApprove={false} />);
    await userEvent.type(screen.getByLabelText("Markdown source"), " Local.");
    useQueryMock.mockReturnValue({ ...ABOUT, aboutMarkdown: "Remote replacement" });
    rerender(<AboutEditorTab availableProfiles={[]} canApprove={false} />);
    await userEvent.click(screen.getByRole("button", { name: "Submit for review" }));
    expect(await screen.findByText("Production changed. Your draft is preserved.")).toBeTruthy();
    expect(screen.getByLabelText("Markdown source")).toHaveValue(`${ABOUT.aboutMarkdown} Local.`);
    const input = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(input.baselines[0].document.aboutMarkdown).toBe(ABOUT.aboutMarkdown);
  });
});
