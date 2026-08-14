import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

import { ReplicationStudioTab } from "./ReplicationStudioTab";

const CORPUS = {
  ok: true,
  rows: [
    {
      id: "row-1",
      slug: "kaleidoscopic-highway-hypnagogist",
      title: "Kaleidoscopic highway",
      artist: "Hypnagogist",
      artist_url: null,
      role: "replication",
      type: "video",
      effect_slug: "geometry",
      effect_name: "Geometry",
      effect_tags: [],
      credit_line: "Kaleidoscopic highway by Hypnagogist",
      rights_status: "creator-retained",
      source_url: null,
      rightsholder: "Hypnagogist",
      url: "https://example.invalid/a",
      thumbnail_url: "https://example.invalid/a-thumb",
      format: "mp4",
      duration: null,
      file_size: 5834171,
      created_at: "2026-07-28T18:24:53.650Z",
    },
    {
      id: "row-2",
      slug: "alice-grown-large-tenniel",
      title: "Alice grown large",
      artist: "John Tenniel",
      artist_url: null,
      role: "figure",
      type: "image",
      effect_slug: null,
      effect_name: null,
      effect_tags: ["drifting"],
      credit_line: null,
      rights_status: "public-domain",
      source_url: null,
      rightsholder: null,
      url: "https://example.invalid/b",
      thumbnail_url: null,
      format: "png",
      duration: null,
      file_size: 161570,
      created_at: "2026-08-11T20:27:20.976Z",
    },
  ],
  effects: [
    { slug: "drifting", name: "Drifting" },
    { slug: "geometry", name: "Geometry" },
  ],
};

function stubFetch() {
  const calls: { url: string; init?: RequestInit }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      calls.push({ url, init });
      if (url === "/api/dev/replications" && (!init || init.method === undefined)) {
        return Response.json(CORPUS);
      }
      if (url === "/api/dev/replications/editorial") {
        return Response.json({ ok: true, updated: 1, slugs: ["kaleidoscopic-highway-hypnagogist"] });
      }
      return Response.json({ ok: true });
    }),
  );
  return calls;
}

describe("ReplicationStudioTab", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("loads the corpus and renders every row, figures included", async () => {
    stubFetch();
    render(<ReplicationStudioTab />);

    expect(await screen.findByText("Kaleidoscopic highway")).toBeInTheDocument();
    expect(screen.getByText("Alice grown large")).toBeInTheDocument();
    expect(screen.getByText("2 of 2 shown")).toBeInTheDocument();
  });

  it("filters the grid from the search box", async () => {
    stubFetch();
    const user = userEvent.setup();
    render(<ReplicationStudioTab />);
    await screen.findByText("Kaleidoscopic highway");

    await user.type(screen.getByLabelText("Search replications"), "tenniel");

    await waitFor(() => expect(screen.getByText("1 of 2 shown")).toBeInTheDocument());
    expect(screen.queryByText("Kaleidoscopic highway")).not.toBeInTheDocument();
  });

  it("saves a single edit with the snapshot it loaded as the compare-and-swap guard", async () => {
    const calls = stubFetch();
    const user = userEvent.setup();
    render(<ReplicationStudioTab />);
    await screen.findByText("Kaleidoscopic highway");

    await user.click(screen.getByRole("option", { name: /Kaleidoscopic highway/ }));

    const title = await screen.findByLabelText("Title");
    await user.clear(title);
    await user.type(title, "Kaleidoscopic freeway");
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(calls.some((call) => call.url === "/api/dev/replications/editorial")).toBe(true),
    );

    const save = calls.find((call) => call.url === "/api/dev/replications/editorial");
    const body = JSON.parse(String(save?.init?.body)) as Record<string, unknown>;
    expect(body.mode).toBe("single");
    expect(body.id).toBe("row-1");
    expect(body.expected).toMatchObject({ title: "Kaleidoscopic highway", role: "replication" });
    expect(body.updates).toMatchObject({ title: "Kaleidoscopic freeway", effect_slug: "geometry" });
  });

  it("offers a bulk apply once more than one row is selected", async () => {
    const calls = stubFetch();
    const user = userEvent.setup();
    render(<ReplicationStudioTab />);
    await screen.findByText("Kaleidoscopic highway");

    await user.click(screen.getByRole("option", { name: /Kaleidoscopic highway/ }));
    await user.keyboard("{Control>}");
    await user.click(screen.getByRole("option", { name: /Alice grown large/ }));
    await user.keyboard("{/Control}");

    expect(await screen.findByText("2 selected")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Mark as figure" }));

    await waitFor(() =>
      expect(calls.some((call) => call.url === "/api/dev/replications/editorial")).toBe(true),
    );
    const bulk = calls.find((call) => call.url === "/api/dev/replications/editorial");
    const body = JSON.parse(String(bulk?.init?.body)) as Record<string, unknown>;
    expect(body).toMatchObject({ mode: "bulk", ids: ["row-1", "row-2"], role: "figure" });
  });
});
