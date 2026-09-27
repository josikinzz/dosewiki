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

import { DraftRecoveryProvider } from "@/features/dev/recovery/DraftRecoveryContext";
import { clearDraftRecovery, DRAFT_RECOVERY_PREFIX } from "@/features/dev/recovery/draftRecovery";
import { WritingTab } from "./WritingTab";

const ENTRIES: WritingListEntry[] = [
  { slug: "launch-post", title: "Launch post", kind: "blog", status: "draft", creationTime: 3 },
];

const FIRST: WritingArticleRow = {
  slug: "launch-post",
  title: "Launch post",
  kind: "blog",
  status: "draft",
  bodyFormat: "markdown",
  body_raw: "Post.",
  baseRevision: "c".repeat(64),
};

let row: WritingArticleRow;
let postResponder: (body: Record<string, unknown>) => Promise<Response>;

function stubApi() {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "POST") return postResponder(JSON.parse(String(init.body)));
      const slug = new URL(String(input), "https://dose.wiki").searchParams.get("slug");
      if (slug) return Response.json({ ok: true, article: row });
      return Response.json({ ok: true, articles: ENTRIES });
    }),
  );
}

function renderAs(actor: string | null) {
  return render(
    <DraftRecoveryProvider actor={actor}>
      <WritingTab contributorProfiles={[]} profilesLoading={false} canApprove initialSlug="launch-post" />
    </DraftRecoveryProvider>,
  );
}

async function openRow() {
  await waitFor(() => expect(screen.getByLabelText("Title")).toHaveValue(row.title));
}

function recoveryKeys(): string[] {
  return Array.from({ length: window.localStorage.length }, (_, index) => window.localStorage.key(index) ?? "")
    .filter((key) => key.startsWith(DRAFT_RECOVERY_PREFIX));
}

