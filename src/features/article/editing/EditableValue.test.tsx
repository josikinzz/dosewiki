import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { ArticleEditProvider } from "./ArticleEditContext";
import { EditableValue } from "./EditableValue";

vi.mock("@/components/common/Icon", () => ({
  Icon: ({ icon }: { icon: string }) => <span data-icon={icon} aria-hidden />,
}));

function renderWithProvider(
  commit: (path: string, value: string) => Promise<string>,
  children: ReactNode = <span>Original note.</span>,
) {
  return render(
    <ArticleEditProvider value={{ commit }}>
      <EditableValue path="dosage.routes[1].notes" value="Original note." label="Oral notes">
        {children}
      </EditableValue>
    </ArticleEditProvider>,
  );
}

describe("EditableValue", () => {
  it("renders children verbatim with no provider and no wrapper", () => {
    const { container } = render(
      <EditableValue path="tolerance.full_tolerance" value="Two weeks.">
        <em>Two weeks.</em>
      </EditableValue>,
    );

    expect(container.innerHTML).toBe("<em>Two weeks.</em>");
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("opens an editor seeded with the raw value and commits on Enter", async () => {
    const user = userEvent.setup();
    const commit = vi.fn(async (_path: string, value: string) => value);
    renderWithProvider(commit);

    await user.click(screen.getByRole("button", { name: "Edit Oral notes" }));

    const field = screen.getByRole("textbox", { name: "Edit Oral notes" });
    expect(field).toHaveValue("Original note.");

    await user.type(field, " Corrected.{Enter}");

    // The third argument is the value the field was showing: the store refuses
    // the write unless it still holds it, which is what keeps an indexed path
    // from landing on a route that moved.
    expect(commit).toHaveBeenCalledWith(
      "dosage.routes[1].notes",
      "Original note. Corrected.",
      "Original note.",
    );
    expect(
      screen.queryByRole("textbox", { name: "Edit Oral notes" }),
    ).toBeNull();
  });

  it("opens from the keyboard", async () => {
    const user = userEvent.setup();
    const commit = vi.fn(async (_path: string, value: string) => value);
    renderWithProvider(commit);

    screen.getByRole("button", { name: "Edit Oral notes" }).focus();
    await user.keyboard("{Enter}");

    expect(screen.getByRole("textbox", { name: "Edit Oral notes" })).toBeInTheDocument();
  });

  it("cancels on Escape without committing", async () => {
    const user = userEvent.setup();
    const commit = vi.fn(async (_path: string, value: string) => value);
    renderWithProvider(commit);

    await user.click(screen.getByRole("button", { name: "Edit Oral notes" }));
    await user.type(
      screen.getByRole("textbox", { name: "Edit Oral notes" }),
      " discarded{Escape}",
    );

    expect(commit).not.toHaveBeenCalled();
    expect(screen.queryByRole("textbox", { name: "Edit Oral notes" })).toBeNull();
    expect(screen.getByRole("button", { name: "Edit Oral notes" })).toBeInTheDocument();
  });

  it("keeps the prior value and shows the reason when a commit is rejected", async () => {
    const user = userEvent.setup();
    const commit = vi.fn(async () => {
      throw new Error("This article has unapplied editor form edits.");
    });
    renderWithProvider(commit);

    await user.click(screen.getByRole("button", { name: "Edit Oral notes" }));
    await user.type(
      screen.getByRole("textbox", { name: "Edit Oral notes" }),
      " rejected{Enter}",
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "This article has unapplied editor form edits.",
    );
    // Still editing, so the unsaved text is recoverable rather than lost.
    expect(screen.getByRole("textbox", { name: "Edit Oral notes" })).toHaveValue(
      "Original note. rejected",
    );
  });

  it("does not call commit when the value is unchanged", async () => {
    const user = userEvent.setup();
    const commit = vi.fn(async (_path: string, value: string) => value);
    renderWithProvider(commit);

    await user.click(screen.getByRole("button", { name: "Edit Oral notes" }));
    await user.keyboard("{Enter}");

    expect(commit).not.toHaveBeenCalled();
    expect(screen.queryByRole("textbox", { name: "Edit Oral notes" })).toBeNull();
  });
});
