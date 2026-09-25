import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

import { ReplicationStudioTab } from "./ReplicationStudioTab";

function row(index: number, overrides: Record<string, unknown> = {}) {
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
    ...overrides,
  };
}

const ROWS = [row(1), row(2, { artist: "John Tenniel", effect_tags: ["drifting"] }), row(3)];
const EFFECTS = [
  { slug: "drifting", name: "Drifting" },
  { slug: "geometry", name: "Geometry" },
];

function stubFetch(editorial: () => Response = () =>
  Response.json({ ok: true, updated: 2, slugs: ["work-1", "work-2"], conflicts: [] })) {
  const calls: { url: string; init?: RequestInit }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      calls.push({ url, init });
      if (url === "/api/dev/replications") return Response.json({ ok: true, rows: ROWS, effects: EFFECTS });
      if (url === "/api/dev/replications/editorial") return editorial();
      return Response.json({ ok: true });
    }),
  );
  return calls;
}

function option(name: string) {
  return screen.getByRole("option", { name: new RegExp(name) });
}

async function selectFirstTwo(user: ReturnType<typeof userEvent.setup>) {
  await user.click(option("Work 1"));
  await user.keyboard("{Control>}");
  await user.click(option("Work 2"));
  await user.keyboard("{/Control}");
  await screen.findByText(/2 selected/);
}

describe("Replication Studio bulk edit", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("confirms the changed fields, then sends each item's expected values", async () => {
    const calls = stubFetch();
    const user = userEvent.setup();
    render(<ReplicationStudioTab />);
    await screen.findByText("Work 1");
    await selectFirstTwo(user);

    await user.click(screen.getByRole("button", { name: "Figure" }));
    await user.type(screen.getByLabelText("Set artist for all"), "Anon");
    await user.click(screen.getByRole("button", { name: "Apply to 2" }));

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Role: Figure")).toBeInTheDocument();
    expect(within(dialog).getByText("Artist: Anon")).toBeInTheDocument();
    expect(calls.some((call) => call.url === "/api/dev/replications/editorial")).toBe(false);

    await user.click(within(dialog).getByRole("button", { name: "Apply to 2" }));

    await waitFor(() =>
      expect(calls.some((call) => call.url === "/api/dev/replications/editorial")).toBe(true),
    );
    const bulk = calls.find((call) => call.url === "/api/dev/replications/editorial");
    const body = JSON.parse(String(bulk?.init?.body)) as Record<string, unknown>;
    expect(body).toEqual({
      mode: "bulk",
      items: [
        {
          id: "row-1",
          expected: {
            title: "Work 1",
            artist: "Hypnagogist",
            role: "replication",
            effect_slug: "geometry",
            credit_line: null,
            effect_tags: [],
          },
        },
        {
          id: "row-2",
          expected: {
            title: "Work 2",
            artist: "John Tenniel",
            role: "replication",
            effect_slug: "geometry",
            credit_line: null,
            effect_tags: ["drifting"],
          },
        },
      ],
      patch: { artist: "Anon", role: "figure" },
    });
    // The draft is spent once it is applied.
    await waitFor(() => expect(screen.getByLabelText("Set artist for all")).toHaveValue(""));
  });

  it("names the works that changed under the curator and were not written", async () => {
    stubFetch(() =>
      Response.json({
        ok: true,
        updated: 1,
        slugs: ["work-1"],
        conflicts: [{ id: "row-2", slug: "work-2", reason: "Someone saved it after you loaded the studio." }],
      }),
    );
    const user = userEvent.setup();
    render(<ReplicationStudioTab />);
    await screen.findByText("Work 1");
    await selectFirstTwo(user);

    await user.click(screen.getByRole("button", { name: "Figure" }));
    await user.click(screen.getByRole("button", { name: "Apply to 2" }));
    await user.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Apply to 2" }));

    expect(await screen.findByText(/Updated 1 of 2/)).toHaveTextContent(/work-2/);
  });

  it("starts a new selection with a clean bulk draft", async () => {
    stubFetch();
    const user = userEvent.setup();
    render(<ReplicationStudioTab />);
    await screen.findByText("Work 1");
    await selectFirstTwo(user);

    await user.type(screen.getByLabelText("Set artist for all"), "Anon");
    await user.keyboard("{Control>}");
    await user.click(option("Work 3"));
    await user.keyboard("{/Control}");

    // An applied-to-nothing draft is unsaved work: changing the selection asks first.
    await user.click(await screen.findByRole("button", { name: "Discard changes" }));
    await screen.findByText(/3 selected/);
    expect(screen.getByLabelText("Set artist for all")).toHaveValue("");
  });

  it("extends a contiguous range with Shift and the arrow keys", async () => {
    stubFetch();
    const user = userEvent.setup();
    render(<ReplicationStudioTab />);
    await screen.findByText("Work 1");

    await user.click(option("Work 1"));
    await user.keyboard("{Shift>}{ArrowRight}{ArrowRight}{ArrowLeft}{/Shift}");

    expect(option("Work 1")).toHaveAttribute("aria-selected", "true");
    expect(option("Work 2")).toHaveAttribute("aria-selected", "true");
    expect(option("Work 3")).toHaveAttribute("aria-selected", "false");
  });
});
