import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import type { NormalizedUserProfile } from "@/data/userProfiles";

import { ContributorsTab } from "./ContributorsTab";
import type { EditorContributorProfile } from "./contributorsModel";

// cmdk scrolls the active item into view; jsdom has no scrollIntoView.
beforeAll(() => {
  Element.prototype.scrollIntoView ??= () => {};
});

const directoryEntry = (key: string, displayName: string, aliases: string[] = []): NormalizedUserProfile => ({
  key,
  displayName,
  aliases,
  avatarUrl: null,
  bio: "",
  links: [],
  hasCustomBio: false,
});

// Aliases are stored normalized (lowercase), as `normalizeProfiles` emits them.
const DIRECTORY: NormalizedUserProfile[] = [
  directoryEntry("ADA", "Ada Lovelace", ["countess"]),
  directoryEntry("JOSIE", "Josie Kins"),
];

const storedProfile = (key: string, displayName: string): EditorContributorProfile => ({
  key,
  displayName,
  aliases: [],
  bio: "A bio.",
  role: null,
  links: [],
  membershipEmail: null,
  avatarUrl: null,
  avatarStorageId: null,
  storedAvatarUrl: null,
  replicationOrder: [],
  reportOrder: [],
  exclude_from_gallery: false,
  archival: false,
  approved_replicator: false,
  staffNote: null,
  updatedAt: null,
  updatedBy: null,
});

/** Records the route serves, keyed by the profile key the tab asks for. */
function stubProfileApi(records: Record<string, EditorContributorProfile>) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const update = init?.method === "POST"
      ? JSON.parse(String(init.body)) as Partial<EditorContributorProfile>
      : null;
    const key = update?.key ?? new URL(String(input), "https://dose.wiki").searchParams.get("key") ?? "";
    const profile = records[key];
    if (!profile) {
      return Response.json({ error: `No contributor profile for "${key}".` }, { status: 404 });
    }
    if (update) {
      records[key] = { ...profile, ...update };
      return Response.json({ ok: true });
    }
    return Response.json({ ok: true, profile, works: [], reports: [] });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function renderTab(props: Partial<Parameters<typeof ContributorsTab>[0]> = {}) {
  return render(
    <ContributorsTab
      profiles={DIRECTORY}
      isDirectoryLoading={false}
      canEdit
      canApprove
      sessionProfileKey="JOSIE"
      {...props}
    />,
  );
}

/** Display names in the rail, in render order. */
function railNames(): string[] {
  return within(screen.getByRole("listbox", { name: "Contributors" }))
    .getAllByRole("option")
    .map((item) => item.querySelector("span > span")?.textContent ?? "");
}

const scopeFilter = () => within(screen.getByRole("group", { name: "Scope" }));

