import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { SubstanceArticle } from "@/schema";

import { EditorCitationDiagnosticsPanel } from "./EditorCitationDiagnosticsPanel";

vi.mock("@/components/common/Icon", () => ({
  Icon: ({ icon }: { icon: string }) => <span data-icon={icon} />,
}));

const article = {
  title: "Test substance",
  summary: "Cites a stranger [cite:missing-source].",
  references: [
    {
      id: "orphan-source",
      title: "Unlinked source",
      type: "web",
      sourceType: "web",
      quality: "medium",
      authors: [],
      year: null,
    },
  ],
} as unknown as SubstanceArticle;

describe("EditorCitationDiagnosticsPanel", () => {
  it("renders warnings as editor notices with a focusable collapse toggle", () => {
    render(<EditorCitationDiagnosticsPanel article={article} headingLevel="h3" />);

    expect(
      screen.getByRole("heading", { level: 3, name: /Citation token preview/ }),
    ).toBeInTheDocument();

    // EditorNotice renders the shared Alert surface rather than a hand-rolled card.
    expect(screen.getAllByRole("note").length).toBeGreaterThan(0);
    expect(screen.getByText("Unknown inline reference IDs")).toBeInTheDocument();

    const toggle = screen.getByRole("button", { name: /no inline links/ });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    // The shared disclosure recipe, not a per-file copy of the raw tokens.
    expect(toggle.className).toContain("theme-editor-disclosure-trigger");
    expect(screen.queryByTitle("orphan-source")).not.toBeInTheDocument();

    fireEvent.click(toggle);

    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByTitle("orphan-source")).toBeInTheDocument();
  });

  it("reuses the memoized diagnostics when the article object identity changes but its content does not", () => {
    const { rerender } = render(<EditorCitationDiagnosticsPanel article={article} />);
    const before = screen.getByText("Unknown inline reference IDs");

    rerender(<EditorCitationDiagnosticsPanel article={structuredClone(article)} />);

    expect(screen.getByText("Unknown inline reference IDs")).toBe(before);
  });
});
