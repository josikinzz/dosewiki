import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ReplicationAssociationsPanel } from "./ReplicationAssociationsPanel";
import type { ReplicationAssociation } from "./replicationAssociationModel";
import type { StudioRow } from "./replicationStudioModel";

const ROW: StudioRow = {
  id: "rep-1",
  slug: "spiral-bloom",
  title: "Spiral Bloom",
  artist: "Hypnagogist",
  artist_url: null,
  role: "replication",
  type: "image",
  effect_slug: "geometry",
  effect_name: "Geometry",
  effect_tags: ["drifting"],
  credit_line: null,
  url: null,
  thumbnail_url: null,
  format: "png",
  duration: null,
  file_size: null,
  created_at: "2026-01-01T00:00:00.000Z",
};

const ASSOCIATIONS: ReplicationAssociation[] = [
  {
    slug: "lsd",
    title: "LSD",
    matchedVia: "effect_slug",
    effectSlug: "geometry",
    effectName: "Geometry",
    excluded: false,
    curatedPosition: 2,
  },
  {
    slug: "dmt",
    title: "DMT",
    matchedVia: "effect_slug",
    effectSlug: "geometry",
    effectName: "Geometry",
    excluded: false,
    curatedPosition: null,
  },
  {
    slug: "psilocybin",
    title: "Psilocybin mushrooms",
    matchedVia: "effect_tags",
    effectSlug: "drifting",
    effectName: "Drifting",
    excluded: false,
    curatedPosition: null,
  },
];

type PostBody = { excludedSubstanceSlugs: string[] };
type PostReply = { status: number; payload: unknown };

