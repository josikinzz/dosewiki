import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { CopyBlockRow } from "./copyStudioUtils";

const query = vi.hoisted(() => ({ rows: [] as CopyBlockRow[] }));

vi.mock("@/hooks/useEditorRead", () => ({
  useEditorRead: (name: string) => (name === "copyBlocks:getEditorCatalogue" ? query.rows : undefined),
  useInvalidateEditorReads: () => async () => undefined,
}));
vi.mock("../useCopyIndexSource", () => ({ useCopyIndexSource: (url: string | null) => ({ data: url ? { document: query.rows.find((row) => row.key === new URL(url, "https://dose.wiki").searchParams.get("key")) ?? null, revision: 0 } : undefined, error: null, reload: vi.fn() }) }));

vi.mock("@/components/pages/PublicMarkdownBody", () => ({
  PublicMarkdownBody: ({ content }: { content: string }) => <div data-testid="preview">{content}</div>,
}));

import { CopyStudioTab } from "./CopyStudioTab";

function railOptions(): HTMLElement[] {
  return within(screen.getByRole("listbox", { name: "Copy blocks" })).getAllByRole("option");
}

function railKeys(): string[] {
  return railOptions().map((option) => option.textContent ?? "");
}

function activeRailKey(): string | undefined {
  return railOptions().find((option) => option.getAttribute("aria-selected") === "true")?.textContent ?? undefined;
}

const STORED_REUSE_NOTICE: CopyBlockRow = {
  key: "about-reuse-notice",
  kind: "markdown",
  body: "Stored wording for the reuse notice.",
  label: "Reuse notice",
  group: "About",
};

