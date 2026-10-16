import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import {
  ArticleEditProvider,
  ArticleFieldCommitError,
  type ArticleEditContextValue,
  type EditableFieldValue,
} from "./ArticleEditContext";
import { EditableValue } from "./EditableValue";

vi.mock("@/components/common/Icon", () => ({
  Icon: ({ icon }: { icon: string }) => <span data-icon={icon} aria-hidden />,
}));

function renderWithProvider(
  commit: ArticleEditContextValue["commit"],
  children: ReactNode = <span>Original note.</span>,
  extra?: Omit<ArticleEditContextValue, "commit">,
) {
  return render(
    <ArticleEditProvider value={{ commit, ...extra }}>
      <EditableValue path="dosage.routes[1].notes" value="Original note." label="Oral notes">
        {children}
      </EditableValue>
    </ArticleEditProvider>,
  );
}

describe("EditableValue when the stored value moved underneath it", () => {
  function stubSurface(initial: string) {
    const store = { value: initial };
    const commit = vi.fn(
      async (
        _path: string,
        next: EditableFieldValue,
        expected: EditableFieldValue,
      ) => {
        if (expected !== store.value) {
          throw new ArticleFieldCommitError(
            "This field changed since the article was loaded. Reload the article, then make the edit again.",
            "FIELD_CONFLICT",
          );
        }
        store.value = next as string;
        return next;
      },
    );
    return { store, commit };
  }

  async function openAndType(text: string) {
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Edit Oral notes" }));
    await user.type(screen.getByRole("textbox", { name: "Edit Oral notes" }), text);
    return user;
  }

  it("refuses, shows what landed, and persists the typed text on the retry", async () => {
    const { store, commit } = stubSurface("Original note.");
    store.value = "Someone else's note.";
    renderWithProvider(commit, <span>Original note.</span>, {
      refreshStoredValue: () => store.value,
    });

    const user = await openAndType(" Corrected.{Enter}");

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "This field changed since the article was loaded.",
    );
    expect(screen.getByRole("textbox", { name: "Edit Oral notes" })).toHaveValue(
      "Original note. Corrected.",
    );
    expect(screen.getByText("Someone else's note.")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Apply my text to preview/ }));

    expect(commit).toHaveBeenLastCalledWith(
      "dosage.routes[1].notes",
      "Original note. Corrected.",
      "Someone else's note.",
    );
    expect(store.value).toBe("Original note. Corrected.");
    await waitFor(() =>
      expect(
        screen.queryByRole("textbox", { name: "Edit Oral notes" }),
      ).toBeNull(),
    );
  });

  it("does not overwrite what landed on a stray blur", async () => {
    const { store, commit } = stubSurface("Original note.");
    store.value = "Someone else's note.";
    renderWithProvider(commit, <span>Original note.</span>, {
      refreshStoredValue: () => store.value,
    });

    const user = await openAndType(" Corrected.{Enter}");
    await screen.findByRole("alert");
    expect(commit).toHaveBeenCalledTimes(1);

    await user.click(document.body);

    expect(commit).toHaveBeenCalledTimes(1);
    expect(store.value).toBe("Someone else's note.");
    expect(screen.getByRole("textbox", { name: "Edit Oral notes" })).toHaveValue(
      "Original note. Corrected.",
    );
  });
});