function stubFetch(options: {
  associations?: ReplicationAssociation[];
  getStatus?: number;
  getPayload?: unknown;
  onPost?: (body: PostBody) => PostReply;
} = {}) {
  const posts: PostBody[] = [];
  const urls: string[] = [];
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    urls.push(String(input));
    if (init?.method === "POST") {
      const body = JSON.parse(String(init.body)) as PostBody;
      posts.push(body);
      const reply = options.onPost?.(body) ?? {
        status: 200,
        payload: { ok: true, updated: body.excludedSubstanceSlugs, droppedCuratedPositions: [] },
      };
      return new Response(JSON.stringify(reply.payload), {
        status: reply.status,
        headers: { "Content-Type": "application/json" },
      });
    }
    const status = options.getStatus ?? 200;
    const payload =
      options.getPayload ?? { ok: true, associations: options.associations ?? ASSOCIATIONS };
    return new Response(JSON.stringify(payload), {
      status,
      headers: { "Content-Type": "application/json" },
    });
  });
  vi.stubGlobal("fetch", fetchMock);
  return { fetchMock, posts, urls };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("ReplicationAssociationsPanel", () => {
  it("shows a skeleton first, then the drug articles with their match provenance", async () => {
    stubFetch();
    const { container } = render(<ReplicationAssociationsPanel row={ROW} />);

    // Loading is row-shaped, not bare text.
    expect(container.querySelectorAll(".theme-skeleton-pulse").length).toBeGreaterThan(0);

    // Only LSD is curated, so only LSD is actually on an article.
    expect(await screen.findByText("Showing on 1 of 3 drug articles")).toBeInTheDocument();
    expect(screen.getByText("3 eligible · 0 excluded")).toBeInTheDocument();
    expect(screen.getByText("Associations saved")).toBeInTheDocument();

    // Owning-effect matches are grouped apart from tag matches.
    const owning = within(screen.getByRole("list", { name: "Matched by owning effect" }));
    expect(owning.getByRole("checkbox", { name: "LSD" })).toBeChecked();
    expect(owning.getByRole("checkbox", { name: "DMT" })).toBeChecked();
    expect(owning.getAllByText("via owning effect")).toHaveLength(2);

    const tagged = within(screen.getByRole("list", { name: "Matched by effect tag" }));
    expect(tagged.getByRole("checkbox", { name: "Psilocybin mushrooms" })).toBeChecked();
    expect(tagged.getByText("via effect tag")).toBeInTheDocument();
    expect(tagged.getByText("Drifting")).toBeInTheDocument();
  });

  it("labels every row showing, eligible-but-uncurated, or excluded", async () => {
    const user = userEvent.setup();
    stubFetch();
    render(<ReplicationAssociationsPanel row={ROW} />);

    await screen.findByText("Showing on 1 of 3 drug articles");

    // Curated and not excluded: on the article, at its stored position.
    expect(screen.getByTestId("association-state-lsd")).toHaveTextContent(
      "Showing · position 2",
    );
    expect(screen.queryByTestId("eligible-note-lsd")).not.toBeInTheDocument();

    // Ticked but never curated: allowed, yet nothing shows there.
    expect(screen.getByTestId("association-state-dmt")).toHaveTextContent(
      "Eligible · not curated",
    );
    expect(screen.getByTestId("eligible-note-dmt")).toHaveTextContent(
      "nothing shows on this drug yet — unticking only forbids a future curation",
    );

    // Unticking swaps the eligible row to excluded, and drops the note with it.
    await user.click(screen.getByRole("checkbox", { name: "DMT" }));
    expect(screen.getByTestId("association-state-dmt")).toHaveTextContent("Excluded");
    expect(screen.queryByTestId("eligible-note-dmt")).not.toBeInTheDocument();
  });

  it("never claims an uncurated replication appears anywhere", async () => {
    stubFetch({
      associations: ASSOCIATIONS.map((entry) => ({ ...entry, curatedPosition: null })),
    });
    render(<ReplicationAssociationsPanel row={ROW} />);

    expect(await screen.findByText("Showing on 0 of 3 drug articles")).toBeInTheDocument();
    expect(screen.queryByText(/^Appears on/)).not.toBeInTheDocument();

    // Eligible everywhere, published nowhere — and every row says so.
    expect(screen.getByText("3 eligible · 0 excluded")).toBeInTheDocument();
    expect(screen.getAllByText("Eligible · not curated")).toHaveLength(3);
  });

  it("warns inline and in the save summary when unticking a curated drug", async () => {
    const user = userEvent.setup();
    stubFetch();
    render(<ReplicationAssociationsPanel row={ROW} />);

    await screen.findByText("Showing on 1 of 3 drug articles");
    expect(screen.queryByTestId("curated-warning-lsd")).not.toBeInTheDocument();

    // DMT is not curated: unticking it must not raise a curated warning.
    await user.click(screen.getByRole("checkbox", { name: "DMT" }));
    expect(screen.getByText("Unsaved changes")).toBeInTheDocument();
    expect(screen.queryByTestId("curated-warning-dmt")).not.toBeInTheDocument();
    expect(screen.queryByText(/Saving will drop/)).not.toBeInTheDocument();
    expect(screen.getByTestId("association-state-dmt")).toHaveTextContent("Excluded");
    // DMT published nothing, so the publication count is unmoved.
    expect(screen.getByText("Showing on 1 of 3 drug articles")).toBeInTheDocument();

    // LSD pinned it at position 2, so the row and the save summary both say so.
    await user.click(screen.getByRole("checkbox", { name: "LSD" }));
    expect(screen.getByTestId("curated-warning-lsd")).toHaveTextContent(
      "curated at position 2 — unticking drops that position",
    );
    expect(
      screen.getByText(/Saving will drop 1 curated position: LSD \(position 2\)\./),
    ).toBeInTheDocument();
    expect(screen.getByText("1 eligible · 2 excluded")).toBeInTheDocument();
    // Excluding the one curated drug takes the last publication with it.
    expect(screen.getByText("Showing on 0 of 3 drug articles")).toBeInTheDocument();
  });

  it("posts the full excluded set and reports the dropped curated positions", async () => {
    const user = userEvent.setup();
    const { posts } = stubFetch({
      onPost: () => ({
        status: 200,
        payload: {
          ok: true,
          updated: ["lsd"],
          droppedCuratedPositions: [{ substance_slug: "lsd", position: 2 }],
        },
      }),
    });
    render(<ReplicationAssociationsPanel row={ROW} />);

    await screen.findByText("Showing on 1 of 3 drug articles");
    await user.click(screen.getByRole("checkbox", { name: "LSD" }));
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(posts).toHaveLength(1));
    expect(posts[0]).toEqual({ excludedSubstanceSlugs: ["lsd"] });

    expect(
      await screen.findByText(
        /Saved\. This replication now appears on 2 of 3 drug articles \(1 article rewritten\)\. Dropped 1 curated position: LSD \(position 2\)\./,
      ),
    ).toBeInTheDocument();

    // The echo becomes the new baseline: clean, and the drop is no longer "at risk".
    await waitFor(() => expect(screen.getByText("Associations saved")).toBeInTheDocument());
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
    expect(screen.queryByTestId("curated-warning-lsd")).not.toBeInTheDocument();
    expect(screen.queryByText(/Saving will drop/)).not.toBeInTheDocument();
    expect(screen.getByText("Showing on 0 of 3 drug articles")).toBeInTheDocument();
    expect(screen.getByTestId("association-state-lsd")).toHaveTextContent("Excluded");
  });

  it("select none unticks every drug and posts them all", async () => {
    const user = userEvent.setup();
    const { posts } = stubFetch();
    render(<ReplicationAssociationsPanel row={ROW} />);

    await screen.findByText("Showing on 1 of 3 drug articles");
    await user.click(screen.getByRole("button", { name: "Select none" }));
    expect(screen.getByText("0 eligible · 3 excluded")).toBeInTheDocument();
    expect(screen.getByText("Showing on 0 of 3 drug articles")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(posts).toHaveLength(1));
    expect(posts[0]).toEqual({ excludedSubstanceSlugs: ["lsd", "dmt", "psilocybin"] });
  });

  it("treats a 200 with no association list as an error, not as 'appears nowhere'", async () => {
    stubFetch({ getPayload: { ok: true } });
    render(<ReplicationAssociationsPanel row={ROW} />);

    expect(
      await screen.findByText("The associations endpoint returned no association list."),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("This replication does not appear on any drug article yet"),
    ).not.toBeInTheDocument();
  });

  it("explains the empty case instead of rendering an editor", async () => {
    stubFetch({ associations: [] });
    render(<ReplicationAssociationsPanel row={ROW} />);

    expect(
      await screen.findByText("This replication does not appear on any drug article yet"),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Save" })).not.toBeInTheDocument();
  });

  it("surfaces a load failure with a working Retry", async () => {
    const user = userEvent.setup();
    let attempt = 0;
    const fetchMock = vi.fn(async () => {
      attempt += 1;
      if (attempt === 1) {
        return new Response(JSON.stringify({ error: "Convex is unreachable." }), {
          status: 500,
          headers: { "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ ok: true, associations: ASSOCIATIONS }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<ReplicationAssociationsPanel row={ROW} />);

    expect(await screen.findByText("Convex is unreachable.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /retry/i }));

    expect(await screen.findByText("Showing on 1 of 3 drug articles")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("reports a save failure without adopting the draft as saved", async () => {
    const user = userEvent.setup();
    stubFetch({
      onPost: () => ({ status: 400, payload: { error: "Substance slug list rejected." } }),
    });
    render(<ReplicationAssociationsPanel row={ROW} />);

    await screen.findByText("Showing on 1 of 3 drug articles");
    await user.click(screen.getByRole("checkbox", { name: "DMT" }));
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByText("Substance slug list rejected.")).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "DMT" })).not.toBeChecked();
    expect(screen.getByRole("button", { name: "Save" })).toBeEnabled();
  });
});