describe("ContributorsTab", () => {
  beforeEach(() => {
    window.history.replaceState(null, "", "/dev/contributors");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("narrows the rail to the signed-in record on Just me and writes the scope to the URL", async () => {
    const user = userEvent.setup();
    const fetchMock = stubProfileApi({
      ADA: storedProfile("ADA", "Ada Lovelace"),
      JOSIE: storedProfile("JOSIE", "Josie Kins"),
    });
    const replaceState = vi.spyOn(window.history, "replaceState");
    renderTab();

    await waitFor(() => expect(screen.getByLabelText("Display name")).toHaveValue("Ada Lovelace"));
    expect(railNames()).toEqual(["Ada Lovelace", "Josie Kins"]);
    expect(scopeFilter().getByRole("button", { name: "All" })).toHaveAttribute("aria-pressed", "true");
    expect(replaceState).not.toHaveBeenCalled();

    await user.click(scopeFilter().getByRole("button", { name: "Just me" }));

    expect(railNames()).toEqual(["Josie Kins"]);
    await waitFor(() => expect(screen.getByLabelText("Display name")).toHaveValue("Josie Kins"));
    expect(fetchMock).toHaveBeenLastCalledWith("/api/dev/contributor-profile?key=JOSIE");
    expect(replaceState).toHaveBeenLastCalledWith(null, "", "/dev/contributors?scope=me");

    await user.click(scopeFilter().getByRole("button", { name: "All" }));

    expect(railNames()).toEqual(["Ada Lovelace", "Josie Kins"]);
    expect(replaceState).toHaveBeenLastCalledWith(null, "", "/dev/contributors");
  });

  it("opens on the scope the route names without rewriting the URL", async () => {
    stubProfileApi({ JOSIE: storedProfile("JOSIE", "Josie Kins") });
    const replaceState = vi.spyOn(window.history, "replaceState");
    renderTab({ initialScope: "me" });

    await waitFor(() => expect(screen.getByLabelText("Display name")).toHaveValue("Josie Kins"));
    expect(railNames()).toEqual(["Josie Kins"]);
    expect(scopeFilter().getByRole("button", { name: "Just me" })).toHaveAttribute("aria-pressed", "true");
    expect(replaceState).not.toHaveBeenCalled();
  });

  it("finds the signed-in record through an alias, the way the profile editor did", async () => {
    stubProfileApi({ ADA: storedProfile("ADA", "Ada Lovelace") });
    renderTab({ initialScope: "me", sessionProfileKey: "countess" });

    await waitFor(() => expect(screen.getByLabelText("Display name")).toHaveValue("Ada Lovelace"));
    expect(railNames()).toEqual(["Ada Lovelace"]);
  });

  it("shows an editor every field on a record", async () => {
    stubProfileApi({ ADA: storedProfile("ADA", "Ada Lovelace") });
    renderTab();

    await waitFor(() => expect(screen.getByLabelText("Display name")).toHaveValue("Ada Lovelace"));
    expect(screen.getByLabelText("Role")).toBeInTheDocument();
    expect(screen.getByLabelText("Membership email")).toBeInTheDocument();
    expect(screen.getByLabelText("Add an alias")).toBeInTheDocument();
    expect(screen.getByLabelText("Archival profile")).toBeInTheDocument();
    expect(screen.getByLabelText("Note (markdown)")).toBeInTheDocument();
    expect(screen.getByText("Danger zone")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Works" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Reports" })).toBeInTheDocument();
  });

  it("shows a contributor without editor role only their own record and no admin fields", async () => {
    const fetchMock = stubProfileApi({
      ADA: storedProfile("ADA", "Ada Lovelace"),
      JOSIE: storedProfile("JOSIE", "Josie Kins"),
    });
    renderTab({ canEdit: false, sessionProfileKey: "JOSIE" });

    await waitFor(() => expect(screen.getByLabelText("Display name")).toHaveValue("Josie Kins"));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith("/api/dev/contributor-profile?key=JOSIE");

    // No way to reach anyone else: no scope switch, no search, no rail.
    expect(screen.queryByRole("group", { name: "Scope" })).toBeNull();
    expect(screen.queryByLabelText("Search")).toBeNull();
    expect(screen.queryByRole("listbox", { name: "Contributors" })).toBeNull();
    expect(screen.queryByText("Ada Lovelace")).toBeNull();

    // The self-serve field set, and nothing an editor curates.
    expect(screen.getByRole("heading", { name: "Avatar" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Bio" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Links" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save profile" })).toBeInTheDocument();
    expect(screen.queryByLabelText("Role")).toBeNull();
    expect(screen.queryByLabelText("Membership email")).toBeNull();
    expect(screen.queryByLabelText("Add an alias")).toBeNull();
    expect(screen.queryByLabelText("Exclude from the Replications gallery")).toBeNull();
    expect(screen.queryByLabelText("Archival profile")).toBeNull();
    expect(screen.queryByLabelText("Note (markdown)")).toBeNull();
    expect(screen.queryByText("Danger zone")).toBeNull();
    // Curation order saves through the editor-only route, so the panels stay hidden too.
    expect(screen.queryByRole("heading", { name: "Works" })).toBeNull();
    expect(screen.queryByRole("heading", { name: "Reports" })).toBeNull();
  });

  it("sends only the self-serve fields when a contributor saves", async () => {
    const user = userEvent.setup();
    const fetchMock = stubProfileApi({ JOSIE: storedProfile("JOSIE", "Josie Kins") });
    renderTab({ canEdit: false, sessionProfileKey: "JOSIE" });
    const displayName = await screen.findByLabelText("Display name");
    await waitFor(() => expect(displayName).toHaveValue("Josie Kins"));

    await user.clear(displayName);
    await user.type(displayName, "Josie K.");
    await user.click(screen.getByRole("button", { name: "Save profile" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/dev/contributor-profile",
        expect.objectContaining({ method: "POST" }),
      );
    });
    const post = fetchMock.mock.calls.find(([, init]) => init?.method === "POST");
    const body = JSON.parse(String(post?.[1]?.body)) as Record<string, unknown>;
    expect(body).toMatchObject({ key: "JOSIE", displayName: "Josie K." });
    for (const field of [
      "aliases", "role", "membershipEmail", "exclude_from_gallery", "archival",
      "approved_replicator", "staffNote", "replicationOrder", "reportOrder",
    ]) {
      expect(body).not.toHaveProperty(field);
    }
  });

  it("shows an editor the trust fields disabled with the reason, and never sends them", async () => {
    const user = userEvent.setup();
    const fetchMock = stubProfileApi({ JOSIE: storedProfile("JOSIE", "Josie Kins") });
    renderTab({ canApprove: false, initialScope: "me" });
    const displayName = await screen.findByLabelText("Display name");
    await waitFor(() => expect(displayName).toHaveValue("Josie Kins"));

    const reason = "Admin only: an editor can see this but not change it.";
    for (const label of [
      "Role",
      "Membership email",
      "Exclude from the Replications gallery",
      "Archival profile",
      "Approved replicator",
      "Note (markdown)",
      "Attribution",
    ]) {
      const control = screen.getByLabelText(label);
      expect(control).toBeDisabled();
      expect(control).toHaveAttribute("title", reason);
    }
    expect(screen.getAllByText(reason).length).toBeGreaterThan(0);

    await user.clear(displayName);
    await user.type(displayName, "Josie K.");
    await user.click(screen.getByRole("button", { name: "Save profile" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/dev/contributor-profile",
        expect.objectContaining({ method: "POST" }),
      );
    });
    const post = fetchMock.mock.calls.find(([, init]) => init?.method === "POST");
    const body = JSON.parse(String(post?.[1]?.body)) as Record<string, unknown>;
    expect(body).toMatchObject({ key: "JOSIE", displayName: "Josie K." });
    for (const field of [
      "role", "membershipEmail", "exclude_from_gallery", "archival",
      "approved_replicator", "staffNote",
    ]) {
      expect(body).not.toHaveProperty(field);
    }
  });

  it("lets an admin edit the trust fields and sends them", async () => {
    const user = userEvent.setup();
    const fetchMock = stubProfileApi({ JOSIE: storedProfile("JOSIE", "Josie Kins") });
    renderTab({ initialScope: "me" });
    const role = await screen.findByLabelText("Role");
    await waitFor(() => expect(screen.getByLabelText("Display name")).toHaveValue("Josie Kins"));

    expect(role).toBeEnabled();
    await user.type(role, "Founder");
    await user.click(screen.getByLabelText("Approved replicator"));
    await user.click(screen.getByRole("button", { name: "Save profile" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/dev/contributor-profile",
        expect.objectContaining({ method: "POST" }),
      );
    });
    const post = fetchMock.mock.calls.find(([, init]) => init?.method === "POST");
    expect(JSON.parse(String(post?.[1]?.body))).toMatchObject({
      key: "JOSIE",
      role: "Founder",
      approved_replicator: true,
      membershipEmail: null,
      staffNote: null,
    });
  });

  it("renders the rail as a bounded listbox and counts the rows a search leaves", async () => {
    const user = userEvent.setup();
    stubProfileApi({
      ADA: storedProfile("ADA", "Ada Lovelace"),
      JOSIE: storedProfile("JOSIE", "Josie Kins"),
    });
    renderTab();
    await waitFor(() => expect(screen.getByLabelText("Display name")).toHaveValue("Ada Lovelace"));

    const rail = screen.getByRole("listbox", { name: "Contributors" });
    expect(rail.style.maxHeight).not.toBe("");
    expect(within(rail).getAllByRole("option")).toHaveLength(2);
    expect(screen.getByText("2 profiles")).toBeInTheDocument();

    await user.type(screen.getByLabelText("Search"), "countess");

    expect(railNames()).toEqual(["Ada Lovelace"]);
    expect(screen.getByText("1 of 2 profiles")).toBeInTheDocument();
  });

  it("asks before a rail click drops unsaved profile changes", async () => {
    const user = userEvent.setup();
    const fetchMock = stubProfileApi({
      ADA: storedProfile("ADA", "Ada Lovelace"),
      JOSIE: storedProfile("JOSIE", "Josie Kins"),
    });
    renderTab();
    const displayName = await screen.findByLabelText("Display name");
    await waitFor(() => expect(displayName).toHaveValue("Ada Lovelace"));

    await user.type(displayName, " Byron");
    const josieRow = within(screen.getByRole("listbox", { name: "Contributors" })).getByRole(
      "option",
      { name: /Josie Kins/ },
    );

    await user.click(josieRow);
    const dialog = await screen.findByRole("dialog", { name: "Leave this profile?" });
    await user.click(within(dialog).getByRole("button", { name: "Keep editing" }));

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByLabelText("Display name")).toHaveValue("Ada Lovelace Byron");
    expect(fetchMock).not.toHaveBeenCalledWith("/api/dev/contributor-profile?key=JOSIE");

    await user.click(josieRow);
    await user.click(
      within(await screen.findByRole("dialog")).getByRole("button", { name: "Discard changes" }),
    );

    await waitFor(() => expect(screen.getByLabelText("Display name")).toHaveValue("Josie Kins"));
    expect(fetchMock).toHaveBeenCalledWith("/api/dev/contributor-profile?key=JOSIE");
  });

  it("keeps the merge confirm locked until a searched destination is shown with its key and aliases", async () => {
    const user = userEvent.setup();
    stubProfileApi({
      ADA: storedProfile("ADA", "Ada Lovelace"),
      JOSIE: storedProfile("JOSIE", "Josie Kins"),
    });
    renderTab({ initialScope: "me" });
    await waitFor(() => expect(screen.getByLabelText("Display name")).toHaveValue("Josie Kins"));

    const confirm = screen.getByLabelText("Confirm by typing JOSIE", { selector: "#contributor-merge-confirm" });
    expect(confirm).toBeDisabled();
    expect(screen.queryByRole("combobox", { name: "Destination profile" })).not.toBeNull();
    expect(screen.queryByRole("option", { name: /Ada Lovelace/ })).toBeNull();

    fireEvent.click(screen.getByRole("combobox", { name: "Destination profile" }));
    fireEvent.change(await screen.findByPlaceholderText("Search by name, key, or alias"), {
      target: { value: "countess" },
    });
    fireEvent.click(await screen.findByRole("option", { name: /Ada Lovelace/ }));

    const card = screen.getByTestId("contributor-merge-destination");
    expect(card).toHaveTextContent("Ada Lovelace");
    expect(card).toHaveTextContent("(ADA)");
    expect(card).toHaveTextContent("countess");
    expect(confirm).toBeEnabled();
    expect(screen.getByRole("button", { name: "Merge and delete this profile" })).toBeDisabled();

    await user.type(confirm, "JOSIE");
    expect(screen.getByRole("button", { name: "Merge and delete this profile" })).toBeEnabled();
  });
});
