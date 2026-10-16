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
  /**
   * A stand-in for the review portal's own seam, close enough to be worth
   * trusting: the store refuses any write whose `expected` is not what it
   * currently holds, and the surface can report the newer value because it
   * holds a live subscription to it. The rendered `value` prop deliberately
   * stays on the pre-conflict copy: a frozen working set is exactly how the
   * reviewer ends up sending a stale baseline in the first place.
   */
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
    // Somebody else got there first, and the render is pinned to the old copy.
    store.value = "Someone else's note.";
    renderWithProvider(commit, <span>Original note.</span>, {
      refreshStoredValue: () => store.value,
    });

    const user = await openAndType(" Corrected.{Enter}");

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "This field changed since the article was loaded.",
    );
    // The reviewer's typing is the thing that must survive the refusal.
    expect(screen.getByRole("textbox", { name: "Edit Oral notes" })).toHaveValue(
      "Original note. Corrected.",
    );
    // …alongside the value that landed, so the two can be reconciled in place.
    expect(screen.getByText("Someone else's note.")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Apply my text to preview/ }));

    // The retry is sent against the refreshed baseline, so it is a normal
    // write rather than a second refusal.
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

    // Blur is one stray tap on a phone; overwriting someone else's value has
    // to stay an explicit choice, and the draft has to still be there to make.
    expect(commit).toHaveBeenCalledTimes(1);
    expect(store.value).toBe("Someone else's note.");
    expect(screen.getByRole("textbox", { name: "Edit Oral notes" })).toHaveValue(
      "Original note. Corrected.",
    );
  });
});
