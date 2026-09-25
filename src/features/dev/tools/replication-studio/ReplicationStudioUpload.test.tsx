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

/** SHA-256 of the bytes `dropFile` drops ("png!"). */
const DROPPED_SHA = "53ec22c455168e29791219d4017c53b8203153e83853cc7a232b4ab446a8c6b7";

const UPLOADED = {
  ...BASE_ROW,
  publication_state: "unpublished",
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

function stubFetch({
  existing = EXISTING as Record<string, unknown>,
  uploaded = UPLOADED as Record<string, unknown>,
} = {}) {
  let created = false;
  let published = false;
  const calls: { url: string; init?: RequestInit }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      calls.push({ url, init });
      if (url === "/api/dev/replications" && init?.method === "POST") {
        created = true;
        return Response.json({ ok: true, slug: UPLOADED.slug, published: false });
      }
      if (url === "/api/dev/replications/editorial") {
        published = true;
        return Response.json({ ok: true, updated: 1, slugs: [UPLOADED.slug], published: [UPLOADED.slug], conflicts: [] });
      }
      if (url === "/api/dev/replications") {
        const fresh = published ? { ...uploaded, publication_state: "published" } : uploaded;
        return Response.json({
          ok: true,
          rows: created ? [existing, fresh] : [existing],
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
    // The Library keeps its view in the URL; each test starts from a clean one.
    window.history.replaceState(null, "", "/dev/replications");
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

  it("uploads unpublished, asks for source and credit, and drops the unused effect tags", async () => {
    stubFetch();
    render(<ReplicationStudioTab />);
    await screen.findByText("Kaleidoscopic highway");

    dropFile();

    const tray = await screen.findByRole("region", { name: "Incoming" });
    expect(within(tray).getByText(/adds the file to the library unpublished/)).toBeInTheDocument();
    expect(within(tray).queryByText(/goes live on the public site/)).not.toBeInTheDocument();
    expect(within(tray).getByLabelText("Source")).toBeInTheDocument();
    expect(within(tray).getByLabelText("Credit")).toBeInTheDocument();
    expect(within(tray).getByLabelText("Rights status")).toHaveValue("unknown");
    expect(within(tray).queryByText("Subjective effect tags")).not.toBeInTheDocument();
    expect(within(tray).getByRole("button", { name: "Upload" })).toBeInTheDocument();
    expect(within(tray).getByRole("button", { name: "Upload 0" })).toBeDisabled();
  });

  it("warns about a duplicate file before anything uploads", async () => {
    const calls = stubFetch({ existing: { ...EXISTING, source_sha256: DROPPED_SHA } });
    render(<ReplicationStudioTab />);
    await screen.findByText("Kaleidoscopic highway");

    dropFile();

    const tray = await screen.findByRole("region", { name: "Incoming" });
    expect(await within(tray).findByText("Duplicate file")).toBeInTheDocument();
    expect(within(tray).getByText(/kaleidoscopic-highway-hypnagogist/)).toBeInTheDocument();
    expect(calls.some((call) => call.url === "/api/dev/replications/upload-url")).toBe(false);
  });

  it("sends source, credit and rights with the upload and selects the new unpublished work", async () => {
    const calls = stubFetch();
    const user = userEvent.setup();
    render(<ReplicationStudioTab />);
    await screen.findByText("Kaleidoscopic highway");

    dropFile();
    const tray = await screen.findByRole("region", { name: "Incoming" });
    await user.type(within(tray).getByLabelText("Artist"), "Hypnagogist");
    await user.selectOptions(within(tray).getByLabelText("Primary effect"), "geometry");
    await user.selectOptions(within(tray).getByLabelText("Rights status"), "creator-retained");
    await user.type(within(tray).getByLabelText("Source"), "https://artist.test/tunnel");
    await user.type(within(tray).getByLabelText("Credit"), "Hypnagogist, 2024");
    await user.click(within(tray).getByRole("button", { name: "Upload 1" }));

    await waitFor(() =>
      expect(calls.some((call) => call.url === "/api/dev/replications" && call.init?.method === "POST")).toBe(true),
    );
    const create = calls.find((call) => call.url === "/api/dev/replications" && call.init?.method === "POST");
    const body = JSON.parse(String(create?.init?.body)) as Record<string, unknown>;
    expect(body).toMatchObject({
      effectSlug: "geometry",
      rightsStatus: "creator-retained",
      sourceUrl: "https://artist.test/tunnel",
      creditLine: "Hypnagogist, 2024",
    });
    expect(body).not.toHaveProperty("effectTags");
    await waitFor(() =>
      expect(screen.getByRole("option", { name: /Tunnel/ })).toHaveAttribute("aria-selected", "true"),
    );
    expect(screen.getByRole("option", { name: /Tunnel/ })).toHaveTextContent("Unpublished");
    expect(screen.getByRole("region", { name: "Inspector" })).toHaveTextContent("Tunnel");
    expect(await screen.findByText(/stays unpublished until you publish it/)).toBeInTheDocument();
  });

  it("blocks publishing while the source is empty", async () => {
    const calls = stubFetch({ uploaded: { ...UPLOADED, rights_status: "creator-retained", source_url: null } });
    const user = userEvent.setup();
    render(<ReplicationStudioTab />);
    await screen.findByText("Kaleidoscopic highway");

    dropFile();
    const tray = await screen.findByRole("region", { name: "Incoming" });
    await user.type(within(tray).getByLabelText("Artist"), "Hypnagogist");
    await user.selectOptions(within(tray).getByLabelText("Primary effect"), "geometry");
    await user.click(within(tray).getByRole("button", { name: "Upload 1" }));

    const waiting = await screen.findByRole("region", { name: "Waiting to publish" });
    expect(within(waiting).getByText(/needs a source/)).toBeInTheDocument();
    expect(within(waiting).getByRole("button", { name: "Publish 0" })).toBeDisabled();

    const inspector = screen.getByRole("region", { name: "Inspector" });
    const publication = await within(inspector).findByRole("region", { name: "Publication" });
    expect(within(publication).getByText("Publishing is blocked: it needs a source.")).toBeInTheDocument();
    expect(within(publication).getByRole("button", { name: "Publish" })).toBeDisabled();
    expect(calls.some((call) => call.url === "/api/dev/replications/editorial")).toBe(false);
  });

  it("publishes a complete upload from the tray after one confirm", async () => {
    const calls = stubFetch({
      uploaded: { ...UPLOADED, rights_status: "creator-retained", source_url: "https://artist.test/tunnel" },
    });
    const user = userEvent.setup();
    render(<ReplicationStudioTab />);
    await screen.findByText("Kaleidoscopic highway");

    dropFile();
    const tray = await screen.findByRole("region", { name: "Incoming" });
    await user.type(within(tray).getByLabelText("Artist"), "Hypnagogist");
    await user.selectOptions(within(tray).getByLabelText("Primary effect"), "geometry");
    await user.click(within(tray).getByRole("button", { name: "Upload 1" }));

    const waiting = await screen.findByRole("region", { name: "Waiting to publish" });
    await user.click(within(waiting).getByRole("button", { name: "Publish 1" }));
    const dialog = await screen.findByRole("dialog");
    expect(calls.some((call) => call.url === "/api/dev/replications/editorial")).toBe(false);
    await user.click(within(dialog).getByRole("button", { name: "Publish 1" }));

    await waitFor(() =>
      expect(calls.some((call) => call.url === "/api/dev/replications/editorial")).toBe(true),
    );
    const publish = calls.find((call) => call.url === "/api/dev/replications/editorial");
    expect(JSON.parse(String(publish?.init?.body))).toMatchObject({
      mode: "bulk",
      items: [{ id: "row-new", expected: { rights_status: "creator-retained", source_url: "https://artist.test/tunnel" } }],
      patch: { publish: true },
    });
    expect(await screen.findByText(/Published 1 work\. It is live on the public site\./)).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole("region", { name: "Incoming" })).not.toBeInTheDocument());
  });
});
