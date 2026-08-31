import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createEmptyArticle } from "@/data/schema/defaults.generated";
import type { SubstanceArticle } from "@/schema";
import { ReviewCitationPanel } from "./ReviewCitationPanel";

function makeReference(id: string, title: string) {
  return {
    id,
    type: "webpage" as const,
    title,
    authors: [],
    url: `https://example.test/${id}`,
    sourceType: "unknown" as const,
    quality: "fallback" as const,
  };
}

/**
 * Summary carries one resolvable marker (`cited`), one dangling marker
 * (`ghost`); `orphan` is a structured reference no marker cites.
 */
function makeArticle(): SubstanceArticle {
  return {
    ...createEmptyArticle(),
    summary: "A supported claim. [cite:cited] A broken one. [cite:ghost]",
    references: [
      makeReference("cited", "Cited source"),
      makeReference("orphan", "Uncited source"),
    ],
  } as SubstanceArticle;
}

function CitationPanelHarness({
  article,
  onClose,
  onReferenceRemoved,
}: {
  article: SubstanceArticle;
  onClose: () => void;
  onReferenceRemoved?: (referenceId: string) => void;
}) {
  const [articleForView, setArticleForView] = useState(article);

  return (
    <ReviewCitationPanel
      article={articleForView}
      name="Testium"
      id="review-citation-panel"
      slug="testium"
      onClose={onClose}
      onReferenceSaved={(reference) => {
        setArticleForView((previous) => ({
          ...previous,
          references: [
            ...(previous.references ?? []).filter((saved) => saved.id !== reference.id),
            reference,
          ],
        }));
      }}
      onReferenceRemoved={(referenceId) => {
        onReferenceRemoved?.(referenceId);
        // Mirrors the workbench overlay: the deleted source stops being listed.
        setArticleForView((previous) => ({
          ...previous,
          references: (previous.references ?? []).filter(
            (saved) => saved.id !== referenceId,
          ),
        }));
      }}
    />
  );
}

function renderPanel(
  onClose = vi.fn(),
  article = makeArticle(),
  onReferenceRemoved?: (referenceId: string) => void,
) {
  render(
    <CitationPanelHarness
      article={article}
      onClose={onClose}
      onReferenceRemoved={onReferenceRemoved}
    />,
  );
  return onClose;
}

/** A Crossref hit, then whatever the article-reference route is told to say. */
function stubNetwork(saveResponse: {
  status?: number;
  body: Record<string, unknown>;
}) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
    const url = String(input);
    if (url.startsWith("https://api.crossref.org/")) {
      return {
        ok: true,
        json: async () => ({
          message: {
            title: ["Resolved study title"],
            author: [{ given: "Ada", family: "Lovelace" }],
            issued: { "date-parts": [[1843]] },
            URL: "https://doi.org/10.1000/example",
          },
        }),
      } as unknown as Response;
    }
    return {
      ok: (saveResponse.status ?? 200) < 400,
      status: saveResponse.status ?? 200,
      json: async () => saveResponse.body,
    } as unknown as Response;
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

