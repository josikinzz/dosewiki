import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { CollapsibleEditorCard } from "./CollapsibleEditorCard";

vi.mock("@/components/common/Icon", () => ({
  Icon: ({ icon }: { icon: string }) => <span data-icon={icon} />,
}));

describe("CollapsibleEditorCard", () => {
  it("exposes the trigger as a heading and wires it to the panel", () => {
    render(
      <CollapsibleEditorCard title="Dangerous Combinations" defaultExpanded>
        <p>Panel body</p>
      </CollapsibleEditorCard>,
    );

    const heading = screen.getByRole("heading", { level: 3, name: /Dangerous Combinations/ });
    const trigger = screen.getByRole("button", { name: /Dangerous Combinations/ });
    expect(heading).toContainElement(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "true");

    const panelId = trigger.getAttribute("aria-controls");
    expect(panelId).toBeTruthy();

    const panel = screen.getByRole("region", { name: /Dangerous Combinations/ });
    expect(panel).toHaveAttribute("id", panelId);
    expect(panel).toHaveTextContent("Panel body");
  });

  it("hides the panel and flips aria-expanded when collapsed", () => {
    render(
      <CollapsibleEditorCard title="Toxicity" headingLevel="h4">
        <p>Panel body</p>
      </CollapsibleEditorCard>,
    );

    const trigger = screen.getByRole("button", { name: /Toxicity/ });
    expect(screen.getByRole("heading", { level: 4, name: /Toxicity/ })).toBeInTheDocument();
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("region")).not.toBeInTheDocument();

    fireEvent.click(trigger);

    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("region", { name: /Toxicity/ })).toBeInTheDocument();
  });

  it("marks and reveals a section when validation fails", async () => {
    const { rerender } = render(
      <CollapsibleEditorCard title="Subjective Effects">
        <p>Panel body</p>
      </CollapsibleEditorCard>,
    );

    const trigger = screen.getByRole("button", { name: /Subjective Effects/ });
    expect(trigger).toHaveAttribute("aria-expanded", "false");

    rerender(
      <CollapsibleEditorCard title="Subjective Effects" hasError>
        <p>Panel body</p>
      </CollapsibleEditorCard>,
    );

    await waitFor(() => expect(trigger).toHaveAttribute("aria-expanded", "true"));
    expect(trigger).toHaveAttribute("data-invalid", "true");
    expect(trigger).toHaveTextContent("Needs attention");
    expect(screen.getByRole("region", { name: /Subjective Effects/ })).toHaveTextContent(
      "Panel body",
    );
  });
});
