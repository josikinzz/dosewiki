import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  EditorActionGroup,
  EditorActionStatus,
  EditorField,
  EditorNotice,
  EditorSection,
  EditorToolbar,
} from "./index";

vi.mock("@/components/common/Icon", () => ({
  Icon: ({ icon }: { icon: string }) => <span data-icon={icon} />,
}));

describe("dev editor components", () => {
  it("wires field labels, descriptions, counters, and errors to the control", () => {
    render(
      <EditorField
        id="claim-text"
        label="Claim text"
        description="Use public article wording."
        counter="12/80"
        error="Claim text is required."
      >
        {(fieldProps) => <input {...fieldProps} />}
      </EditorField>,
    );

    const input = screen.getByLabelText("Claim text");
    const describedBy = input.getAttribute("aria-describedby") ?? "";

    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(describedBy).toContain("claim-text-description");
    expect(describedBy).toContain("claim-text-counter");
    expect(describedBy).toContain("claim-text-error");
    expect(screen.getByText("Use public article wording.")).toBeInTheDocument();
    expect(screen.getByText("Claim text is required.")).toBeInTheDocument();
  });

  it("renders the section heading at h2 by default and honours an explicit level", () => {
    const { rerender } = render(<EditorSection title="Citation token preview" />);
    expect(
      screen.getByRole("heading", { level: 2, name: "Citation token preview" }),
    ).toBeInTheDocument();

    rerender(<EditorSection title="Citation token preview" headingLevel="h3" />);
    expect(
      screen.getByRole("heading", { level: 3, name: "Citation token preview" }),
    ).toBeInTheDocument();
  });

  it("provides toolbar and action group semantics without owning the buttons", () => {
    render(
      <EditorToolbar label="Citation review actions">
        <EditorActionGroup label="Row decisions">
          <button type="button">Approve</button>
          <button type="button">Reject</button>
        </EditorActionGroup>
      </EditorToolbar>,
    );

    expect(screen.getByRole("toolbar", { name: "Citation review actions" })).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Row decisions" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Approve" })).toBeInTheDocument();
  });

  it("supports explicit live regions for notices and action status", () => {
    render(
      <>
        <EditorNotice
          notice={{
            tone: "success",
            message: "Saved profile changes.",
            live: true,
          }}
        />
        <EditorActionStatus status="saving" />
      </>,
    );

    expect(screen.getByRole("alert")).toHaveAttribute("aria-live", "polite");
    expect(screen.getByRole("status")).toHaveAttribute("aria-busy", "true");
    expect(screen.getByRole("status")).toHaveTextContent("Saving");
  });
});
