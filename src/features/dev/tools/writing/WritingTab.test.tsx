import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { WritingArticleRow, WritingListEntry } from "./writingEditorModel";

vi.mock("../about/AboutEditorTab", () => ({
  AboutEditorTab: () => <div data-testid="about-editor">About editor</div>,
}));

vi.mock("@/components/pages/PublicMarkdownBody", () => ({
  PublicMarkdownBody: ({ content }: { content: string }) => <div data-testid="preview">{content}</div>,
}));

import { UnsavedWorkProvider, useUnsavedWorkRegistry } from "@/features/dev/components";
import { WritingTab } from "./WritingTab";

/** Stands in for a shell rail tab, which asks the registry before switching. */
function RailProbe({ onSwitch }: { onSwitch: () => void }) {
  const { confirmExit } = useUnsavedWorkRegistry();
  return <button type="button" onClick={() => confirmExit(onSwitch, "tab")}>Copy</button>;
}

const ENTRIES: WritingListEntry[] = [
  { slug: "field-notes", title: "Field notes", kind: "article", status: "published", creationTime: 1 },
  { slug: "archive-page", title: "Archive page", kind: "article", status: "published", creationTime: 2 },
  { slug: "launch-post", title: "Launch post", kind: "blog", status: "draft", creationTime: 3 },
];

const ROWS: Record<string, WritingArticleRow> = {
  "field-notes": {
    slug: "field-notes",
    title: "Field notes",
    kind: "article",
    status: "published",
    bodyFormat: "markdown",
    body_raw: "Notes.",
    baseRevision: "a".repeat(64),
  },
  "archive-page": {
    slug: "archive-page",
    title: "Archive page",
    kind: "article",
    status: "published",
    bodyFormat: "vcode",
    body_raw: "[legacy]",
    baseRevision: "b".repeat(64),
  },
  "launch-post": {
    slug: "launch-post",
    title: "Launch post",
    kind: "blog",
    status: "draft",
    bodyFormat: "markdown",
    body_raw: "Post.",
    baseRevision: "c".repeat(64),
  },
};

function stubWritingApi() {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const slug = new URL(String(input), "https://dose.wiki").searchParams.get("slug");
      if (slug) {
        return Response.json({ ok: true, article: ROWS[slug] ?? null });
      }
      return Response.json({ ok: true, articles: ENTRIES });
    }),
  );
}

function renderTab(props: Partial<Parameters<typeof WritingTab>[0]> = {}) {
  return render(<WritingTab contributorProfiles={[]} profilesLoading={false} canApprove {...props} />);
}

/** Titles of the rail's entries, pinned entry included, in render order. */
function railTitles(): string[] {
  return Array.from(screen.getByRole("group", { name: "Entries" }).querySelectorAll("[data-entry-title]"))
    .map((item) => item.textContent ?? "");
}

function kindFilter() {
  return within(screen.getByRole("group", { name: "Kind" }));
}

function publicationState() {
  return within(screen.getByRole("group", { name: "Publication state" }));
}

