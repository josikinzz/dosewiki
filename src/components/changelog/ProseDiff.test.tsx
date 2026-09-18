import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ProseDiff } from "./ProseDiff";

const marks = (container: HTMLElement, tag: "del" | "ins") =>
  Array.from(container.querySelectorAll(tag)).map((el) => el.textContent);
const passages = (container: HTMLElement) =>
  Array.from(container.querySelectorAll("p")).map((p) => p.textContent ?? "");

describe("ProseDiff", () => {
  it("shows Before and After, marking only each side's own change", () => {
    const { container } = render(
      <ProseDiff id="d" markdown={"@@ dosage.threshold @@\n- Threshold is 5 mg.\n+ Threshold is 4 mg."} />,
    );

    expect(screen.getByText("Before")).toBeInTheDocument();
    expect(screen.getByText("After")).toBeInTheDocument();
    expect(marks(container, "del")).toEqual(["removed: 5"]);
    expect(marks(container, "ins")).toEqual(["added: 4"]);
    // Whitespace stays outside the mark so speech does not run words together.
    expect(container.querySelector("del")?.previousSibling?.textContent).toBe("Threshold is ");
    // A single field needs no label: the row above already names it.
    expect(screen.queryByText("dosage › threshold")).not.toBeInTheDocument();
  });

  it("renders citation tokens as the article does instead of raw markup", () => {
    const { container } = render(
      <ProseDiff
        id="d"
        markdown={"- Claim.[citation-needed]\n+ Claim.[cite:doi-1][cite:gone]"}
        citations={{ numbers: { "doi-1": 3 }, hrefBase: "" }}
      />,
    );

    expect(container.textContent).not.toContain("[cite:");
    expect(container.textContent).not.toContain("[citation-needed]");
    expect(screen.getByText("citation needed")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Citation 3" })).toHaveAttribute("href", "#ref-doi-1");
    expect(screen.getByRole("link", { name: "Source no longer cited" })).toHaveAttribute("href", "#sources");
  });

  it("elides the same unchanged stretches on both sides, even for a pure insertion", () => {
    const filler = Array.from({ length: 30 }, (_, i) => `w${i}`).join(" ");
    const { container } = render(
      <ProseDiff id="d" markdown={`- ${filler} tail ${filler}\n+ ${filler} tail new ${filler}`} />,
    );

    const [before, after] = passages(container);
    expect(before).toBe("… w23 w24 w25 w26 w27 w28 w29 tail w0 w1 w2 w3 w4 w5 w6 w7 …");
    expect(after).toBe("… w23 w24 w25 w26 w27 w28 w29 tail added: new w0 w1 w2 w3 w4 w5 w6 w7 …");
    expect(before).not.toBe("…");
  });

  it("keeps a short passage whole", () => {
    const { container } = render(<ProseDiff id="d" markdown={"- The dose is 5 mg.\n+ The dose is 4 mg."} />);

    expect(container.textContent).not.toContain("…");
  });

  it("labels each field when one save touched several", () => {
    render(<ProseDiff id="d" markdown={"@@ summary @@\n- a\n+ b\n@@ dosage.threshold @@\n- c\n+ d"} />);

    expect(screen.getByText("summary")).toBeInTheDocument();
    expect(screen.getByText("dosage › threshold")).toBeInTheDocument();
  });

  it("renders unpaired lines as whole additions or removals", () => {
    const { container } = render(
      <ProseDiff id="d" markdown={"@@ references @@\n+ A new source\n- An old source\n- Another old one"} />,
    );

    expect(screen.getByText("Added")).toBeInTheDocument();
    expect(marks(container, "ins")).toEqual(["added: A new source"]);
    expect(marks(container, "del")).toEqual(["removed: An old source", "removed: Another old one"]);
  });
});
