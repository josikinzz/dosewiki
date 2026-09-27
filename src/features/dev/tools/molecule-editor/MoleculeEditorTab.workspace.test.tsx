import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import {
  compareInchiMock,
  installMoleculeEditorTestHarness,
  seedExampleSubstance,
  stubMoleculeEditorFetch,
  stubOverrideFetch,
  useQueryMock,
} from "./MoleculeEditorTab.testHarness";
import { MoleculeEditorTab } from "./MoleculeEditorTab";

function postCalls(fetchSpy: ReturnType<typeof stubMoleculeEditorFetch>) {
  return fetchSpy.mock.calls.filter(([url, init]) => url === "/api/dev/molecule-override" && init?.method === "POST");
}

async function openExampleWithEdit() {
  render(<MoleculeEditorTab initialSlug="substances/example" />);
  const user = userEvent.setup();
  await waitFor(() =>
    expect(screen.getByTestId("ocl-editor")).toHaveAttribute("data-source", "saved molblock"),
  );
  await user.click(screen.getByRole("button", { name: "Emit rotation" }));
  await waitFor(() => expect(screen.getByRole("button", { name: "Save depiction" })).toBeEnabled());
  return user;
}

describe("MoleculeEditorTab workspace", () => {
  installMoleculeEditorTestHarness();

  it("keeps a failed list read inside the tool with Try again", async () => {
    useQueryMock.mockReturnValue(undefined);
    const fetchSpy = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.startsWith("/api/dev/molecule-editor?")) return Promise.resolve(new Response("{}", { status: 500 }));
      if (url.startsWith("/api/dev/molecule-class-template")) return Promise.resolve(Response.json({ templates: [] }));
      return Promise.reject(new Error(url));
    });
    vi.stubGlobal("fetch", fetchSpy);
    render(<MoleculeEditorTab />);
    expect(await screen.findByText("Could not load the substances")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Molecules" })).toBeInTheDocument();
  });

  it("asks before Cmd+S publishes, and Cancel writes nothing", async () => {
    compareInchiMock.mockReturnValue({ match: true });
    seedExampleSubstance();
    const fetchSpy = stubOverrideFetch();
    const user = await openExampleWithEdit();

    fireEvent.keyDown(window, { key: "s", metaKey: true });
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Live now")).toBeInTheDocument();
    expect(within(dialog).getByText("After publishing")).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(postCalls(fetchSpy)).toHaveLength(0);
    expect(screen.getByText("Unsaved changes")).toBeInTheDocument();
  });

  it("reads a frozen write as the freeze and keeps the edit", async () => {
    compareInchiMock.mockReturnValue({ match: true });
    seedExampleSubstance();
    const fetchSpy = stubOverrideFetch();
    const serve = fetchSpy.getMockImplementation();
    fetchSpy.mockImplementation((input, init) => {
      if (String(input) === "/api/dev/molecule-override" && init?.method === "POST") {
        return Promise.resolve(Response.json({ error: "DATA_WRITES_FROZEN is set.", code: "DATA_WRITES_FROZEN" }, { status: 503 }));
      }
      return serve!(input, init);
    });
    const user = await openExampleWithEdit();
    await user.click(screen.getByRole("button", { name: "Save depiction" }));
    await user.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Publish depiction" }));
    expect(await screen.findByText(/Writes are paused, so your changes were not published/)).toBeInTheDocument();
    expect(screen.queryByText(/DATA_WRITES_FROZEN/)).not.toBeInTheDocument();
    expect(screen.getByText("Unsaved changes")).toBeInTheDocument();
  });

  it("filters the list to what still needs a look", async () => {
    useQueryMock.mockImplementation((query) =>
      query === "moleculeOverrides:listSlugs"
        ? [{ slug: "seeded", source: "seeded" }, { slug: "edited", source: "editor" }]
        : undefined,
    );
    stubMoleculeEditorFetch({
      picker: ["seeded", "edited", "missing"].map((slug) => ({
        slug,
        title: slug.toUpperCase(),
        priority: "normal",
        index_categories: ["substance"],
        classification: null,
        hasOverride: slug !== "missing",
      })),
    });
    render(<MoleculeEditorTab />);
    const user = userEvent.setup();
    expect(await screen.findByText("3 substances, 1 edited")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /^To do/ }));
    expect(screen.getByText("SEEDED")).toBeInTheDocument();
    expect(screen.getByText("MISSING")).toBeInTheDocument();
    expect(screen.queryByText("EDITED")).not.toBeInTheDocument();
  });
  it("loads the latest version after a conflict, dropping the edit only after a confirm", async () => {
    compareInchiMock.mockReturnValue({ match: true });
    seedExampleSubstance();
    const fetchSpy = stubOverrideFetch();
    const serve = fetchSpy.getMockImplementation();
    let theirs = false;
    fetchSpy.mockImplementation((input, init) => {
      const url = String(input);
      if (url === "/api/dev/molecule-override" && init?.method === "POST") {
        theirs = true;
        return Promise.resolve(Response.json({ error: "Conflict", conflict: { updatedBy: "OTHER" } }, { status: 409 }));
      }
      if (theirs && url.startsWith("/api/dev/molecule-override?slug=example")) {
        return Promise.resolve(Response.json({ ok: true, override: { slug: "example", molblock: "their molblock", svg: "<svg />", updatedAt: "2026-09-01T00:00:00.000Z" } }));
      }
      return serve!(input, init);
    });
    const user = await openExampleWithEdit();
    await user.click(screen.getByRole("button", { name: "Save depiction" }));
    await user.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Publish depiction" }));
    await user.click(await screen.findByRole("button", { name: "Load the latest version" }));
    await user.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Drop my edits and load" }));
    await waitFor(() =>
      expect(screen.getByTestId("ocl-editor")).toHaveAttribute("data-source", "their molblock"),
    );
    await waitFor(() => expect(screen.queryByText("Unsaved changes")).not.toBeInTheDocument());
    expect(postCalls(fetchSpy)).toHaveLength(1);
  });
});

