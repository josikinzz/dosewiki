import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { WritingArticleRow, WritingListEntry } from "./writingEditorModel";

vi.mock("../about/AboutEditorTab", () => ({
  AboutEditorTab: () => <div data-testid="about-editor">About editor</div>,
}));

vi.mock("@/components/pages/PublicMarkdownBody", () => ({
  PublicMarkdownBody: ({ content }: { content: string }) => <div data-testid="preview">{content}</div>,
}));

import { WritingTab } from "./WritingTab";

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
  return within(screen.getByRole("group", { name: "Entries" }))
    .getAllByRole("button")
    .map((item) => item.querySelector("span > span")?.textContent ?? "");
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
    expect(railTitles()).toEqual(["About", "Archive page", "Field notes"]);
    expect(kindFilter().getByRole("button", { name: "Article" })).toHaveAttribute("aria-pressed", "true");
    expect(replaceState).not.toHaveBeenCalled();

    await user.click(kindFilter().getByRole("button", { name: "Blog" }));

    expect(railTitles()).toEqual(["About", "Launch post"]);
    expect(screen.getByTestId("about-editor")).toBeInTheDocument();
    expect(replaceState).toHaveBeenLastCalledWith(null, "", "/dev/writing/about?kind=blog");

    await user.click(kindFilter().getByRole("button", { name: "Article" }));

    expect(railTitles()).toEqual(["About", "Archive page", "Field notes"]);
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

    await user.click(screen.getByRole("button", { name: "New" }));
    expect(replaceState).toHaveBeenLastCalledWith(null, "", "/dev/writing");

    await user.click(screen.getByRole("button", { name: /About/ }));
    expect(replaceState).toHaveBeenLastCalledWith(null, "", "/dev/writing/about");
  });

  it("asks before a rail row, About or the kind filter drops an unsaved draft", async () => {
    const user = userEvent.setup();
    renderTab();
    await screen.findByText("Field notes");

    await user.click(screen.getByRole("button", { name: /Field notes/ }));
    await waitFor(() => expect(screen.getByLabelText("Title")).toHaveValue("Field notes"));
    const rail = within(screen.getByRole("group", { name: "Entries" }));
    expect(rail.queryByText("Unsaved")).not.toBeInTheDocument();

    await user.type(screen.getByLabelText("Title"), " extra");
    expect(rail.getByText("Unsaved")).toBeInTheDocument();

    // Keep editing: nothing moves.
    await user.click(screen.getByRole("button", { name: /Archive page/ }));
    const dialog = await screen.findByRole("dialog", { name: "Discard changes to Field notes extra?" });
    await user.click(within(dialog).getByRole("button", { name: "Keep editing" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Title")).toHaveValue("Field notes extra");

    // The kind filter would drop the row too, so it asks as well.
    await user.click(kindFilter().getByRole("button", { name: "Blog" }));
    await screen.findByRole("dialog", { name: "Discard changes to Field notes extra?" });
    await user.click(screen.getByRole("button", { name: "Keep editing" }));
    expect(kindFilter().getByRole("button", { name: "Article" })).toHaveAttribute("aria-pressed", "true");

    // Discard: the other row opens and the pill goes.
    await user.click(screen.getByRole("button", { name: /About/ }));
    await screen.findByRole("dialog");
    await user.click(screen.getByRole("button", { name: "Discard changes" }));
    expect(await screen.findByTestId("about-editor")).toBeInTheDocument();
    expect(rail.queryByText("Unsaved")).not.toBeInTheDocument();
  });

  it("opens on the kind the route names without rewriting the URL", async () => {
    const replaceState = vi.spyOn(window.history, "replaceState");
    renderTab({ initialKind: "blog" });

    await screen.findByText("Launch post");
    expect(railTitles()).toEqual(["About", "Launch post"]);
    expect(kindFilter().getByRole("button", { name: "Blog" })).toHaveAttribute("aria-pressed", "true");
    expect(replaceState).not.toHaveBeenCalled();
  });

  it("follows a deep-linked row to its own kind and records that in the URL", async () => {
    const replaceState = vi.spyOn(window.history, "replaceState");
    renderTab({ initialSlug: "launch-post" });

    await waitFor(() => expect(screen.getByLabelText("Title")).toHaveValue("Launch post"));
    // The kind flip and the URL write land in an effect after the row renders.
    await waitFor(() => {
      expect(kindFilter().getByRole("button", { name: "Blog" })).toHaveAttribute("aria-pressed", "true");
      expect(replaceState).toHaveBeenLastCalledWith(null, "", "/dev/writing/launch-post?kind=blog");
    });
  });

  it("shows the cover image field only for blog posts", async () => {
    const user = userEvent.setup();
    renderTab();
    await screen.findByText("Field notes");

    await user.click(screen.getByRole("button", { name: "New" }));
    expect(screen.getByLabelText("Title")).toBeInTheDocument();
    expect(screen.queryByLabelText("Cover image URL")).not.toBeInTheDocument();

    await user.click(kindFilter().getByRole("button", { name: "Blog" }));
    expect(screen.getByLabelText("Cover image URL")).toBeInTheDocument();
  });

  it("allows local VCode editing and blocks review of malformed markup", async () => {
    const user = userEvent.setup();
    renderTab({ initialSlug: "archive-page" });
    await waitFor(() => expect(screen.getByLabelText("Title")).toHaveValue("Archive page"));
    await user.clear(screen.getByLabelText("Body"));
    await user.paste("[p]Unclosed");
    expect(screen.getByRole("button", { name: "Review changes" })).toBeDisabled();
    await user.paste("[/p]");
    expect(screen.getByRole("button", { name: "Review changes" })).toBeEnabled();
    expect(screen.queryByRole("button", { name: "Confirm publication" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Review changes" }));
    expect(screen.getByRole("button", { name: "Confirm publication" })).toBeEnabled();
  });

  it("keeps the save inert for an editor with the admin reason, while the draft stays editable", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.mocked(fetch);
    renderTab({ canApprove: false });
    await screen.findByText("Field notes");

    await user.click(screen.getByRole("button", { name: "New" }));
    await user.type(screen.getByLabelText("Title"), "Fresh");

    // The same draft an admin could save: title present, not read-only.
    expect(screen.getByLabelText("Title")).toHaveValue("Fresh");
    const save = screen.getByRole("button", { name: "Review changes" });
    expect(save).toBeDisabled();
    expect(publicationState().getByRole("button", { name: "Published" })).toBeDisabled();
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === "POST")).toBe(false);
  });
});
