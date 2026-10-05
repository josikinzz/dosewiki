import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { CopyBlockRow } from "./copyStudioUtils";

const query = vi.hoisted(() => ({ rows: [] as CopyBlockRow[] }));

vi.mock("@/hooks/useEditorRead", () => ({
  useEditorReadState: (name: string) => ({
    data: name === "copyBlocks:getEditorCatalogue" ? query.rows : undefined,
    error: null,
    fetching: false,
    retry: vi.fn(),
  }),
  useInvalidateEditorReads: () => async () => undefined,
}));
/** `state` overrides the snapshot read, to hold the tab in its loading or failed state. */
const source = vi.hoisted(() => ({ state: null as { data: undefined; error: string | null } | null }));
vi.mock("../useCopyIndexSource", () => ({ useCopyIndexSource: (url: string | null) => source.state ? { ...source.state, reload: vi.fn() } : ({ data: url ? { document: query.rows.find((row) => row.key === new URL(url, "https://dose.wiki").searchParams.get("key")) ?? null, revision: 0 } : undefined, error: null, reload: vi.fn() }) }));

vi.mock("@/components/pages/PublicMarkdownBody", () => ({
  PublicMarkdownBody: ({ content }: { content: string }) => <div data-testid="preview">{content}</div>,
}));

import { UnsavedWorkProvider, useUnsavedWorkRegistry } from "@/features/dev/components";
import { CopyStudioTab } from "./CopyStudioTab";

/** Stands in for the shell's Leave button, which asks the registry first. */
function LeaveProbe({ onLeave }: { onLeave: () => void }) {
  const { confirmExit } = useUnsavedWorkRegistry();
  return <button type="button" onClick={() => confirmExit(onLeave, "leave")}>Leave editor</button>;
}

