import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

import { ReplicationStudioTab } from "./ReplicationStudioTab";

function row(index: number) {
  return {
    id: `row-${index}`,
    slug: `work-${index}`,
    title: `Work ${index}`,
    artist: "Hypnagogist",
    artist_url: null,
    role: "replication",
    type: "image",
    effect_slug: "geometry",
    effect_name: "Geometry",
    effect_tags: [],
    credit_line: null,
    rights_status: "creator-retained",
    source_url: null,
    rightsholder: null,
    url: `https://example.invalid/${index}`,
    thumbnail_url: null,
    format: "png",
    duration: null,
    file_size: 1,
    created_at: "2026-08-11T20:27:20.976Z",
  };
}

function stubFetch() {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) =>
      String(input) === "/api/dev/replications"
        ? Response.json({ ok: true, rows: [row(1), row(2)], effects: [{ slug: "geometry", name: "Geometry" }] })
        : Response.json({ ok: true }),
    ),
  );
}

describe("Replication Studio inspector column", () => {
  beforeEach(() => {
    // The Library keeps its view in the URL; each test starts from a clean one.
    window.history.replaceState(null, "", "/dev/replications");
    vi.restoreAllMocks();
  });

  it("keeps idle shortcut help behind a compact disclosure", async () => {
    stubFetch();
    const user = userEvent.setup();
    render(<ReplicationStudioTab />);
    await screen.findByText("Work 1");

    const inspector = screen.getByRole("region", { name: "Inspector" });
    expect(within(inspector).queryByText("move through the grid")).not.toBeInTheDocument();

    await user.click(within(inspector).getByRole("button", { name: "Keyboard shortcuts" }));
    expect(within(inspector).getByText("move through the grid")).toBeInTheDocument();
  });

  it("shows the selected work's media open in the column, without a thumbnail click", async () => {
    stubFetch();
    const user = userEvent.setup();
    render(<ReplicationStudioTab />);
    await screen.findByText("Work 1");

    await user.click(screen.getByRole("option", { name: /Work 1/ }));

    const inspector = await screen.findByRole("region", { name: "Inspector" });
    expect(within(inspector).getByRole("button", { name: "Hide the large preview" })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    // The header thumbnail and the large preview both draw the work.
    expect(within(inspector).getAllByRole("img", { name: "Work 1" })).toHaveLength(2);
  });

  it("keeps the media behind the thumbnail in the narrow sheet", async () => {
    // No breakpoint matches: the inspector is a sheet over the grid.
    vi.stubGlobal("matchMedia", (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));
    stubFetch();
    const user = userEvent.setup();
    render(<ReplicationStudioTab />);
    await screen.findByText("Work 1");

    await user.click(screen.getByRole("option", { name: /Work 1/ }));

    const inspector = await screen.findByRole("region", { name: "Inspector" });
    expect(within(inspector).getByRole("button", { name: "Show a large preview" })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
    vi.unstubAllGlobals();
  });

  it("lets the grid take the idle inspector's space, then opens it on a selection in place", async () => {
    stubFetch();
    const user = userEvent.setup();
    render(<ReplicationStudioTab />);
    await screen.findByText("Work 1");
    const grid = screen.getByRole("listbox", { name: "Replications" });

    const pin = screen.getByRole("button", { name: "Keep the inspector open" });
    expect(pin).toHaveAttribute("aria-pressed", "true");
    await user.click(pin);
    expect(pin).toHaveAttribute("aria-pressed", "false");
    expect(screen.queryByRole("region", { name: "Inspector" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("option", { name: /Work 2/ }));

    expect(await screen.findByRole("region", { name: "Inspector" })).toHaveTextContent("Work 2");
    expect(screen.getByRole("option", { name: /Work 2/ })).toHaveAttribute("aria-selected", "true");
    // The same grid box, never remounted, so its scroll position carries over.
    expect(screen.getByRole("listbox", { name: "Replications" })).toBe(grid);

    await user.click(screen.getByRole("button", { name: "Clear the selection" }));
    expect(screen.queryByRole("region", { name: "Inspector" })).not.toBeInTheDocument();
    expect(screen.getByRole("listbox", { name: "Replications" })).toBe(grid);
  });
});