/** Opens the add form and resolves a DOI through the stubbed lookup. */
async function pasteDoi(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "Add a source" }));
  await user.type(
    screen.getByLabelText("DOI, PubMed ID, ISBN, URL, or title"),
    "10.1000/example",
  );
  // Blur is what triggers the lookup, exactly as a reviewer tabbing away does.
  await user.tab();
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("ReviewCitationPanel", () => {
  it("lists cited, uncited, and dangling entries in their own groups", () => {
    renderPanel();

    // The cited reference carries its public number.
    expect(screen.getByText("1")).toBeInTheDocument();
    expect(screen.getByText(/Cited source/)).toBeInTheDocument();

    // The orphan is flagged as publicly invisible, not silently mixed in.
    expect(screen.getByText("uncited")).toBeInTheDocument();
    expect(screen.getByText(/Uncited source/)).toBeInTheDocument();

    // The dangling marker is shown as its raw token.
    expect(screen.getByText("dangling")).toBeInTheDocument();
    expect(screen.getByText("[cite:ghost]")).toBeInTheDocument();
  });

  it("copies the exact marker token for a reference", async () => {
    // user-event installs its own clipboard stub; read it back rather than
    // fighting it with a mock.
    const user = userEvent.setup();
    renderPanel();

    await user.click(
      screen.getByRole("button", { name: "Copy the citation marker for orphan" }),
    );

    expect(await navigator.clipboard.readText()).toBe("[cite:orphan]");
    expect(await screen.findByText("Copied")).toBeInTheDocument();
  });

  it("closes through the header button", async () => {
    const user = userEvent.setup();
    const onClose = renderPanel();

    await user.click(
      screen.getByRole("button", { name: "Close the citation panel" }),
    );
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("explains itself when the article has no references or markers", () => {
    render(
      <ReviewCitationPanel
        article={{ ...createEmptyArticle(), summary: "Plain." } as SubstanceArticle}
        name="Testium"
        id="review-citation-panel"
        slug="testium"
        onClose={vi.fn()}
        onReferenceSaved={vi.fn()}
        onReferenceRemoved={vi.fn()}
      />,
    );
    expect(
      screen.getByText(/no structured references yet/i),
    ).toBeInTheDocument();
  });

  it("hides the add form when no slug identifies the article to write to", () => {
    // Without a slug there is nothing to address the write to, so the
    // affordance must not appear at all rather than fail on save.
    render(
      <ReviewCitationPanel
        article={{ ...createEmptyArticle(), summary: "Plain." } as SubstanceArticle}
        name="Testium"
        id="review-citation-panel"
        onClose={vi.fn()}
        onReferenceSaved={vi.fn()}
        onReferenceRemoved={vi.fn()}
      />,
    );
    expect(screen.queryByRole("button", { name: "Add a source" })).toBeNull();
  });

  it("resolves a pasted DOI, previews it, and saves it as an uncited source", async () => {
    const user = userEvent.setup();
    const fetchMock = stubNetwork({
      body: {
        ok: true,
        created: true,
        reference: {
          id: "doi-10-1000-example",
          type: "journal_article",
          title: "Resolved study title",
          authors: ["Ada Lovelace"],
          year: 1843,
          url: "https://doi.org/10.1000/example",
          sourceType: "primary_literature",
          quality: "fallback",
          supportStatus: "needs_review",
        },
      },
    });
    renderPanel();

    await pasteDoi(user);

    // The lookup fills the title and the preview names the id and the policy.
    expect(await screen.findByDisplayValue("Resolved study title")).toBeInTheDocument();
    expect(screen.getByText("doi-10-1000-example")).toBeInTheDocument();
    expect(screen.getByText("needs review")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Save source" }));

    const savePost = fetchMock.mock.calls.find(
      ([url]) => String(url) === "/api/dev/article-reference",
    );
    expect(savePost).toBeDefined();
    expect(JSON.parse(String((savePost?.[1] as RequestInit).body))).toEqual({
      slug: "testium",
      source: "10.1000/example",
      title: "Resolved study title",
      authors: ["Ada Lovelace"],
      year: "1843",
      url: "https://doi.org/10.1000/example",
    });

    // The panel's `article` prop cannot refresh, so the saved source has to
    // show up here — uncited, with the marker the reviewer now needs.
    expect(
      await screen.findByText(/Added doi-10-1000-example/),
    ).toBeInTheDocument();
    const uncited = screen.getByText(/Resolved study title/).closest("li");
    expect(uncited).not.toBeNull();
    expect(
      within(uncited as HTMLElement).getByRole("button", {
        name: "Copy the citation marker for doi-10-1000-example",
      }),
    ).toBeInTheDocument();
  });

  it("recognizes an existing canonical URL instead of offering to save an alias", async () => {
    const user = userEvent.setup();
    const article = makeArticle();
    article.references = [
      ...article.references,
      {
        ...makeReference("canonical-source", "Canonical source"),
        url: "https://example.test/source/",
      },
    ];
    renderPanel(vi.fn(), article);

    await user.click(screen.getByRole("button", { name: "Add a source" }));
    await user.type(
      screen.getByLabelText("DOI, PubMed ID, ISBN, URL, or title"),
      "https://example.test/source",
    );
    await user.type(screen.getByLabelText("Title"), "Duplicate source");

    expect(
      await screen.findByText("This article already lists that source as canonical-source."),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save source" })).toBeDisabled();
  });

  it("offers the existing source's marker beside the duplicate notice", async () => {
    // The reviewer pasted a source that is already here. Naming its id is not
    // enough — they came for the marker, and the copy has to be within reach
    // instead of somewhere down the list they now have to search.
    const user = userEvent.setup();
    const article = makeArticle();
    article.references = [
      ...article.references,
      {
        ...makeReference("canonical-source", "Canonical source"),
        url: "https://example.test/source/",
      },
    ];
    renderPanel(vi.fn(), article);

    await user.click(screen.getByRole("button", { name: "Add a source" }));
    await user.type(
      screen.getByLabelText("DOI, PubMed ID, ISBN, URL, or title"),
      "https://example.test/source",
    );
    await user.type(screen.getByLabelText("Title"), "Duplicate source");

    // Scoped to the notice: the same reference is listed below with its own
    // copy button, and that one is exactly what this affordance saves a trip to.
    const notice = await screen.findByText(
      "This article already lists that source as canonical-source.",
    );
    const noticeRow = notice.parentElement as HTMLElement;
    await user.click(
      within(noticeRow).getByRole("button", {
        name: "Copy the citation marker for canonical-source",
      }),
    );

    expect(await navigator.clipboard.readText()).toBe("[cite:canonical-source]");
  });

  it("keeps a save failure on screen instead of losing it to a toast", async () => {
    const user = userEvent.setup();
    stubNetwork({ status: 409, body: { error: "That source could not be stored." } });
    renderPanel();

    await pasteDoi(user);
    await user.click(await screen.findByRole("button", { name: "Save source" }));

    expect(
      await screen.findByText("That source could not be stored."),
    ).toBeInTheDocument();
    // Nothing was added, so the palette must not pretend otherwise.
    expect(screen.queryByText(/^Added /)).toBeNull();
  });

  it("offers a remove button on numbered and uncited rows", () => {
    renderPanel();

    expect(screen.getByRole("button", { name: "Remove cited" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Remove orphan" })).toBeInTheDocument();
  });

  it("does nothing when the remove confirm is declined", async () => {
    const user = userEvent.setup();
    const fetchMock = stubNetwork({ body: { ok: true, removed: true } });
    const confirmMock = vi.fn(() => false);
    vi.stubGlobal("confirm", confirmMock);
    renderPanel();

    await user.click(screen.getByRole("button", { name: "Remove orphan" }));

    // An uncited source is safe to name as such — nothing else goes with it.
    expect(confirmMock).toHaveBeenCalledWith("Remove orphan? Nothing cites it.");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("deletes an accepted removal over HTTP and reconciles the overlay", async () => {
    const user = userEvent.setup();
    const fetchMock = stubNetwork({
      body: { ok: true, removed: true, markersStripped: 1, routeIdsStripped: 0 },
    });
    const confirmMock = vi.fn(() => true);
    vi.stubGlobal("confirm", confirmMock);
    const onReferenceRemoved = vi.fn();
    renderPanel(vi.fn(), makeArticle(), onReferenceRemoved);

    await user.click(screen.getByRole("button", { name: "Remove cited" }));

    // The dialog counts what the delete takes with it, from the article on screen.
    expect(confirmMock).toHaveBeenCalledWith(
      "Remove cited? This also deletes 1 inline marker(s) and 0 route reference(s).",
    );

    const deleteCall = fetchMock.mock.calls.find(
      ([, init]) => (init as RequestInit | undefined)?.method === "DELETE",
    );
    expect(deleteCall).toBeDefined();
    expect(String(deleteCall?.[0])).toBe("/api/dev/article-reference");
    expect(JSON.parse(String((deleteCall?.[1] as RequestInit).body))).toEqual({
      slug: "testium",
      referenceId: "cited",
    });

    await waitFor(() => expect(onReferenceRemoved).toHaveBeenCalledWith("cited"));
    // The harness dropped it like the workbench overlay does, so the row goes.
    expect(screen.queryByText(/Cited source/)).toBeNull();
  });

  it("keeps a delete failure on screen and leaves the listing untouched", async () => {
    const user = userEvent.setup();
    stubNetwork({ status: 500, body: { error: "That source could not be deleted." } });
    vi.stubGlobal("confirm", vi.fn(() => true));
    const onReferenceRemoved = vi.fn();
    renderPanel(vi.fn(), makeArticle(), onReferenceRemoved);

    await user.click(screen.getByRole("button", { name: "Remove orphan" }));

    expect(
      await screen.findByText("That source could not be deleted."),
    ).toBeInTheDocument();
    expect(onReferenceRemoved).not.toHaveBeenCalled();
    expect(screen.getByText(/Uncited source/)).toBeInTheDocument();
  });
});