describe("CopyStudioTab", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    query.rows = [];
    window.history.replaceState(null, "", "/");
  });

  it("filters the rail by key and label substring across every group", async () => {
    render(<CopyStudioTab canApprove />);

    const search = screen.getByRole("searchbox", { name: "Search" });
    await userEvent.type(search, "about-");

    const keys = railKeys();
    expect(keys.every((entry) => entry.includes("about-"))).toBe(true);
    expect(keys.some((entry) => entry.startsWith("Reuse notice"))).toBe(true);
    expect(keys.some((entry) => entry.includes("SEO"))).toBe(true);
    // The result counter tracks the filtered rail, not the catalogue's size.
    expect(screen.getByText(`${keys.length} found`)).toBeTruthy();

    await userEvent.clear(search);
    await userEvent.type(search, "footer tagline");
    expect(railKeys().every((entry) => entry.startsWith("Footer tagline"))).toBe(true);

    await userEvent.clear(search);
    await userEvent.type(search, "zzz-no-such-block");
    expect(screen.getByText("No block key or label matches that.")).toBeTruthy();
  });

  it("opens on the deep-linked block, its group and its section", () => {
    render(<CopyStudioTab initialKey="about-doc-link-blurbs" canApprove />);

    const sections = screen.getByRole("group", { name: "Copy sections" });
    expect(within(sections).getByRole("button", { name: "Site" }).getAttribute("aria-pressed")).toBe("true");
    const groupTabs = screen.getByRole("tablist", { name: "Copy groups" });
    expect(within(groupTabs).getByRole("tab", { name: /About/ }).getAttribute("aria-selected")).toBe("true");
    expect(within(groupTabs).queryByRole("tab", { name: /Docs/ })).toBeNull();

    expect(activeRailKey()).toContain("about-doc-link-blurbs");
  });

  it("shows only the chosen section's groups and writes the open block into the address", async () => {
    render(<CopyStudioTab canApprove />);

    await userEvent.click(screen.getByRole("button", { name: "Docs" }));
    const groupTabs = screen.getByRole("tablist", { name: "Copy groups" });
    const tabs = within(groupTabs).getAllByRole("tab").map((tab) => tab.textContent ?? "");
    expect(tabs.every((tab) => tab.startsWith("Docs"))).toBe(true);
    expect(tabs).toHaveLength(3);

    const options = railOptions();
    expect(options.length).toBeGreaterThan(0);
    expect(options.length).toBeLessThan(178);

    await userEvent.click(options[1]);
    const key = options[1].textContent?.match(/docs-code-[a-z0-9-]+/)?.[0];
    expect(key).toBeTruthy();
    expect(window.location.pathname).toBe(`/dev/copy-studio/${key}`);
  });

  it("keeps a dirty draft when the editor picks another row and keeps editing, and drops it only on discard", async () => {
    render(<CopyStudioTab initialKey="about-reuse-notice" canApprove />);

    const field = screen.getByRole("textbox", { name: "Copy" });
    const before = (field as HTMLTextAreaElement).value;
    await userEvent.type(field, " Edited.");
    expect(screen.getByText("Unsaved changes")).toBeTruthy();

    const other = railOptions().find((option) => option.textContent?.includes("about-doc-link-blurbs"))!;
    await userEvent.click(other);
    expect(screen.getByRole("dialog", { name: /Discard changes to/ })).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Keep editing" }));
    expect((screen.getByRole("textbox", { name: "Copy" }) as HTMLTextAreaElement).value).toBe(`${before} Edited.`);
    expect(activeRailKey()).toContain("about-reuse-notice");

    await userEvent.click(screen.getByRole("tab", { name: /Footer/ }));
    await userEvent.click(screen.getByRole("button", { name: "Discard changes" }));
    await waitFor(() => expect(activeRailKey()).toContain("footer-"));
    expect(screen.queryByText("Unsaved changes")).toBeNull();
  });

  it("lets an admin save a block directly and removes stored copy only after confirming", async () => {
    query.rows = [STORED_REUSE_NOTICE];
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, key: "about-reuse-notice", updated: false, revision: 1, replayed: false, unchanged: false }),
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<CopyStudioTab initialKey="about-reuse-notice" canApprove />);
    const saveButton = screen.getByRole("button", { name: "Publish copy" });
    expect(saveButton).toBeDisabled();

    await userEvent.type(screen.getByRole("textbox", { name: "Copy" }), " Edited.");
    await userEvent.click(saveButton);
    expect(fetchMock).not.toHaveBeenCalled();
    await userEvent.click(within(screen.getByRole("dialog", { name: "Publish shared copy?" })).getByRole("button", { name: "Publish copy" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/dev/copy-block");
    expect(JSON.parse(init.body as string)).toMatchObject({ key: "about-reuse-notice" });

    await userEvent.click(screen.getByRole("button", { name: "Remove stored copy" }));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const dialog = screen.getByRole("dialog", { name: "Remove stored copy?" });
    await userEvent.click(within(dialog).getByRole("button", { name: "Remove stored copy" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    const [, removeInit] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(removeInit.method).toBe("DELETE");
    expect(JSON.parse(removeInit.body as string).key).toBe("about-reuse-notice");
  });

  it("submits an editor's block and links to the queue", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, proposalId: "cp_abc123" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<CopyStudioTab initialKey="about-reuse-notice" canApprove={false} />);
    expect(screen.queryByRole("button", { name: "Save" })).not.toBeInTheDocument();
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

    expect(await screen.findByText("Submitted for review")).toBeTruthy();
    expect(screen.getByRole("link", { name: "View in queue" })).toHaveAttribute("href", "/dev/queue");
  });

  it("keeps edited copy and its loaded baseline when production changes", async () => {
    query.rows = [STORED_REUSE_NOTICE];
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false, json: async () => ({ error: "Production changed. Your draft is preserved." }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const { rerender } = render(<CopyStudioTab initialKey="about-reuse-notice" canApprove={false} />);
    await userEvent.type(screen.getByRole("textbox", { name: "Copy" }), " Local.");
    query.rows = [{ ...STORED_REUSE_NOTICE, body: "Remote replacement" }];
    rerender(<CopyStudioTab initialKey="about-reuse-notice" canApprove={false} />);
    await userEvent.click(screen.getByRole("button", { name: "Submit for review" }));
    expect(await screen.findByText("Production changed. Your draft is preserved.")).toBeTruthy();
    expect(screen.getByRole("textbox", { name: "Copy" })).toHaveValue(`${STORED_REUSE_NOTICE.body} Local.`);
    const input = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(input.baselines[0].document.body).toBe(STORED_REUSE_NOTICE.body);
  });
});
