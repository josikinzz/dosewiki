import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

import { ReplicationStudioTab } from "./ReplicationStudioTab";

const BASE_ROW = {
  artist_url: null,
  role: "replication",
  effect_tags: [],
  credit_line: null,
  rights_status: "creator-retained",
  source_url: null,
  rightsholder: null,
  duration: null,
  created_at: "2026-07-28T18:24:53.650Z",
};

const EXISTING = {
  ...BASE_ROW,
  id: "row-1",
  slug: "kaleidoscopic-highway-hypnagogist",
  title: "Kaleidoscopic highway",
  artist: "Hypnagogist",
  type: "video",
  effect_slug: "geometry",
  effect_name: "Geometry",
  url: "https://example.invalid/a",
  thumbnail_url: null,
  format: "mp4",
  file_size: 5834171,
};

const PUBLISHED = {
  ...BASE_ROW,
  id: "row-new",
  slug: "tunnel-hypnagogist",
  title: "Tunnel",
  artist: "Hypnagogist",
  type: "image",
  effect_slug: "geometry",
  effect_name: "Geometry",
  url: "https://example.invalid/new",
  thumbnail_url: null,
  format: "png",
  file_size: 4,
};

const EFFECTS = [{ slug: "geometry", name: "Geometry" }];

function stubFetch() {
  let published = false;
  const calls: { url: string; init?: RequestInit }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      calls.push({ url, init });
      if (url === "/api/dev/replications" && init?.method === "POST") {
        published = true;
        return Response.json({ ok: true, slug: PUBLISHED.slug });
      }
      if (url === "/api/dev/replications") {
        return Response.json({
          ok: true,
          rows: published ? [EXISTING, PUBLISHED] : [EXISTING],
          effects: EFFECTS,
        });
      }
      if (url === "/api/dev/replications/featured") {
        return Response.json({ slugs: [], curated: true });
      }
      if (url === "/api/dev/replications/upload-url") {
        return Response.json({
          uploadUrl: "https://r2.example.invalid/put",
          uploadHeaders: {},
          uploadToken: "token",
        });
      }
      return Response.json({ ok: true });
    }),
  );
  return calls;
}

function dropFile(name = "Tunnel.png") {
  const file = new File(["png!"], name, { type: "image/png" });
  fireEvent.drop(window, { dataTransfer: { types: ["Files"], files: [file] } });
}

describe("Replication Studio upload tray", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    URL.createObjectURL = vi.fn(() => "blob:preview");
    URL.revokeObjectURL = vi.fn();
  });

  it("shows the Incoming tray when files are dropped on another workspace", async () => {
    stubFetch();
    const user = userEvent.setup();
    render(<ReplicationStudioTab />);
    await screen.findByText("Kaleidoscopic highway");

    await user.click(screen.getByRole("button", { name: "Featured" }));
    await screen.findByText("Featured on the Effect Index homepage");
    dropFile();

    const tray = await screen.findByRole("region", { name: "Incoming" });
    expect(within(tray).getByLabelText("Title")).toHaveValue("Tunnel");
  });

  it("says publishing goes live and labels the write Publish", async () => {
    stubFetch();
    render(<ReplicationStudioTab />);
    await screen.findByText("Kaleidoscopic highway");

    dropFile();

    const tray = await screen.findByRole("region", { name: "Incoming" });
    expect(within(tray).getByText(/goes live on the public site/)).toBeInTheDocument();
    expect(screen.queryByText(/before anything is written/)).not.toBeInTheDocument();
    expect(within(tray).getByRole("button", { name: "Publish" })).toBeInTheDocument();
    expect(within(tray).getByRole("button", { name: "Publish 0" })).toBeDisabled();
  });

  it("selects the new work once it is published", async () => {
    const calls = stubFetch();
    const user = userEvent.setup();
    render(<ReplicationStudioTab />);
    await screen.findByText("Kaleidoscopic highway");

    dropFile();
    const tray = await screen.findByRole("region", { name: "Incoming" });
    await user.type(within(tray).getByLabelText("Artist"), "Hypnagogist");
    await user.selectOptions(within(tray).getByLabelText("Primary effect"), "geometry");
    await user.click(within(tray).getByRole("button", { name: "Publish 1" }));

    await waitFor(() =>
      expect(calls.some((call) => call.url === "/api/dev/replications" && call.init?.method === "POST")).toBe(true),
    );
    await waitFor(() =>
      expect(screen.getByRole("option", { name: /Tunnel/ })).toHaveAttribute("aria-selected", "true"),
    );
    expect(screen.queryByRole("region", { name: "Incoming" })).not.toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Inspector" })).toHaveTextContent("Tunnel");
  });
});
