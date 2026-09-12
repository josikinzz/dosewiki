import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { createEmptyArticle } from "@/data/schema/defaults.generated";
import { FieldMarkerProvider } from "@/features/article/editing/ArticleEditContext";
import { parseCitationMarkers } from "@/lib/citations/citationTokens";
import type { SubstanceArticle } from "@/schema";
import { ArticleText, CitedText, CitationMarker } from "./CitedText";

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

function makeArticle(summary: string, referenceIds: string[]) {
  return {
    ...createEmptyArticle(),
    summary,
    references: referenceIds.map((id) => makeReference(id, id)),
  } as SubstanceArticle;
}

function renderWithMarkers(text: string, article: SubstanceArticle) {
  const citeAtMarker = vi.fn();
  const removeMarker = vi.fn();
  const markers = parseCitationMarkers(text);
  const result = render(
    <FieldMarkerProvider value={{ markers, citeAtMarker, removeMarker }}>
      <CitedText text={text} article={article} />
    </FieldMarkerProvider>,
  );
  return { ...result, citeAtMarker, markers, removeMarker };
}

describe("CitedText", () => {
  it("renders adjacent citation markers as separate superscript links", () => {
    const text = "Supported claim. [cite:first][cite:second] Next sentence.";
    const article = makeArticle(text, ["first", "second"]);
    const { container } = render(<CitedText text={text} article={article} />);

    expect(container).toHaveTextContent("Supported claim.12 Next sentence.");
    expect(container.textContent).not.toContain("[cite:");
    expect(screen.getByRole("link", { name: "Citation 1" })).toHaveAttribute(
      "href",
      "#ref-first",
    );
    expect(screen.getByRole("link", { name: "Citation 2" })).toHaveAttribute(
      "href",
      "#ref-second",
    );
    expect(screen.queryByRole("link", { name: "1, 2" })).not.toBeInTheDocument();
  });

  it("uses line-box-safe citation marker layout for clamped article text", () => {
    const text = "Supported claim [cite:first].";
    const article = makeArticle(text, ["first"]);
    const { container } = render(<CitedText text={text} article={article} />);

    const marker = screen.getByRole("link", { name: "Citation 1" });
    expect(marker).toHaveClass("inline-flex", "leading-[1.05]", "rounded-[0.12rem]");
    expect(container.querySelector("sup")).toHaveClass(
      "inline-flex",
      "gap-[0.32em]",
      "align-baseline",
      "-top-[0.42em]",
      "text-[0.62em]",
    );
  });

  it("drops unresolvable markers entirely instead of rendering a public ?", () => {
    // Review surfaces (citation panel, editor diagnostics) own broken markers;
    // the public page renders neither a "?" link nor the raw token.
    const text = "Unsupported public marker [cite:missing]. Next sentence.";
    const article = makeArticle(text, []);
    const { container } = render(<ArticleText article={article} text={text} />);

    expect(container).toHaveTextContent(
      "Unsupported public marker. Next sentence.",
    );
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(screen.queryByText(/\[cite:/)).not.toBeInTheDocument();
    expect(container.querySelector("sup")).not.toBeInTheDocument();
  });

  it("keeps resolved markers while dropping unresolvable neighbours", () => {
    const text = "Mixed claim [cite:missing][cite:first].";
    const article = makeArticle(text, ["first"]);
    render(<CitedText text={text} article={article} />);

    expect(screen.getByRole("link", { name: "Citation 1" })).toHaveAttribute(
      "href",
      "#ref-first",
    );
    expect(screen.getAllByRole("link")).toHaveLength(1);
  });

  it("renders nothing for a citation marker group with no resolvable ids", () => {
    const article = makeArticle("Plain text.", []);
    const { container } = render(
      <CitationMarker article={article} referenceIds={["missing"]} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("links explicit citation marker groups to the first resolved reference", () => {
    const article = makeArticle(
      "First [cite:first]. Second [cite:second].",
      ["first", "second"],
    );

    render(<CitationMarker article={article} referenceIds={["second", "first"]} />);

    const secondMarker = screen.getByRole("link", { name: "Citation 2" });
    const firstMarker = screen.getByRole("link", { name: "Citation 1" });
    expect(secondMarker).toHaveAttribute("href", "#ref-second");
    expect(firstMarker).toHaveAttribute("href", "#ref-first");
    expect(secondMarker).toHaveClass("theme-citation-marker");
  });
});

describe("CitedText citation editing controls", () => {
  it("removes the second of two citations by its raw-text ordinal", async () => {
    const user = userEvent.setup();
    const text = "First [cite:first]. Second [cite:second].";
    const article = makeArticle(text, ["first", "second"]);
    const { markers, removeMarker } = renderWithMarkers(text, article);

    const secondCitation = screen.getByRole("button", { name: "Citation 2" });
    expect(secondCitation).toHaveAttribute("data-citation-control");
    await user.click(secondCitation);
    expect(screen.getByRole("menuitem", { name: "Open reference" })).toHaveAttribute(
      "href",
      "#ref-second",
    );
    await user.click(screen.getByRole("menuitem", { name: "Remove this citation" }));

    expect(removeMarker).toHaveBeenCalledOnce();
    expect(removeMarker).toHaveBeenCalledWith(markers[1]);
  });
});

describe("CitedText citation-needed marker", () => {
  it("renders the [citation-needed] token as a free-floating marker, not text or a link", () => {
    const text = "Unsupported claim [citation-needed]. Next sentence.";
    const article = makeArticle(text, []);
    const { container } = render(<CitedText text={text} article={article} />);

    const marker = screen.getByText("citation needed");
    expect(marker).toHaveClass("theme-citation-needed-marker");
    expect(container.textContent).not.toContain("[citation-needed]");
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(container.querySelector("sup")).not.toBeInTheDocument();
  });

  it("renders marker and reference link when prose separates the tokens", () => {
    const text = "Mixed claim [cite:first] with a gap [citation-needed].";
    const article = makeArticle(text, ["first"]);
    const { container } = render(<CitedText text={text} article={article} />);

    expect(screen.getByRole("link", { name: "Citation 1" })).toHaveAttribute(
      "href",
      "#ref-first",
    );
    expect(screen.getByText("citation needed")).toBeInTheDocument();
    expect(container.textContent).not.toContain("[cite:");
    expect(container.textContent).not.toContain("[citation-needed]");
  });

  it("suppresses the marker when the claim already carries a resolved citation", () => {
    const text = "Adjacent [cite:first][citation-needed][cite:second].";
    const article = makeArticle(text, ["first", "second"]);
    const { container } = render(<CitedText text={text} article={article} />);

    expect(screen.getAllByRole("link")).toHaveLength(2);
    expect(screen.queryByText("citation needed")).not.toBeInTheDocument();
    expect(container.textContent).not.toContain("[");
  });

  it("suppresses a whitespace-adjacent marker without leaving stray spaces", () => {
    const text = "Claim [cite:first] [citation-needed]. Next.";
    const article = makeArticle(text, ["first"]);
    const { container } = render(<CitedText text={text} article={article} />);

    expect(screen.queryByText("citation needed")).not.toBeInTheDocument();
    expect(container.textContent).toBe("Claim1. Next.");
  });

  it("collapses consecutive citation-needed flags into a single marker", () => {
    const text = "A [citation-needed]. B [citation-needed]. C [citation-needed].";
    const article = makeArticle(text, []);
    const { container } = render(<CitedText text={text} article={article} />);

    expect(screen.getAllByText("citation needed")).toHaveLength(1);
    expect(container.textContent).toBe("Acitation needed. B. C.");
  });

  it("lets the marker return once a resolved citation intervenes", () => {
    const text = "A [citation-needed]. B [cite:first]. C [citation-needed].";
    const article = makeArticle(text, ["first"]);
    render(<CitedText text={text} article={article} />);

    expect(screen.getAllByText("citation needed")).toHaveLength(2);
  });

  it("keeps the marker when the neighboring citation is unresolved", () => {
    const text = "Claim [cite:missing][citation-needed].";
    const article = makeArticle(text, []);
    render(<CitedText text={text} article={article} />);

    expect(screen.getByText("citation needed")).toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("leaves text without tokens untouched", () => {
    const text = "Plain prose with no markers. Second sentence.";
    const article = makeArticle(text, []);
    const { container } = render(<CitedText text={text} article={article} />);

    expect(container.textContent).toBe(text);
    expect(container.querySelector("span")).not.toBeInTheDocument();
    expect(container.querySelector("sup")).not.toBeInTheDocument();
  });
});

describe("CitedText citation-needed editing controls", () => {
  it("addresses a visible flag by scanned ordinal even when an earlier flag is suppressed", async () => {
    const user = userEvent.setup();
    const text =
      "Supported [cite:first][citation-needed]. Later unsupported [citation-needed].";
    const article = makeArticle(text, ["first"]);
    const { citeAtMarker, markers } = renderWithMarkers(text, article);

    const button = screen.getByRole("button", { name: "Add a citation here" });
    await user.click(button);

    expect(citeAtMarker).toHaveBeenCalledOnce();
    expect(citeAtMarker).toHaveBeenCalledWith(markers[2]);
    expect(markers[2]?.start).toBe(text.lastIndexOf("[citation-needed]"));
  });

  it("addresses a collapsed flag run by the first flag in that run", async () => {
    const user = userEvent.setup();
    const text = "A [citation-needed]. B [citation-needed].";
    const article = makeArticle(text, []);
    const { citeAtMarker, markers } = renderWithMarkers(text, article);

    const button = screen.getByRole("button", { name: "Add a citation here" });
    expect(button).toHaveAttribute("data-citation-control");
    await user.click(button);

    expect(citeAtMarker).toHaveBeenCalledWith(markers[0]);
  });

  it("leaves a synthesized flag non-interactive when no raw span resolves", () => {
    const text = "Synthesized [citation-needed].";
    const article = makeArticle(text, []);
    render(
      <FieldMarkerProvider
        value={{ markers: [], citeAtMarker: vi.fn(), removeMarker: vi.fn() }}
      >
        <CitedText text={text} article={article} />
      </FieldMarkerProvider>,
    );

    expect(screen.getByText("citation needed")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Add a citation here" }),
    ).not.toBeInTheDocument();
  });
});
