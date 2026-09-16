import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { ReplicationAssociationsPanel } from "./ReplicationAssociationsPanel";
import type { ReplicationAssociation } from "./replicationAssociationModel";
import type { StudioRow } from "./replicationStudioModel";

beforeAll(() => {
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  Element.prototype.scrollIntoView ??= vi.fn();
});

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
    matchedVia: "specific_drug",
    effectSlug: "geometry",
    effectName: "Geometry",
    excluded: false,
    curatedPosition: 2,
  },
  {
    slug: "dmt",
    title: "DMT",
    matchedVia: "specific_drug",
    effectSlug: "geometry",
    effectName: "Geometry",
    excluded: false,
    curatedPosition: null,
  },
  {
    slug: "psilocybin",
    title: "Psilocybin mushrooms",
    matchedVia: "drug_class",
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

function stubPlacementFetch(associations: ReplicationAssociation[]) {
  let currentAssociations = associations.map((association) => ({ ...association }));
  const associationGets: string[] = [];
  const associationPosts: PostBody[] = [];
  const galleryPosts: unknown[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/api/dev/replications/associations/spiral-bloom")) {
        if (init?.method === "POST") {
          const body = JSON.parse(String(init.body)) as PostBody;
          associationPosts.push(body);
          const excluded = new Set(body.excludedSubstanceSlugs);
          currentAssociations = currentAssociations.map((association) => ({
            ...association,
            excluded: excluded.has(association.slug),
          }));
          return new Response(
            JSON.stringify({
              ok: true,
              updated: body.excludedSubstanceSlugs,
              droppedCuratedPositions: [],
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        }
        associationGets.push(url);
        return new Response(JSON.stringify({ ok: true, associations: currentAssociations }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (url.endsWith("/api/dev/replications/substances")) {
        return new Response(
          JSON.stringify({
            substances: [
              {
                slug: "ketamine",
                title: "Ketamine",
                match_count: 0,
                curated: false,
                curated_count: 0,
                removed_count: 0,
              },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      if (url.endsWith("/api/dev/replications/substances/ketamine")) {
        if (init?.method === "POST") {
          galleryPosts.push(JSON.parse(String(init.body)));
          return new Response(
            JSON.stringify({
              ok: true,
              curated_slugs: ["spiral-bloom"],
              removed_slugs: [],
              pruned_curated: [],
              pruned_removed: [],
              updated_at: "2026-08-23T10:00:00.000Z",
              updated_by: "editor@example.com",
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        }
        return new Response(
          JSON.stringify({
            substance: { slug: "ketamine", title: "Ketamine" },
            matches: [],
            curation: null,
            effectOptions: [],
            unmatchedEffectNames: [],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      return new Response(JSON.stringify({ error: "Unexpected test request" }), { status: 404 });
    }),
  );
  return { associationGets, associationPosts, galleryPosts };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("ReplicationAssociationsPanel", () => {
  it("shows a skeleton first, then automatic drug placements with provenance", async () => {
    stubFetch();
    const { container } = render(<ReplicationAssociationsPanel row={ROW} />);

    expect(container.querySelectorAll(".theme-skeleton-pulse").length).toBeGreaterThan(0);

    expect(await screen.findByText("Showing on 3 of 3 drug articles")).toBeInTheDocument();
    expect(screen.getByText("3 showing · 0 excluded")).toBeInTheDocument();
    expect(screen.getByText("Associations saved")).toBeInTheDocument();

    const exact = within(screen.getByRole("list", { name: "Exact-drug placements" }));
    expect(exact.getByRole("checkbox", { name: "LSD" })).toBeChecked();
    expect(exact.getByRole("checkbox", { name: "DMT" })).toBeChecked();
    expect(exact.getAllByText("exact drug")).toHaveLength(2);

    const general = within(screen.getByRole("list", { name: "General class placements" }));
    expect(general.getByRole("checkbox", { name: "Psilocybin mushrooms" })).toBeChecked();
    expect(general.getByText("general class")).toBeInTheDocument();
    expect(general.getByText("Drifting")).toBeInTheDocument();
  });

  it("labels every checked automatic row as published and every unchecked row excluded", async () => {
    const user = userEvent.setup();
    stubFetch();
    render(<ReplicationAssociationsPanel row={ROW} />);

    await screen.findByText("Showing on 3 of 3 drug articles");

    expect(screen.getByTestId("association-state-lsd")).toHaveTextContent(
      "Showing · priority 2",
    );
    expect(screen.getByTestId("association-state-dmt")).toHaveTextContent(
      "Showing · automatic",
    );

    await user.click(screen.getByRole("checkbox", { name: "DMT" }));
    expect(screen.getByTestId("association-state-dmt")).toHaveTextContent("Excluded");
    expect(screen.getByText("Showing on 2 of 3 drug articles")).toBeInTheDocument();
  });

  it("publishes all automatic associations without stored priority", async () => {
    stubFetch({
      associations: ASSOCIATIONS.map((entry) => ({ ...entry, curatedPosition: null })),
    });
    render(<ReplicationAssociationsPanel row={ROW} />);

    expect(await screen.findByText("Showing on 3 of 3 drug articles")).toBeInTheDocument();
    expect(screen.getByText("3 showing · 0 excluded")).toBeInTheDocument();
    expect(screen.getAllByText("Showing · automatic")).toHaveLength(3);
  });

  it("warns when excluding a row that carries stored priority", async () => {
    const user = userEvent.setup();
    stubFetch();
    render(<ReplicationAssociationsPanel row={ROW} />);

    await screen.findByText("Showing on 3 of 3 drug articles");
    expect(screen.queryByTestId("curated-warning-lsd")).not.toBeInTheDocument();

    await user.click(screen.getByRole("checkbox", { name: "DMT" }));
    expect(screen.getByText("Unsaved changes")).toBeInTheDocument();
    expect(screen.queryByTestId("curated-warning-dmt")).not.toBeInTheDocument();
    expect(screen.queryByText(/Saving will drop/)).not.toBeInTheDocument();
    expect(screen.getByTestId("association-state-dmt")).toHaveTextContent("Excluded");
    expect(screen.getByText("Showing on 2 of 3 drug articles")).toBeInTheDocument();

    await user.click(screen.getByRole("checkbox", { name: "LSD" }));
    expect(screen.getByTestId("curated-warning-lsd")).toHaveTextContent(
      "priority 2 — unticking removes that position and excludes the work",
    );
    expect(
      screen.getByText(/Saving will drop 1 curated position: LSD \(position 2\)\./),
    ).toBeInTheDocument();
    expect(screen.getByText("1 showing · 2 excluded")).toBeInTheDocument();
    expect(screen.getByText("Showing on 1 of 3 drug articles")).toBeInTheDocument();
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

    await screen.findByText("Showing on 3 of 3 drug articles");
    await user.click(screen.getByRole("checkbox", { name: "LSD" }));
    await user.click(screen.getByRole("button", { name: "Save eligibility" }));

    await waitFor(() => expect(posts).toHaveLength(1));
    expect(posts[0]).toEqual({ excludedSubstanceSlugs: ["lsd"] });

    expect(
      await screen.findByText(
        /Saved eligibility\. Allowed on 2 of 3 drug articles \(1 article rewritten\)\. Dropped 1 curated position: LSD \(position 2\)\./,
      ),
    ).toBeInTheDocument();

    // The echo becomes the new baseline: clean, and the drop is no longer "at risk".
    await waitFor(() => expect(screen.getByText("Associations saved")).toBeInTheDocument());
    expect(screen.getByRole("button", { name: "Save eligibility" })).toBeDisabled();
    expect(screen.queryByTestId("curated-warning-lsd")).not.toBeInTheDocument();
    expect(screen.queryByText(/Saving will drop/)).not.toBeInTheDocument();
    expect(screen.getByText("Showing on 2 of 3 drug articles")).toBeInTheDocument();
    expect(screen.getByTestId("association-state-lsd")).toHaveTextContent("Excluded");
  });

  it("exclude all shown unticks every visible drug and posts them all", async () => {
    const user = userEvent.setup();
    const { posts } = stubFetch();
    render(<ReplicationAssociationsPanel row={ROW} />);

    await screen.findByText("Showing on 3 of 3 drug articles");
    await user.click(screen.getByRole("button", { name: "Exclude all shown" }));
    expect(screen.getByText("0 showing · 3 excluded")).toBeInTheDocument();
    expect(screen.getByText("Showing on 0 of 3 drug articles")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Save eligibility" }));
    await waitFor(() => expect(posts).toHaveLength(1));
    expect(posts[0]).toEqual({ excludedSubstanceSlugs: ["lsd", "dmt", "psilocybin"] });
  });


  it("renders exact-drug placement and names bulk controls by their consequences", async () => {
    stubFetch({
      associations: [
        {
          slug: "ketamine",
          title: "Ketamine",
          matchedVia: "specific_drug",
          effectSlug: "ketamine",
          effectName: "Ketamine",
          excluded: false,
          curatedPosition: null,
        },
      ],
    });
    render(<ReplicationAssociationsPanel row={ROW} />);

    expect(await screen.findByText("Showing on 1 of 1 drug article")).toBeInTheDocument();
    const exactMatches = within(
      screen.getByRole("list", { name: "Exact-drug placements" }),
    );
    expect(exactMatches.getByRole("checkbox", { name: "Ketamine" })).toBeChecked();
    expect(exactMatches.getByText("exact drug")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Allow all shown" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Exclude all shown" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Select all" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Select none" })).not.toBeInTheDocument();
  });

  it("places an unmatched replication directly without mutating effect tags", async () => {
    const user = userEvent.setup();
    const { galleryPosts } = stubPlacementFetch([]);
    render(<ReplicationAssociationsPanel row={ROW} />);

    await user.click(
      await screen.findByRole("combobox", {
        name: "Drugs to add this replication to. 0 selected",
      }),
    );
    await user.click(await screen.findByRole("option", { name: /Ketamine/ }));
    expect(await screen.findByText("Ready to add")).toBeInTheDocument();
    await user.keyboard("{Escape}");
    await user.click(screen.getByRole("button", { name: "Add to selected drugs" }));

    expect(await screen.findByText("Added")).toBeInTheDocument();
    expect(galleryPosts).toEqual([
      {
        curatedSlugs: ["spiral-bloom"],
        removedSlugs: [],
        expectedUpdatedAt: null,
      },
    ]);
  });

  it("blocks direct placement while eligibility is dirty until discard or save", async () => {
    const user = userEvent.setup();
    const { associationGets, associationPosts, galleryPosts } = stubPlacementFetch(ASSOCIATIONS);
    render(<ReplicationAssociationsPanel row={ROW} />);

    expect(await screen.findByText("Showing on 3 of 3 drug articles")).toBeInTheDocument();
    await user.click(
      screen.getByRole("combobox", {
        name: "Drugs to add this replication to. 0 selected",
      }),
    );
    await user.click(await screen.findByRole("option", { name: /Ketamine/ }));
    expect(await screen.findByText("Ready to add")).toBeInTheDocument();
    await user.keyboard("{Escape}");

    const placementPicker = screen.getByRole("combobox", {
      name: "Drugs to add this replication to. 1 selected",
    });
    const addButton = screen.getByRole("button", { name: "Add to selected drugs" });
    expect(placementPicker).toBeEnabled();
    expect(addButton).toBeEnabled();

    await user.click(screen.getByRole("checkbox", { name: "DMT" }));

    expect(placementPicker).toBeDisabled();
    expect(addButton).toBeDisabled();
    expect(
      screen.getByText("Save eligibility or Discard before placing this work."),
    ).toBeInTheDocument();
    await user.click(addButton);
    expect(galleryPosts).toHaveLength(0);
    expect(associationGets).toHaveLength(1);

    await user.click(screen.getByRole("button", { name: "Discard" }));
    expect(placementPicker).toBeEnabled();
    expect(addButton).toBeEnabled();
    expect(
      screen.queryByText("Save eligibility or Discard before placing this work."),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole("checkbox", { name: "DMT" }));
    await user.click(screen.getByRole("button", { name: "Save eligibility" }));
    await waitFor(() => expect(associationPosts).toHaveLength(1));
    await waitFor(() => expect(addButton).toBeEnabled());
    expect(placementPicker).toBeEnabled();

    await user.click(addButton);
    expect(await screen.findByText("Added")).toBeInTheDocument();
    await waitFor(() => expect(associationGets).toHaveLength(2));
    expect(galleryPosts).toHaveLength(1);
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
    expect(screen.queryByRole("button", { name: "Save eligibility" })).not.toBeInTheDocument();
  });

  it("surfaces a load failure with a working Retry", async () => {
    const user = userEvent.setup();
    let attempt = 0;
    const fetchMock = vi.fn(async () => {
      attempt += 1;
      if (attempt === 1) {
        return new Response(JSON.stringify({ error: "Postgres is unreachable." }), {
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

    expect(await screen.findByText("Postgres is unreachable.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /retry/i }));

    expect(await screen.findByText("Showing on 3 of 3 drug articles")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("reports a save failure without adopting the draft as saved", async () => {
    const user = userEvent.setup();
    stubFetch({
      onPost: () => ({ status: 400, payload: { error: "Substance slug list rejected." } }),
    });
    render(<ReplicationAssociationsPanel row={ROW} />);

    await screen.findByText("Showing on 3 of 3 drug articles");
    await user.click(screen.getByRole("checkbox", { name: "DMT" }));
    await user.click(screen.getByRole("button", { name: "Save eligibility" }));

    expect(await screen.findByText("Substance slug list rejected.")).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "DMT" })).not.toBeChecked();
    expect(screen.getByRole("button", { name: "Save eligibility" })).toBeEnabled();
  });
});