describe("WritingTab draft recovery", () => {
  beforeEach(() => {
    window.localStorage.clear();
    row = { ...FIRST };
    postResponder = async () => Response.json({ ok: true, slug: "launch-post", revision: "d".repeat(64) });
    stubApi();
    window.history.replaceState(null, "", "/dev/writing/launch-post");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("keeps typed work across a reload and restores it on request", async () => {
    const user = userEvent.setup();
    const first = renderAs("editor@example.com");
    await openRow();
    await user.type(screen.getByLabelText("Title"), " two");
    expect(await screen.findByText(/Unsaved changes kept in this browser at/)).toBeInTheDocument();
    first.unmount();

    renderAs("editor@example.com");
    const offer = await screen.findByRole("region", { name: "Recovered changes" });
    expect(within(offer).getByText(/from this browser, saved at/)).toBeInTheDocument();
    // Nothing is replaced until the editor chooses.
    expect(screen.getByLabelText("Title")).toHaveValue("Launch post");

    await user.click(within(offer).getByRole("button", { name: "Restore" }));
    expect(screen.getByLabelText("Title")).toHaveValue("Launch post two");
    expect(screen.queryByRole("region", { name: "Recovered changes" })).not.toBeInTheDocument();
  });

  it("forgets the copy when the editor discards it", async () => {
    const user = userEvent.setup();
    const first = renderAs("editor@example.com");
    await openRow();
    await user.type(screen.getByLabelText("Title"), " two");
    await screen.findByText(/Unsaved changes kept in this browser at/);
    first.unmount();

    const second = renderAs("editor@example.com");
    const offer = await screen.findByRole("region", { name: "Recovered changes" });
    await user.click(within(offer).getByRole("button", { name: "Discard" }));
    expect(screen.getByLabelText("Title")).toHaveValue("Launch post");
    second.unmount();

    renderAs("editor@example.com");
    await openRow();
    expect(screen.queryByRole("region", { name: "Recovered changes" })).not.toBeInTheDocument();
  });

  it("never offers one account's recovery copy to another", async () => {
    const user = userEvent.setup();
    const first = renderAs("first@example.com");
    await openRow();
    await user.type(screen.getByLabelText("Title"), " private");
    await screen.findByText(/Unsaved changes kept in this browser at/);
    first.unmount();
    expect(recoveryKeys()).toHaveLength(1);
    // The key names a hash of the account, never the address itself.
    expect(recoveryKeys()[0]).not.toContain("first@example.com");

    renderAs("second@example.com");
    await openRow();
    expect(screen.queryByRole("region", { name: "Recovered changes" })).not.toBeInTheDocument();
    // The previous account's copy is gone from this browser, not just hidden.
    await waitFor(() => expect(recoveryKeys()).toHaveLength(0));
  });

  it("clears every copy on sign-out", async () => {
    const user = userEvent.setup();
    const first = renderAs("editor@example.com");
    await openRow();
    await user.type(screen.getByLabelText("Title"), " two");
    await screen.findByText(/Unsaved changes kept in this browser at/);
    first.unmount();

    clearDraftRecovery();

    renderAs("editor@example.com");
    await openRow();
    expect(screen.queryByRole("region", { name: "Recovered changes" })).not.toBeInTheDocument();
  });

  it("shows a copy made against an older version as a conflict and overwrites nothing", async () => {
    const user = userEvent.setup();
    const first = renderAs("editor@example.com");
    await openRow();
    await user.type(screen.getByLabelText("Title"), " mine");
    await screen.findByText(/Unsaved changes kept in this browser at/);
    first.unmount();

    // Someone else saved meanwhile.
    row = { ...FIRST, title: "Launch post theirs", baseRevision: "e".repeat(64) };
    renderAs("editor@example.com");
    const offer = await screen.findByRole("region", { name: "Recovered changes" });
    expect(within(offer).getByText(/The saved version changed after this copy was made/)).toBeInTheDocument();

    await user.click(within(offer).getByRole("button", { name: "Review" }));
    // The newer saved version stays in the editor; both are shown.
    expect(screen.getByLabelText("Title")).toHaveValue("Launch post theirs");
    const review = screen.getByRole("region", { name: "Review recovered changes" });
    expect(within(review).getByText("Launch post theirs")).toBeInTheDocument();
    expect(within(review).getByText("Launch post mine")).toBeInTheDocument();

    // Both changed the title, so the review cannot end without a choice.
    expect(within(review).getByText("You changed")).toBeInTheDocument();
    expect(within(review).getByText("Someone else changed")).toBeInTheDocument();
    expect(within(review).getByRole("button", { name: "Done reviewing" })).toBeDisabled();
    await user.click(within(review).getByRole("button", { name: "Use recovered Title" }));
    await user.click(within(review).getByRole("button", { name: "Done reviewing" }));
    expect(screen.getByLabelText("Title")).toHaveValue("Launch post mine");
    expect(screen.queryByRole("region", { name: "Review recovered changes" })).not.toBeInTheDocument();
  });

  it("keeps a recovered edit and a newer saved edit to different fields without asking", async () => {
    const user = userEvent.setup();
    const first = renderAs("editor@example.com");
    await openRow();
    await user.type(screen.getByLabelText("Body"), " Mine.");
    await screen.findByText(/Unsaved changes kept in this browser at/);
    first.unmount();

    row = { ...FIRST, title: "Launch post, retitled", baseRevision: "e".repeat(64) };
    renderAs("editor@example.com");
    await user.click(within(await screen.findByRole("region", { name: "Recovered changes" })).getByRole("button", { name: "Review" }));

    const review = screen.getByRole("region", { name: "Review recovered changes" });
    expect(within(review).queryByRole("region", { name: "Changed by both" })).not.toBeInTheDocument();
    expect(within(review).getByText("Body")).toBeInTheDocument();
    expect(within(review).getByText("Title")).toBeInTheDocument();
    expect(screen.getByLabelText("Title")).toHaveValue("Launch post, retitled");
    expect(screen.getByLabelText("Body")).toHaveValue("Post. Mine.");
    await user.click(within(review).getByRole("button", { name: "Done reviewing" }));
    expect(screen.queryByRole("region", { name: "Review recovered changes" })).not.toBeInTheDocument();
  });

  it("reconciles a save whose answer was lost by replaying it, never submitting a new one", async () => {
    const user = userEvent.setup();
    postResponder = async () => {
      throw new TypeError("Failed to fetch");
    };
    const first = renderAs("editor@example.com");
    await openRow();
    await user.type(screen.getByLabelText("Body"), " More.");
    await user.click(screen.getByRole("button", { name: "Save draft" }));
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Save draft" }));
    await screen.findByText(/Publication has not been confirmed/);
    first.unmount();

    // The write landed after all: the server recorded it under that operation.
    row = { ...FIRST, body_raw: "Post. More.", baseRevision: "d".repeat(64) };
    postResponder = async () => Response.json({ ok: true, slug: "launch-post", revision: "d".repeat(64) });
    renderAs("editor@example.com");
    const offer = await screen.findByRole("region", { name: "Recovered changes" });
    expect(within(offer).getByText(/A save was sent but never confirmed/)).toBeInTheDocument();
    await user.click(within(offer).getByRole("button", { name: "Restore" }));

    // Nothing else can be written until the first operation is reconciled.
    expect(screen.getByRole("button", { name: "Save draft" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Retry publication confirmation" }));
    await screen.findByText(/Saved as a draft/);

    const posts = vi.mocked(fetch).mock.calls
      .filter(([, init]) => init?.method === "POST")
      .map(([, init]) => JSON.parse(String(init?.body)) as Record<string, unknown>);
    expect(posts).toHaveLength(2);
    expect(posts[1]).toEqual(posts[0]);
    expect(posts[1].expectedRevision).toBe("c".repeat(64));
  });
});

describe("WritingTab loading a newer saved version under open edits", () => {
  beforeEach(() => {
    window.localStorage.clear();
    row = { ...FIRST };
    postResponder = async () => Response.json({ ok: true, slug: "launch-post", revision: "d".repeat(64) });
    stubApi();
    window.history.replaceState(null, "", "/dev/writing/launch-post");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  const posts = () => vi.mocked(fetch).mock.calls
    .filter(([, init]) => init?.method === "POST")
    .map(([, init]) => JSON.parse(String(init?.body)) as Record<string, unknown>);

  it("merges someone else's saved change into the open edits and saves against the newer revision", async () => {
    const user = userEvent.setup();
    renderAs("editor@example.com");
    await openRow();
    await user.type(screen.getByLabelText("Title"), " two");

    row = { ...FIRST, body_raw: "Post, edited by someone else.", baseRevision: "e".repeat(64) };
    await user.click(screen.getByRole("button", { name: "Load the latest saved version" }));
    const review = await screen.findByRole("region", { name: "Review changes saved meanwhile" });
    expect(within(review).queryByRole("region", { name: "Changed by both" })).not.toBeInTheDocument();
    expect(screen.getByLabelText("Title")).toHaveValue("Launch post two");
    expect(screen.getByLabelText("Body")).toHaveValue("Post, edited by someone else.");
    await user.click(within(review).getByRole("button", { name: "Done reviewing" }));

    // A further change lands after the merge: the revision check refuses it.
    postResponder = async () => Response.json({ error: "Someone saved this article after you loaded it." }, { status: 409 });
    await user.click(screen.getByRole("button", { name: "Save draft" }));
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Save draft" }));
    expect(await screen.findByText("Someone saved this article after you loaded it.")).toBeInTheDocument();
    expect(posts()[0]).toMatchObject({ title: "Launch post two", body: "Post, edited by someone else.", expectedRevision: "e".repeat(64) });
    expect(screen.queryByText(/Saved as a draft/)).not.toBeInTheDocument();
    expect(screen.getByLabelText("Title")).toHaveValue("Launch post two");
  });

  it("shows both versions of a field both changed and holds the review until one is chosen", async () => {
    const user = userEvent.setup();
    renderAs("editor@example.com");
    await openRow();
    await user.type(screen.getByLabelText("Title"), " mine");

    row = { ...FIRST, title: "Launch post theirs", baseRevision: "e".repeat(64) };
    await user.click(screen.getByRole("button", { name: "Load the latest saved version" }));
    const review = await screen.findByRole("region", { name: "Review changes saved meanwhile" });
    const both = within(review).getByRole("group", { name: "Title, changed by both" });
    expect(within(both).getByText("Launch post mine")).toBeInTheDocument();
    expect(within(both).getByText("Launch post theirs")).toBeInTheDocument();
    expect(within(review).getByRole("button", { name: "Done reviewing" })).toBeDisabled();
    expect(screen.getByLabelText("Title")).toHaveValue("Launch post theirs");

    await user.click(within(both).getByRole("button", { name: "Use yours Title" }));
    expect(screen.getByLabelText("Title")).toHaveValue("Launch post mine");
    await user.click(within(review).getByRole("button", { name: "Done reviewing" }));
    expect(screen.queryByRole("region", { name: "Review changes saved meanwhile" })).not.toBeInTheDocument();
  });
});
