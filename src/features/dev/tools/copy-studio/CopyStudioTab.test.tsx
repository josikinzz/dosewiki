import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("convex/react", () => ({
  useQuery: () => [],
}));

vi.mock("../../../../../convex/_generated/api", () => ({
  api: { copyBlocks: { getAll: "copyBlocks.getAll" } },
}));

vi.mock("@/components/pages/PublicMarkdownBody", () => ({
  PublicMarkdownBody: ({ content }: { content: string }) => <div data-testid="preview">{content}</div>,
}));

import { CopyStudioTab } from "./CopyStudioTab";

function railKeys(): string[] {
  return within(screen.getByRole("group", { name: "Copy blocks" }))
    .getAllByRole("button")
    .map((button) => button.textContent ?? "");
}

describe("CopyStudioTab", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("filters the rail by key and label substring across every group", async () => {
    render(<CopyStudioTab canApprove />);

    const search = screen.getByRole("searchbox", { name: "Search" });
    await userEvent.type(search, "about-");

    const keys = railKeys();
    expect(keys).toHaveLength(6);
    expect(keys.every((entry) => entry.includes("about-"))).toBe(true);
    expect(keys.some((entry) => entry.startsWith("Reuse notice"))).toBe(true);
    expect(keys.some((entry) => entry.includes("SEO"))).toBe(true);
    expect(screen.getByText("6 found")).toBeTruthy();

    await userEvent.clear(search);
    await userEvent.type(search, "footer tagline");
    expect(railKeys().every((entry) => entry.startsWith("Footer tagline"))).toBe(true);

    await userEvent.clear(search);
    await userEvent.type(search, "zzz-no-such-block");
    expect(screen.getByText("No block key or label matches that.")).toBeTruthy();
  });

  it("opens on the deep-linked block and its group", () => {
    render(<CopyStudioTab initialKey="about-doc-link-blurbs" canApprove />);

    const groupTabs = screen.getByRole("tablist", { name: "Copy groups" });
    expect(within(groupTabs).getByRole("tab", { name: /About/ }).getAttribute("aria-selected")).toBe("true");

    const active = within(screen.getByRole("group", { name: "Copy blocks" }))
      .getAllByRole("button")
      .find((button) => button.getAttribute("aria-pressed") === "true");
    expect(active?.textContent).toContain("about-doc-link-blurbs");
  });

  it("lets an admin save a block directly and remove stored copy", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, key: "about-reuse-notice", updated: false }),
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<CopyStudioTab initialKey="about-reuse-notice" canApprove />);
    expect(screen.getByRole("button", { name: "Remove stored copy" })).toBeInTheDocument();
    const saveButton = screen.getByRole("button", { name: "Save copy" });
    expect(saveButton).toBeDisabled();

    await userEvent.type(screen.getByRole("textbox", { name: "Copy" }), " Edited.");
    await userEvent.click(saveButton);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/dev/copy-block");
    expect(JSON.parse(init.body as string)).toMatchObject({ key: "about-reuse-notice" });
  });

  it("submits an editor's block as a proposal with a diff and links to the queue", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, proposalId: "cp_abc123" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<CopyStudioTab initialKey="about-reuse-notice" canApprove={false} />);
    expect(screen.queryByRole("button", { name: "Save copy" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Remove stored copy" })).not.toBeInTheDocument();
    const submitButton = screen.getByRole("button", { name: "Submit for review" });
    expect(submitButton).toBeDisabled();

    const field = screen.getByRole("textbox", { name: "Copy" });
    const before = (field as HTMLTextAreaElement).value;
    await userEvent.type(field, " Edited.");
    expect(screen.getByText("Changes to propose")).toBeTruthy();
    await userEvent.click(submitButton);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/dev/proposals");
    expect(init.method).toBe("POST");
    const body = JSON.parse(init.body as string);
    expect(body.payload.copyBlocks).toHaveLength(1);
    expect(body.payload.copyBlocks[0]).toMatchObject({
      key: "about-reuse-notice",
      group: "About",
      body: `${before} Edited.`,
    });
    expect(body.summary).toMatch(/^Update copy "/);
    expect(body.diff).toContain(`+${before} Edited.`);

    expect(await screen.findByText("Submitted for review")).toBeTruthy();
    expect(screen.getByRole("link", { name: "View in queue" })).toHaveAttribute("href", "/dev/queue");
  });
});
