import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { SubstanceArticle } from "@/schema";
import { ReviewStatusBanner } from "./ReviewStatusBanner";

const baseArticle = {
  title: "2C-B",
  summary: "",
} as SubstanceArticle;

describe("ReviewStatusBanner", () => {
  it("renders the pending-review chip with Lyrea linked to her profile", () => {
    render(
      <ReviewStatusBanner article={baseArticle} profileHref="/contributors/lyrea" />,
    );

    expect(screen.getByRole("status")).toBeInTheDocument();
    expect(
      screen.getByText(/Not yet reviewed: this article is pending editorial review by/),
    ).toBeInTheDocument();
    expect(screen.getByText("Lyrea").closest("a")).toHaveAttribute(
      "href",
      "/contributors/lyrea",
    );
  });

  it("falls back to unlinked text when no profile href resolves", () => {
    render(<ReviewStatusBanner article={baseArticle} />);

    expect(screen.getByText("Lyrea")).toBeInTheDocument();
    expect(screen.getByText("Lyrea").closest("a")).toBeNull();
  });

  it("renders an editor-supplied copy block with the reviewer substituted", () => {
    render(
      <ReviewStatusBanner
        article={baseArticle}
        profileHref="/contributors/lyrea"
        copy="Awaiting sign-off from {{reviewer}} — details may change."
      />,
    );

    expect(screen.getByRole("status")).toHaveTextContent(
      "Awaiting sign-off from Lyrea — details may change.",
    );
    expect(screen.getByText("Lyrea").closest("a")).toHaveAttribute(
      "href",
      "/contributors/lyrea",
    );
  });

  it("renders copy without a reviewer token verbatim, with no name", () => {
    render(<ReviewStatusBanner article={baseArticle} copy="Review pending." />);

    expect(screen.getByRole("status")).toHaveTextContent("Review pending.");
    expect(screen.queryByText("Lyrea")).not.toBeInTheDocument();
  });

  it("renders nothing once the public expert_reviewed flag is set", () => {
    const reviewed = { ...baseArticle, expert_reviewed: true } as unknown as SubstanceArticle;
    const { container } = render(
      <ReviewStatusBanner article={reviewed} profileHref="/contributors/lyrea" />,
    );

    expect(container).toBeEmptyDOMElement();
  });

  it("also honors the editor editorial_review status in the generator preview", () => {
    const reviewed = {
      ...baseArticle,
      editorial_review: { status: "completed", notes: "" },
    } as SubstanceArticle;
    const { container } = render(<ReviewStatusBanner article={reviewed} />);

    expect(container).toBeEmptyDOMElement();
  });
});
