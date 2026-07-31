import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { doseRangeTransformer } from "@/data/schema";
import type { DoseRange } from "@/schema";
import {
  ArticleEditProvider,
  type ArticleEditContextValue,
  type EditableFieldValue,
} from "./ArticleEditContext";
import { EditableSlot } from "./EditableSlot";
import { EditableValue } from "./EditableValue";

vi.mock("@/components/common/Icon", () => ({
  Icon: ({ icon }: { icon: string }) => <span data-icon={icon} aria-hidden />,
}));

function renderWithProvider(
  commit: ArticleEditContextValue["commit"],
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
    const commit = vi.fn(async (_path: string, value: EditableFieldValue) => value);
    renderWithProvider(commit);

    await user.click(screen.getByRole("button", { name: "Edit Oral notes" }));
    await user.keyboard("{Enter}");

    expect(commit).not.toHaveBeenCalled();
    expect(screen.queryByRole("textbox", { name: "Edit Oral notes" })).toBeNull();
  });
});

describe("EditableValue placeholders", () => {
  it("shows the empty label only inside an editing surface", () => {
    const outside = render(
      <EditableValue path="tolerance.full_tolerance" value="" emptyLabel="Add tolerance">
        <span />
      </EditableValue>,
    );
    expect(outside.container.textContent).toBe("");
    outside.unmount();

    render(
      <ArticleEditProvider value={{ commit: async (_p, value) => value }}>
        <EditableValue path="tolerance.full_tolerance" value="" emptyLabel="Add tolerance">
          <span />
        </EditableValue>
      </ArticleEditProvider>,
    );
    expect(screen.getByText("Add tolerance")).toBeInTheDocument();
  });
});

describe("EditableValue with a parsed value", () => {
  const LIGHT: DoseRange = { min: 10, max: 20, unit: "mg" };

  function renderRange(commit: ArticleEditContextValue["commit"]) {
    return render(
      <ArticleEditProvider value={{ commit }}>
        <EditableValue<DoseRange>
          path="dosage.routes[0].dose_ranges.light"
          value={LIGHT}
          label="Light dose"
          format={(range) => doseRangeTransformer.toForm(range)}
          parse={(raw) => doseRangeTransformer.toSchema(raw)}
          parseErrorLabel="Not a dose range."
        >
          <span>10-20 mg</span>
        </EditableValue>
      </ArticleEditProvider>,
    );
  }

  it("seeds the editor with the formatted value and commits the parsed one", async () => {
    const user = userEvent.setup();
    const commit = vi.fn(async (_path: string, value: EditableFieldValue) => value);
    renderRange(commit);

    await user.click(screen.getByRole("button", { name: "Edit Light dose" }));
    const field = screen.getByRole("textbox", { name: "Edit Light dose" });
    expect(field).toHaveValue("10-20 mg");

    await user.clear(field);
    await user.type(field, "15-30 mg{Enter}");

    expect(commit).toHaveBeenCalledWith(
      "dosage.routes[0].dose_ranges.light",
      { min: 15, max: 30, unit: "mg" },
      LIGHT,
    );
  });

  it("shows an error and commits nothing when the text does not parse", async () => {
    const user = userEvent.setup();
    const commit = vi.fn(async (_path: string, value: EditableFieldValue) => value);
    renderRange(commit);

    await user.click(screen.getByRole("button", { name: "Edit Light dose" }));
    const field = screen.getByRole("textbox", { name: "Edit Light dose" });
    await user.clear(field);
    await user.type(field, "quite a lot{Enter}");

    expect(await screen.findByRole("alert")).toHaveTextContent("Not a dose range.");
    // Never coerced to an empty range: the stored dose is untouched and the
    // unsaved draft is still on screen.
    expect(commit).not.toHaveBeenCalled();
    expect(screen.getByRole("textbox", { name: "Edit Light dose" })).toHaveValue(
      "quite a lot",
    );
  });
});

describe("EditableSlot", () => {
  it("renders nothing at all without an editing context", () => {
    const { container } = render(
      <EditableSlot
        path="legality.countries.Germany.notes"
        value=""
        emptyLabel="Add a country note"
      />,
    );
    expect(container.innerHTML).toBe("");
  });

  it("offers the prompt inside an editing surface and commits through it", async () => {
    const user = userEvent.setup();
    const commit = vi.fn(async (_path: string, value: EditableFieldValue) => value);
    render(
      <ArticleEditProvider value={{ commit }}>
        <EditableSlot
          path="legality.countries.Germany.notes"
          value=""
          emptyLabel="Add a country note"
        />
      </ArticleEditProvider>,
    );

    await user.click(screen.getByRole("button", { name: "Edit Add a country note" }));
    await user.type(
      screen.getByRole("textbox", { name: "Edit Add a country note" }),
      "Anlage I.{Enter}",
    );

    expect(commit).toHaveBeenCalledWith(
      "legality.countries.Germany.notes",
      "Anlage I.",
      "",
    );
  });
});

describe("EditableValue inside a clickable ancestor", () => {
  it("opens without firing the ancestor's handler", async () => {
    const user = userEvent.setup();
    const commit = vi.fn<ArticleEditContextValue["commit"]>();
    const onAncestorClick = vi.fn();

    render(
      <ArticleEditProvider value={{ commit }}>
        {/* The Notable Individuals card is a button wrapping its own prose. */}
        <button type="button" onClick={onAncestorClick}>
          <EditableValue path="history_culture.content" value="Stored prose.">
            Stored prose.
          </EditableValue>
        </button>
      </ArticleEditProvider>,
    );

    await user.click(screen.getByRole("button", { name: "Edit history_culture.content" }));

    expect(onAncestorClick).not.toHaveBeenCalled();
    expect(
      screen.getByRole("textbox", { name: "Edit history_culture.content" }),
    ).toHaveValue("Stored prose.");
  });
});
