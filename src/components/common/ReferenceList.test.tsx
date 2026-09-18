import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ReferenceCitationList } from "./ReferenceList";
import type { ProjectedCitation } from "@/lib/citationProjection";

function makeCitations(count: number): ProjectedCitation[] {
  return Array.from({ length: count }, (_, index) => ({
    anchorId: `cite-${index + 1}`,
    number: index + 1,
    label: `Reference ${index + 1}`,
  })) as ProjectedCitation[];
}

describe("ReferenceCitationList", () => {
  afterEach(() => {
    window.location.hash = "";
  });

  it("shows only the first ten citations behind a +N control", () => {
    render(<ReferenceCitationList citations={makeCitations(14)} />);

    expect(screen.getAllByRole("listitem")).toHaveLength(10);
    const toggle = screen.getByRole("button", { name: "Show 4 more citations" });
    expect(toggle).toHaveTextContent("+4");

    fireEvent.click(toggle);
    expect(screen.getAllByRole("listitem")).toHaveLength(14);
    expect(screen.getByRole("button", { name: "Show only the first 10 citations" })).toBeInTheDocument();
  });

  it("renders no control when the list fits", () => {
    render(<ReferenceCitationList citations={makeCitations(10)} />);
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("expands and scrolls when a marker targets a collapsed entry", () => {
    const scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;

    render(
      <>
        <a href="#cite-12">12</a>
        <ReferenceCitationList citations={makeCitations(14)} />
      </>,
    );

    act(() => {
      window.location.hash = "#cite-12";
      fireEvent.click(screen.getByText("12"));
    });

    expect(screen.getAllByRole("listitem")).toHaveLength(14);
    expect(document.getElementById("cite-12")).not.toBeNull();
    expect(scrollIntoView).toHaveBeenCalled();
  });
});