describe("WritingTab", () => {
  beforeEach(() => {
    stubWritingApi();
    window.history.replaceState(null, "", "/dev/writing");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("filters the rail by kind, keeps About pinned first, and writes the kind to the URL", async () => {
    const user = userEvent.setup();
    const replaceState = vi.spyOn(window.history, "replaceState");
    renderTab();

    await screen.findByText("Field notes");
    expect(railTitles()).toEqual(["About page", "Archive page", "Field notes"]);
    expect(kindFilter().getByRole("button", { name: /^Articles/ })).toHaveAttribute("aria-pressed", "true");
    expect(replaceState).not.toHaveBeenCalled();

    await user.click(kindFilter().getByRole("button", { name: /^Blog posts/ }));

    expect(railTitles()).toEqual(["About page", "Launch post"]);
    expect(screen.getByTestId("about-editor")).toBeInTheDocument();
    expect(replaceState).toHaveBeenLastCalledWith(null, "", "/dev/writing/about?kind=blog");

    await user.click(kindFilter().getByRole("button", { name: /^Articles/ }));

    expect(railTitles()).toEqual(["About page", "Archive page", "Field notes"]);
    expect(replaceState).toHaveBeenLastCalledWith(null, "", "/dev/writing/about");
  });

  it("writes the open record's slug to the URL, and drops it for a new draft", async () => {
    const user = userEvent.setup();
    const replaceState = vi.spyOn(window.history, "replaceState");
    renderTab();
    await screen.findByText("Field notes");

    await user.click(screen.getByRole("button", { name: /Field notes/ }));
    await waitFor(() => expect(screen.getByLabelText("Title")).toHaveValue("Field notes"));
    expect(replaceState).toHaveBeenLastCalledWith(null, "", "/dev/writing/field-notes");

    await user.click(screen.getByRole("button", { name: "New article" }));
    expect(replaceState).toHaveBeenLastCalledWith(null, "", "/dev/writing");

    await user.click(screen.getByRole("button", { name: /^About page/ }));
    expect(replaceState).toHaveBeenLastCalledWith(null, "", "/dev/writing/about");
  });

  it("asks before a rail row, About or the kind filter drops an unsaved draft", async () => {
    const user = userEvent.setup();
    renderTab();
    await screen.findByText("Field notes");

    await user.click(screen.getByRole("button", { name: /Field notes/ }));
    await waitFor(() => expect(screen.getByLabelText("Title")).toHaveValue("Field notes"));
    const rail = within(screen.getByRole("group", { name: "Entries" }));
    expect(rail.queryByText("Editing, unsaved")).not.toBeInTheDocument();

    await user.type(screen.getByLabelText("Title"), " extra");
    expect(rail.getByText("Editing, unsaved")).toBeInTheDocument();

    // Keep editing: nothing moves.
    await user.click(screen.getByRole("button", { name: /Archive page/ }));
    const dialog = await screen.findByRole("dialog", { name: "Discard changes to Field notes extra?" });
    await user.click(within(dialog).getByRole("button", { name: "Keep editing" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Title")).toHaveValue("Field notes extra");

    // The kind filter would drop the row too, so it asks as well.
    await user.click(kindFilter().getByRole("button", { name: /^Blog posts/ }));
    await screen.findByRole("dialog", { name: "Discard changes to Field notes extra?" });
    await user.click(screen.getByRole("button", { name: "Keep editing" }));
    expect(kindFilter().getByRole("button", { name: /^Articles/ })).toHaveAttribute("aria-pressed", "true");

    // Discard: the other row opens and the pill goes.
    await user.click(screen.getByRole("button", { name: /^About page/ }));
    await screen.findByRole("dialog");
    await user.click(screen.getByRole("button", { name: "Discard changes" }));
    expect(await screen.findByTestId("about-editor")).toBeInTheDocument();
    expect(rail.queryByText("Editing, unsaved")).not.toBeInTheDocument();
  });

  it("reports an unsaved draft to the shell, whose Discard restores it and moves on", async () => {
    const user = userEvent.setup();
    const onSwitch = vi.fn();
    render(
      <UnsavedWorkProvider>
        <RailProbe onSwitch={onSwitch} />
        <WritingTab contributorProfiles={[]} profilesLoading={false} canApprove />
      </UnsavedWorkProvider>,
    );
    await user.click(await screen.findByRole("button", { name: /Field notes/ }));
    await waitFor(() => expect(screen.getByLabelText("Title")).toHaveValue("Field notes"));
    await user.type(screen.getByLabelText("Title"), " extra");

    await user.click(screen.getByRole("button", { name: "Copy" }));
    const dialog = screen.getByRole("dialog", { name: "Discard your changes?" });
    expect(within(dialog).getByText("Writing: Field notes extra")).toBeTruthy();
    // A published row saves by publishing, which the dialog never does.
    expect(within(dialog).getByText("This change would go live. Publish it from the tool; leaving here never publishes.")).toBeTruthy();
    expect(within(dialog).queryByRole("button", { name: /Publish|Save/ })).toBeNull();
    expect(onSwitch).not.toHaveBeenCalled();

    await user.click(within(dialog).getByRole("button", { name: "Discard" }));

    expect(onSwitch).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText("Title")).toHaveValue("Field notes");
  });

  it("offers an unpublished save in the shell dialog for a draft that has never been live", async () => {
    const user = userEvent.setup();
    const onSwitch = vi.fn();
    render(
      <UnsavedWorkProvider>
        <RailProbe onSwitch={onSwitch} />
        <WritingTab contributorProfiles={[]} profilesLoading={false} canApprove initialKind="blog" />
      </UnsavedWorkProvider>,
    );
    await user.click(await screen.findByRole("button", { name: /Launch post/ }));
    await waitFor(() => expect(screen.getByLabelText("Title")).toHaveValue("Launch post"));
    await user.type(screen.getByLabelText("Title"), " two");

    await user.click(screen.getByRole("button", { name: "Copy" }));
    const dialog = screen.getByRole("dialog", { name: "Save or discard your changes?" });

    expect(within(dialog).getByRole("button", { name: "Save as unpublished" })).toBeTruthy();
    expect(within(dialog).queryByText("This change would go live. Publish it from the tool; leaving here never publishes.")).toBeNull();
  });

  it("opens on the kind the route names without rewriting the URL", async () => {
    const replaceState = vi.spyOn(window.history, "replaceState");
    renderTab({ initialKind: "blog" });

    await screen.findByText("Launch post");
    expect(railTitles()).toEqual(["About page", "Launch post"]);
    expect(kindFilter().getByRole("button", { name: /^Blog posts/ })).toHaveAttribute("aria-pressed", "true");
    expect(replaceState).not.toHaveBeenCalled();
  });

  it("follows a deep-linked row to its own kind and records that in the URL", async () => {
    const replaceState = vi.spyOn(window.history, "replaceState");
    renderTab({ initialSlug: "launch-post" });

    await waitFor(() => expect(screen.getByLabelText("Title")).toHaveValue("Launch post"));
    // The kind flip and the URL write land in an effect after the row renders.
    await waitFor(() => {
      expect(kindFilter().getByRole("button", { name: /^Blog posts/ })).toHaveAttribute("aria-pressed", "true");
      expect(replaceState).toHaveBeenLastCalledWith(null, "", "/dev/writing/launch-post?kind=blog");
    });
  });

  it("shows the cover image field only for blog posts", async () => {
    const user = userEvent.setup();
    renderTab();
    await screen.findByText("Field notes");

    await user.click(screen.getByRole("button", { name: "New article" }));
    expect(screen.getByLabelText("Title")).toBeInTheDocument();
    expect(screen.queryByLabelText("Cover image")).not.toBeInTheDocument();

    await user.click(kindFilter().getByRole("button", { name: /^Blog posts/ }));
    expect(screen.getByLabelText("Cover image")).toBeInTheDocument();
  });

  it("allows local VCode editing and blocks publishing malformed markup", async () => {
    const user = userEvent.setup();
    renderTab({ initialSlug: "archive-page" });
    await waitFor(() => expect(screen.getByLabelText("Title")).toHaveValue("Archive page"));
    await user.clear(screen.getByLabelText("Body"));
    await user.paste("[p]Unclosed");
    expect(screen.getByRole("button", { name: "Publish changes" })).toBeDisabled();
    expect(screen.getByText("Fix the body markup before saving.")).toBeInTheDocument();
    await user.paste("[/p]");
    expect(screen.getByRole("button", { name: "Publish changes" })).toBeEnabled();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Publish changes" }));
    const dialog = screen.getByRole("dialog", { name: "Publish changes to “Archive page”?" });
    expect(within(dialog).getByText(/You changed the body\./)).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Publish changes" })).toBeEnabled();
  });

  it("lets an editor submit a post for review as a proposal, never a direct save", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input) === "/api/dev/proposals" && init?.method === "POST") {
        return Response.json({ ok: true, proposalId: "cp_abcdef123456" });
      }
      const slug = new URL(String(input), "https://dose.wiki").searchParams.get("slug");
      return slug ? Response.json({ ok: true, article: ROWS[slug] ?? null }) : Response.json({ ok: true, articles: ENTRIES });
    });
    renderTab({ canApprove: false, initialSlug: "launch-post" });
    await waitFor(() => expect(screen.getByLabelText("Title")).toHaveValue("Launch post"));

    // No tooltip-only refusal: the editor has a real action instead.
    expect(screen.queryByRole("button", { name: /^(Publish|Publish changes|Save draft)$/ })).not.toBeInTheDocument();
    expect(screen.queryByTitle("Admin role required")).not.toBeInTheDocument();
    const submit = screen.getByRole("button", { name: "Submit for review" });
    expect(submit).toBeDisabled();

    await user.type(screen.getByLabelText("Body"), " More.");
    await user.click(publicationState().getByRole("button", { name: "Published" }));
    await user.click(submit);

    const posts = fetchMock.mock.calls.filter(([, init]) => init?.method === "POST");
    expect(posts.map(([url]) => String(url))).toEqual(["/api/dev/proposals"]);
    const body = JSON.parse(String(posts[0][1]?.body));
    expect(body).toMatchObject({
      summary: "Update blog post “Launch post”",
      payload: { writing: { slug: "launch-post", kind: "blog", status: "published", bodyFormat: "markdown", title: "Launch post", body: "Post. More." } },
      baselines: [{ kind: "writing", key: "launch-post", document: ROWS["launch-post"] }],
    });
    expect(await screen.findByText("Submitted for review")).toBeInTheDocument();
    // The proposal holds the edit; the editor returns to the saved version.
    expect(screen.getByLabelText("Body")).toHaveValue("Post.");
  });

  it("offers Submit for review in the shell dialog for an editor", async () => {
    const user = userEvent.setup();
    render(
      <UnsavedWorkProvider>
        <RailProbe onSwitch={vi.fn()} />
        <WritingTab contributorProfiles={[]} profilesLoading={false} canApprove={false} initialKind="blog" />
      </UnsavedWorkProvider>,
    );
    await user.click(await screen.findByRole("button", { name: /Launch post/ }));
    await waitFor(() => expect(screen.getByLabelText("Title")).toHaveValue("Launch post"));
    await user.type(screen.getByLabelText("Title"), " two");

    await user.click(screen.getByRole("button", { name: "Copy" }));
    const dialog = screen.getByRole("dialog", { name: "Save or discard your changes?" });
    expect(within(dialog).getByRole("button", { name: "Submit for review" })).toBeTruthy();
  });

  it("renders the preview beside the editor and updates it as the body is typed", async () => {
    const user = userEvent.setup();
    renderTab({ initialSlug: "launch-post" });
    await waitFor(() => expect(screen.getByLabelText("Title")).toHaveValue("Launch post"));

    const preview = screen.getByRole("region", { name: "Preview" });
    expect(within(preview).getByTestId("preview")).toHaveTextContent("Post.");

    await user.type(screen.getByLabelText("Body"), " Fresh line");
    expect(within(preview).getByTestId("preview")).toHaveTextContent("Post. Fresh line");

    await user.click(within(screen.getByRole("group", { name: "View" })).getByRole("button", { name: "Write" }));
    expect(screen.queryByRole("region", { name: "Preview" })).not.toBeInTheDocument();
    await user.click(within(screen.getByRole("group", { name: "View" })).getByRole("button", { name: "Preview" }));
    expect(screen.getByRole("region", { name: "Preview" })).toBeInTheDocument();
    expect(screen.queryByLabelText("Body")).not.toBeInTheDocument();
  });

  it("blocks saving an invalid publication date with a field error", async () => {
    const user = userEvent.setup();
    ROWS["dated-post"] = { ...ROWS["launch-post"], slug: "dated-post", title: "Dated post", publicationDate: "2026-02-30" };
    renderTab({ canApprove: false, initialSlug: "dated-post" });
    await waitFor(() => expect(screen.getByLabelText("Title")).toHaveValue("Dated post"));
    await user.type(screen.getByLabelText("Title"), " edited");

    expect(screen.getByText("“2026-02-30” is not a real date. Pick a day, or clear the field.")).toBeInTheDocument();
    expect(screen.getByLabelText("Publication date")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByRole("button", { name: "Submit for review" })).toBeDisabled();

    fireEvent.change(screen.getByLabelText("Publication date"), { target: { value: "2026-02-28" } });
    expect(screen.queryByText(/is not a real date/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Submit for review" })).toBeEnabled();
    delete ROWS["dated-post"];
  });

  it("shows the cover image as a thumbnail and edits tags with the tag picker", async () => {
    const user = userEvent.setup();
    renderTab({ initialKind: "blog" });
    await screen.findByText("Launch post");
    await user.click(screen.getByRole("button", { name: "New post" }));

    await user.type(screen.getByLabelText("Cover image"), "/images/cover.png");
    expect(screen.getByRole("img", { name: "Cover preview" })).toHaveAttribute("src", "/images/cover.png");

    const tags = screen.getByRole("combobox", { name: /Tags/ });
    await user.type(tags, "harm reduction{Enter}");
    expect(screen.getByText("Harm Reduction")).toBeInTheDocument();
  });

  it("keeps the admin path: a confirm that names the changes, then a direct save", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "POST") return Response.json({ ok: true, slug: "launch-post", revision: "d".repeat(64) });
      const slug = new URL(String(input), "https://dose.wiki").searchParams.get("slug");
      return slug ? Response.json({ ok: true, article: ROWS[slug] ?? null }) : Response.json({ ok: true, articles: ENTRIES });
    });
    renderTab({ initialSlug: "launch-post" });
    await waitFor(() => expect(screen.getByLabelText("Title")).toHaveValue("Launch post"));
    expect(screen.queryByRole("button", { name: "Submit for review" })).not.toBeInTheDocument();

    await user.type(screen.getByLabelText("Body"), " More.");
    await user.click(screen.getByRole("button", { name: "Save draft" }));
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === "POST")).toBe(false);
    const dialog = screen.getByRole("dialog", { name: "Save “Launch post” as a draft?" });
    await user.click(within(dialog).getByRole("button", { name: "Save draft" }));

    await waitFor(() => expect(fetchMock.mock.calls.some(([, init]) => init?.method === "POST")).toBe(true));
    const posts = fetchMock.mock.calls.filter(([, init]) => init?.method === "POST");
    expect(posts.map(([url]) => String(url))).toEqual(["/api/dev/writing-article"]);
    expect(JSON.parse(String(posts[0][1]?.body))).toMatchObject({ slug: "launch-post", body: "Post. More.", status: "draft" });
  });

  it("names the reload action in plain words", async () => {
    renderTab({ initialSlug: "field-notes" });
    await waitFor(() => expect(screen.getByLabelText("Title")).toHaveValue("Field notes"));
    expect(screen.queryByText(/baseline/i)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Load the latest saved version" })).toBeInTheDocument();
  });
});