/** The writes a test's fetch saw; the tool also reads the open proposals with a GET. */
function writes(fetchMock: ReturnType<typeof vi.fn>): [string, RequestInit][] {
  return (fetchMock.mock.calls as [string, RequestInit | undefined][])
    .filter(([, init]) => init?.method && init.method !== "GET") as [string, RequestInit][];
}

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
    source.state = null;
    window.history.replaceState(null, "", "/");
  });

  it("filters the rail by key and label substring across every group, name matches first", async () => {
    render(<CopyStudioTab canApprove />);

    const search = screen.getByRole("searchbox", { name: "Search" });
    // Pasted, as a one-letter prefix matches the text of nearly every block.
    await userEvent.click(search);
    await userEvent.paste("about-");

    const keys = railKeys();
    const firstTextMatch = keys.findIndex((entry) => !entry.includes("about-"));
    expect(firstTextMatch).not.toBe(0);
    if (firstTextMatch > 0) {
      expect(keys.slice(firstTextMatch).some((entry) => entry.includes("about-"))).toBe(false);
    }
    expect(keys.some((entry) => entry.startsWith("Reuse notice"))).toBe(true);
    expect(keys.some((entry) => entry.includes("SEO"))).toBe(true);
    // The result counter tracks the filtered rail, not the catalogue's size.
    expect(screen.getByText(`${keys.length} matches in every section`)).toBeTruthy();

    await userEvent.clear(search);
    await userEvent.paste("footer tagline");
    expect(railKeys().every((entry) => entry.startsWith("Footer tagline"))).toBe(true);

    await userEvent.clear(search);
    await userEvent.paste("zzz-no-such-block");
    expect(screen.getByText("No block key, label or text matches that.")).toBeTruthy();
  });

  it("opens on the deep-linked block, its group and its section", () => {
    render(<CopyStudioTab initialKey="about-doc-link-blurbs" canApprove />);

    const sections = screen.getByRole("group", { name: "Copy sections" });
    expect(within(sections).getByRole("button", { name: /^Site/ }).getAttribute("aria-pressed")).toBe("true");
    const group = screen.getByRole("combobox", { name: "Group" }) as HTMLSelectElement;
    expect(group.value).toBe("About");
    expect(within(group).queryByRole("option", { name: /Docs|Code/ })).toBeNull();
    expect(screen.getByRole("heading", { level: 3, name: /Documentation card blurbs/ })).toBeTruthy();

    expect(activeRailKey()).toContain("about-doc-link-blurbs");
  });

  it("shows only the chosen section's groups and writes the open block into the address", async () => {
    render(<CopyStudioTab canApprove />);

    await userEvent.click(screen.getByRole("button", { name: /^Docs/ }));
    const group = screen.getByRole("combobox", { name: "Group" });
    const labels = within(group).getAllByRole("option").map((option) => option.textContent ?? "");
    // The section already says Docs, so the groups drop the prefix.
    expect(labels.map((label) => label.replace(/ \(\d+\)$/, ""))).toEqual(["Code", "How", "License"]);

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
    expect(screen.getByText("Unpublished changes")).toBeTruthy();

    const other = railOptions().find((option) => option.textContent?.includes("about-doc-link-blurbs"))!;
    await userEvent.click(other);
    expect(screen.getByRole("dialog", { name: /Discard changes to/ })).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Keep editing" }));
    expect((screen.getByRole("textbox", { name: "Copy" }) as HTMLTextAreaElement).value).toBe(`${before} Edited.`);
    expect(activeRailKey()).toContain("about-reuse-notice");

    await userEvent.selectOptions(screen.getByRole("combobox", { name: "Group" }), "Footer");
    await userEvent.click(screen.getByRole("button", { name: "Discard changes" }));
    await waitFor(() => expect(activeRailKey()).toContain("footer-"));
    expect(screen.queryByText("Unpublished changes")).toBeNull();
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
    expect(writes(fetchMock)).toHaveLength(0);
    const confirmDialog = screen.getByRole("dialog", { name: "Publish “Reuse notice”?" });
    // The confirm shows the change it publishes.
    expect(within(confirmDialog).getByText(/Edited\./)).toBeTruthy();
    await userEvent.click(within(confirmDialog).getByRole("button", { name: "Publish copy" }));

    await waitFor(() => expect(writes(fetchMock)).toHaveLength(1));
    const [url, init] = writes(fetchMock)[0];
    expect(url).toBe("/api/dev/copy-block");
    expect(JSON.parse(init.body as string)).toMatchObject({ key: "about-reuse-notice" });
    expect(await screen.findByText(/Published “Reuse notice”/)).toBeTruthy();

    // Removal folds shut at the end of the pane.
    await userEvent.click(screen.getByRole("button", { name: /Remove the stored copy/ }));
    await userEvent.click(screen.getByRole("button", { name: "Remove stored copy" }));
    expect(writes(fetchMock)).toHaveLength(1);
    const dialog = screen.getByRole("dialog", { name: "Remove stored copy?" });
    await userEvent.click(within(dialog).getByRole("button", { name: "Remove stored copy" }));

    await waitFor(() => expect(writes(fetchMock)).toHaveLength(2));
    const [, removeInit] = writes(fetchMock)[1];
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

    await waitFor(() => expect(writes(fetchMock)).toHaveLength(1));
    const [url, init] = writes(fetchMock)[0];
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
    expect(screen.getByRole("link", { name: "Open in Change Review" })).toHaveAttribute("href", "/dev/queue");
  });

  it("reports its unsaved block to the shell, whose Save submits it before leaving", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, proposalId: "cp_abc123" }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const onLeave = vi.fn();

    render(
      <UnsavedWorkProvider>
        <LeaveProbe onLeave={onLeave} />
        <CopyStudioTab initialKey="about-reuse-notice" canApprove={false} />
      </UnsavedWorkProvider>,
    );
    await userEvent.type(screen.getByRole("textbox", { name: "Copy" }), " Edited.");

    await userEvent.click(screen.getByRole("button", { name: "Leave editor" }));
    const dialog = screen.getByRole("dialog", { name: "Save or discard your changes?" });
    expect(within(dialog).getByText("Copy: Reuse notice")).toBeTruthy();
    expect(onLeave).not.toHaveBeenCalled();

    await userEvent.click(within(dialog).getByRole("button", { name: "Submit for review" }));

    await waitFor(() => expect(onLeave).toHaveBeenCalledTimes(1));
    expect(writes(fetchMock)[0][0]).toBe("/api/dev/proposals");
  });

  it("never publishes an admin's block from the shell dialog, only discards it", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const onLeave = vi.fn();

    render(
      <UnsavedWorkProvider>
        <LeaveProbe onLeave={onLeave} />
        <CopyStudioTab initialKey="about-reuse-notice" canApprove />
      </UnsavedWorkProvider>,
    );
    await userEvent.type(screen.getByRole("textbox", { name: "Copy" }), " Edited.");

    await userEvent.click(screen.getByRole("button", { name: "Leave editor" }));
    const dialog = screen.getByRole("dialog", { name: "Discard your changes?" });
    expect(within(dialog).getByText("This change would go live. Publish it from the tool; leaving here never publishes.")).toBeTruthy();
    expect(within(dialog).queryByRole("button", { name: /Publish|Save|Submit/ })).toBeNull();

    await userEvent.click(within(dialog).getByRole("button", { name: "Discard" }));

    expect(onLeave).toHaveBeenCalledTimes(1);
    expect(writes(fetchMock)).toHaveLength(0);
  });

  it("finds a block by a phrase from its stored text", async () => {
    query.rows = [STORED_REUSE_NOTICE];
    render(<CopyStudioTab canApprove />);

    await userEvent.type(screen.getByRole("searchbox", { name: "Search" }), "wording for the reuse");
    expect(railKeys()).toHaveLength(1);
    expect(railKeys()[0]).toContain("about-reuse-notice");
  });

  it("resets to the published copy after a submission, shows it pending, and needs a new edit to resubmit", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, proposalId: "cp_abc123" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<CopyStudioTab initialKey="about-reuse-notice" canApprove={false} />);
    const field = screen.getByRole("textbox", { name: "Copy" });
    const before = (field as HTMLTextAreaElement).value;
    await userEvent.type(field, " Edited.");
    await userEvent.click(screen.getByRole("button", { name: "Submit for review" }));
    expect(await screen.findByText("Submitted for review")).toBeTruthy();

    expect(screen.getByRole("textbox", { name: "Copy" })).toHaveValue(before);
    expect(screen.getAllByText("Proposal pending").length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "Submit for review" })).toBeDisabled();

    const other = railOptions().find((option) => option.textContent?.includes("about-doc-link-blurbs"))!;
    await userEvent.click(other);
    expect(screen.queryByRole("dialog", { name: /Discard changes to/ })).toBeNull();
    await waitFor(() => expect(activeRailKey()).toContain("about-doc-link-blurbs"));
    expect(writes(fetchMock)).toHaveLength(1);
  });

  it("renders the preview and the diff before the publish toolbar", async () => {
    render(<CopyStudioTab initialKey="about-reuse-notice" canApprove />);
    await userEvent.type(screen.getByRole("textbox", { name: "Copy" }), " Edited.");

    const publish = screen.getByRole("button", { name: "Publish copy" });
    for (const heading of ["Preview", "Changes"]) {
      const section = screen.getByRole("heading", { name: heading });
      expect(section.compareDocumentPosition(publish) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    }
  });

  it("names the two ways back to the default apart and says what each does", async () => {
    query.rows = [STORED_REUSE_NOTICE];
    render(<CopyStudioTab initialKey="about-reuse-notice" canApprove />);

    const draftReset = screen.getByRole("button", { name: "Load default into draft" });
    await userEvent.click(screen.getByRole("button", { name: /Remove the stored copy/ }));
    const remove = screen.getByRole("button", { name: "Remove stored copy" });
    expect(draftReset).toHaveAccessibleDescription(/draft/i);
    expect(remove).toHaveAccessibleDescription(/public pages/i);
    expect(screen.queryByRole("button", { name: "Reset to default" })).toBeNull();
  });

  it("uses the kit notice while the block loads and when it fails", async () => {
    source.state = { data: undefined, error: null };
    const { rerender } = render(<CopyStudioTab initialKey="about-reuse-notice" canApprove />);
    expect(screen.getByText(/Loading the stored copy/).closest('[role="status"]')).not.toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();

    source.state = { data: undefined, error: "The editing source could not be loaded." };
    rerender(<CopyStudioTab initialKey="about-reuse-notice" canApprove />);
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("The editing source could not be loaded.");
    expect(within(alert).getByRole("button", { name: "Try again" })).toBeTruthy();
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
    const input = JSON.parse(writes(fetchMock)[0][1].body as string);
    expect(input.baselines[0].document.body).toBe(STORED_REUSE_NOTICE.body);
  });
  /** A fetch that answers the proposal list and hands every write to `write`. */
  function routedFetch(write: (url: string, init: RequestInit) => { ok: boolean; status: number; body: unknown }) {
    return vi.fn(async (url: string, init?: RequestInit) => {
      if (!init?.method || init.method === "GET") return { ok: true, status: 200, json: async () => ({ proposals: [] }) };
      const answer = write(url, init);
      return { ok: answer.ok, status: answer.status, json: async () => answer.body };
    });
  }

  it("offers the latest version after someone else published, behind a confirm that says the edits are dropped", async () => {
    query.rows = [STORED_REUSE_NOTICE];
    const fetchMock = routedFetch(() => ({ ok: false, status: 409, body: { error: "Published content changed since you opened this editor.", code: "EDIT_CONFLICT" } }));
    vi.stubGlobal("fetch", fetchMock);
    render(<CopyStudioTab initialKey="about-reuse-notice" canApprove />);

    await userEvent.type(screen.getByRole("textbox", { name: "Copy" }), " Edited.");
    await userEvent.click(screen.getByRole("button", { name: "Publish copy" }));
    await userEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Publish copy" }));

    const save = screen.getByRole("contentinfo", { name: "Save" });
    expect(await within(save).findByText("Someone published this block after you opened it.")).toBeTruthy();
    // The draft is kept and still editable.
    expect(screen.getByRole("textbox", { name: "Copy" })).toHaveValue(`${STORED_REUSE_NOTICE.body} Edited.`);
    expect(screen.getByRole("textbox", { name: "Copy" })).toBeEnabled();
    await userEvent.click(within(save).getByRole("button", { name: "Load the latest version" }));
    const dialog = screen.getByRole("dialog", { name: "Load the latest version?" });
    expect(within(dialog).getByText(/edits here are dropped/)).toBeTruthy();
  });

  it("says a freeze refusal plainly and keeps the draft editable", async () => {
    query.rows = [STORED_REUSE_NOTICE];
    vi.stubGlobal("fetch", routedFetch(() => ({ ok: false, status: 503, body: { error: "Data writes are frozen.", code: "DATA_WRITES_FROZEN" } })));
    render(<CopyStudioTab initialKey="about-reuse-notice" canApprove />);

    await userEvent.type(screen.getByRole("textbox", { name: "Copy" }), " Edited.");
    await userEvent.click(screen.getByRole("button", { name: "Publish copy" }));
    await userEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Publish copy" }));

    expect(await screen.findByText(/Writes are paused, so your changes were not published/)).toBeTruthy();
    expect(screen.queryByText(/Publication unconfirmed/)).toBeNull();
    expect(screen.getByRole("textbox", { name: "Copy" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Discard edits" })).toBeEnabled();
  });

  it("opens the publish confirm from Cmd+S and never publishes past it", async () => {
    const fetchMock = routedFetch(() => ({ ok: true, status: 200, body: { ok: true, revision: 1, replayed: false, unchanged: false } }));
    vi.stubGlobal("fetch", fetchMock);
    render(<CopyStudioTab initialKey="about-reuse-notice" canApprove />);

    await userEvent.type(screen.getByRole("textbox", { name: "Copy" }), " Edited.");
    await userEvent.keyboard("{Meta>}s{/Meta}");
    expect(screen.getByRole("dialog", { name: "Publish “Reuse notice”?" })).toBeTruthy();
    expect(writes(fetchMock)).toHaveLength(0);
  });

  it("warns about a deep link to a key no block has", () => {
    render(<CopyStudioTab initialKey="no-such-block" canApprove />);
    expect(screen.getByText(/No copy block has the key "no-such-block"/)).toBeTruthy();
  });

  it("warns when a draft drops a placeholder the live text uses", async () => {
    render(<CopyStudioTab initialKey="seo-substances-index-description" canApprove />);
    const field = screen.getByRole("textbox", { name: "Copy" });
    await userEvent.clear(field);
    await userEvent.type(field, "Browse substance records.");
    expect(screen.getByText(/You removed \{\{siteName\}\}, \{\{substanceCount\}\}/)).toBeTruthy();
  });

  it("lists every edited block across sections with Edited only", async () => {
    query.rows = [STORED_REUSE_NOTICE, { key: "footer-tagline", kind: "plain", body: "Stored footer.", label: "Footer tagline", group: "Footer" }];
    render(<CopyStudioTab canApprove />);

    await userEvent.click(screen.getByRole("button", { name: /^Edited only/ }));
    expect(railKeys().map((entry) => entry.match(/[a-z]+(?:-[a-z]+)+/)?.[0])).toEqual(["footer-tagline", "about-reuse-notice"]);
    expect(screen.getByText("2 edited blocks in every section")).toBeTruthy();
  });
  it("moves list items up and down and says where each landed", async () => {
    render(<CopyStudioTab initialKey="about-doc-link-blurbs" canApprove />);
    const first = (screen.getByRole("textbox", { name: "Item 1" }) as HTMLInputElement).value;
    const second = (screen.getByRole("textbox", { name: "Item 2" }) as HTMLInputElement).value;
    expect(screen.getByRole("button", { name: "Move item 1 up" })).toBeDisabled();

    await userEvent.click(screen.getByRole("button", { name: "Move item 1 down" }));
    expect(screen.getByRole("textbox", { name: "Item 1" })).toHaveValue(second);
    expect(screen.getByRole("textbox", { name: "Item 2" })).toHaveValue(first);
    expect(screen.getByText("Item 1 moved to position 2.")).toBeTruthy();
    expect(screen.getByText("Unpublished changes")).toBeTruthy();
  });
});
