import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, describe, expect, it, vi } from "vitest";

// cmdk measures its list and scrolls the active item into view; jsdom has
// neither ResizeObserver nor scrollIntoView.
beforeAll(() => {
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  Element.prototype.scrollIntoView ??= () => {};
});

import { ReviewSubstancePicker } from "./ReviewSubstancePicker";
import {
  buildReviewGroups,
  type ReviewGroupLayout,
  type ReviewQueueEntry,
} from "./reviewQueue";

const layout: ReviewGroupLayout = {
  categories: [
    {
      key: "psychedelic",
      label: "Psychedelic",
      iconKey: "psychedelic",
      sections: [
        { key: "common", label: "Common", drugs: ["lsd"] },
        { key: "tryptamine", label: "Tryptamine", drugs: ["dmt"] },
      ],
      drugs: [],
    },
    {
      key: "dissociative",
      label: "Dissociative",
      iconKey: "dissociative",
      sections: [{ key: "common", label: "Common", drugs: ["ketamine"] }],
      drugs: [],
    },
  ],
};

const entries: ReviewQueueEntry[] = [
  { slug: "lsd", name: "LSD", status: "completed", referenceCount: 0 },
  { slug: "dmt", name: "DMT", status: "needed", referenceCount: 0 },
  { slug: "ketamine", name: "Ketamine", status: "needed", referenceCount: 0 },
];

function renderPicker(current: ReviewQueueEntry | null = entries[0]) {
  const onSelect = vi.fn();
  render(
    <ReviewSubstancePicker
      entries={entries}
      groups={buildReviewGroups(entries, layout)}
      grouped
      current={current}
      onSelect={onSelect}
    />,
  );
  return { onSelect, user: userEvent.setup() };
}

async function openPicker(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("combobox"));
}

describe("ReviewSubstancePicker (grouped)", () => {
  it("opens on the current article's branch and leaves other categories shut", async () => {
    const { user } = renderPicker();
    await openPicker(user);

    // LSD's own category and subsection are open; its sibling subsection and
    // the next category are not.
    expect(screen.getByRole("option", { name: /LSD/ })).toBeTruthy();
    expect(screen.queryByRole("option", { name: /DMT/ })).toBeNull();
    expect(screen.queryByRole("option", { name: /Ketamine/ })).toBeNull();
    expect(
      screen.getByRole("button", { name: /Dissociative/ }),
    ).toHaveAttribute("aria-expanded", "false");
  });

  it("expands a category and its subsection through the chevrons", async () => {
    const { user, onSelect } = renderPicker();
    await openPicker(user);

    await user.click(screen.getByRole("button", { name: /Dissociative/ }));
    // The category is open, but its subsection still needs its own click.
    expect(screen.queryByRole("option", { name: /Ketamine/ })).toBeNull();

    const [, dissociativeCommon] = screen.getAllByRole("button", {
      name: /Common/,
    });
    await user.click(dissociativeCommon);
    await user.click(screen.getByRole("option", { name: /Ketamine/ }));
    expect(onSelect).toHaveBeenCalledWith("ketamine");
  });

  it("surfaces matches inside collapsed categories while searching", async () => {
    const { user } = renderPicker();
    await openPicker(user);

    await user.type(screen.getByRole("combobox", { name: "" }), "ketamine");
    expect(screen.getByRole("option", { name: /Ketamine/ })).toBeTruthy();
    expect(screen.queryByRole("option", { name: /LSD/ })).toBeNull();
  });

  it("treats a class name as a match for the whole subsection", async () => {
    const { user } = renderPicker();
    await openPicker(user);

    await user.type(screen.getByRole("combobox", { name: "" }), "tryptamine");
    expect(screen.getByRole("option", { name: /DMT/ })).toBeTruthy();
    expect(screen.queryByRole("option", { name: /Ketamine/ })).toBeNull();
  });

  it("reports nothing found for a query that matches no article", async () => {
    const { user } = renderPicker();
    await openPicker(user);

    await user.type(screen.getByRole("combobox", { name: "" }), "zzzz");
    expect(screen.getByText("No articles found")).toBeTruthy();
  });
});
