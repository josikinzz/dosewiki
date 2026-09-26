import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next-auth/react", () => ({ signOut: vi.fn() }));
vi.mock("../../pages/useDevRailBadges", () => ({ useDevRailBadges: () => ({}), useDevRailBadgeReadings: () => ({}) }));

import type { NormalizedUserProfile } from "@/data/userProfiles";

import {
  expectRailMarksUnsaved,
  renderInDevShell,
  switchTabExpectingGuard,
} from "../../pages/devShellTestHarness";
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
function stubProfileApi(
  records: Record<string, EditorContributorProfile>,
  { works = [], status }: { works?: Array<Record<string, unknown>>; status?: number } = {},
) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const update = init?.method === "POST"
      ? JSON.parse(String(init.body)) as Partial<EditorContributorProfile>
      : null;
    const key = update?.key ?? new URL(String(input), "https://dose.wiki").searchParams.get("key") ?? "";
    const profile = records[key];
    if (!profile) {
      return Response.json({ error: `No contributor profile for "${key}".` }, { status: 404 });
    }
    if (update && status) {
      return Response.json({ error: "Someone saved this profile after you loaded it.", code: "PROFILE_CONFLICT" }, { status });
    }
    if (update) {
      records[key] = { ...profile, ...update };
      return Response.json({ ok: true });
    }
    return Response.json({ ok: true, profile, works, reports: [] });
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
    .map((item) => item.querySelector("[data-row-name]")?.textContent ?? "");
}

const scopeFilter = () => within(screen.getByRole("group", { name: "Scope" }));

/** Save asks first, naming what changed; this confirms it. */
async function saveThroughConfirm(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: /^Save profile/ }));
  const dialog = await screen.findByRole("dialog");
  await user.click(within(dialog).getByRole("button", { name: "Save profile" }));
}

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
    expect(screen.getByLabelText("Credit title")).toBeInTheDocument();
    // The account link is a People picker, not a typed email here.
    expect(screen.queryByLabelText("Membership email")).toBeNull();
    expect(screen.getByText("No linked account, so no member edits this profile themselves.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Link an account in People" })).toHaveAttribute("href", "/dev/people/ADA");
    expect(screen.getByLabelText("Add an alias")).toBeInTheDocument();
    expect(screen.getByLabelText("Archival profile")).toBeInTheDocument();
    expect(screen.getByLabelText("Note (markdown)")).toBeInTheDocument();
    expect(screen.getByText("Danger zone")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Works" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Reports" })).toBeInTheDocument();
  });

  it("names no particular person in the editor's own copy", async () => {
    stubProfileApi({ ADA: storedProfile("ADA", "Ada Lovelace") });
    renderTab();

    await waitFor(() => expect(screen.getByLabelText("Display name")).toHaveValue("Ada Lovelace"));
    const attribution = screen.getByLabelText("Attribution");
    expect(attribution.getAttribute("placeholder")).not.toMatch(/Josie/);
    // The rail lists every directory entry by name; the editor itself names nobody.
    const rail = screen.getByRole("listbox", { name: "Contributors" }).textContent ?? "";
    expect((document.body.textContent ?? "").replace(rail, "")).not.toMatch(/Josie/);
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
    expect(screen.getByRole("button", { name: /^Save profile/ })).toBeInTheDocument();
    expect(screen.queryByLabelText("Credit title")).toBeNull();
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
    await saveThroughConfirm(user);

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
      "Credit title",
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
    expect(screen.queryByRole("link", { name: /in People/ })).toBeNull();

    await user.clear(displayName);
    await user.type(displayName, "Josie K.");
    await saveThroughConfirm(user);

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
    const role = await screen.findByLabelText("Credit title");
    await waitFor(() => expect(screen.getByLabelText("Display name")).toHaveValue("Josie Kins"));

    expect(role).toBeEnabled();
    await user.type(role, "Founder");
    await user.click(screen.getByLabelText("Approved replicator"));
    await saveThroughConfirm(user);

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
      staffNote: null,
    });
    expect(JSON.parse(String(post?.[1]?.body))).not.toHaveProperty("membershipEmail");
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

  it("marks the rail and asks through the shell before a rail click drops unsaved profile changes", async () => {
    const user = userEvent.setup();
    stubProfileApi({
      ADA: storedProfile("ADA", "Ada Lovelace"),
      JOSIE: storedProfile("JOSIE", "Josie Kins"),
    });
    const add = vi.spyOn(window, "addEventListener");
    const { nav, onTabChange } = renderInDevShell(
      <ContributorsTab profiles={DIRECTORY} isDirectoryLoading={false} canEdit canApprove sessionProfileKey="JOSIE" />,
      { tab: "contributors" },
    );
    const displayName = await screen.findByLabelText("Display name");
    await waitFor(() => expect(displayName).toHaveValue("Ada Lovelace"));
    await user.type(displayName, " Byron");

    expectRailMarksUnsaved(nav, "Contributors");
    const dialog = switchTabExpectingGuard(nav, onTabChange);
    expect(within(dialog).getByText("Contributors: profile of Ada Lovelace")).toBeTruthy();
    // A profile save is live on the public page: the shell only discards.
    expect(within(dialog).queryByRole("button", { name: "Save" })).toBeNull();

    fireEvent.click(within(dialog).getByRole("button", { name: "Keep editing" }));
    expect(onTabChange).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Display name")).toHaveValue("Ada Lovelace Byron");

    fireEvent.click(within(switchTabExpectingGuard(nav, onTabChange)).getByRole("button", { name: "Discard" }));
    expect(onTabChange).toHaveBeenCalledWith("articles");
    await waitFor(() => expect(screen.getByLabelText("Display name")).toHaveValue("Ada Lovelace"));
    // The shell owns unload; the tool adds no listener of its own.
    expect(add.mock.calls.filter(([type]) => type === "beforeunload")).toHaveLength(1);
  });

  it("keeps the merge confirm locked until a searched destination is shown with its key and aliases", async () => {
    const user = userEvent.setup();
    stubProfileApi({
      ADA: storedProfile("ADA", "Ada Lovelace"),
      JOSIE: storedProfile("JOSIE", "Josie Kins"),
    });
    renderTab({ initialScope: "me" });
    await waitFor(() => expect(screen.getByLabelText("Display name")).toHaveValue("Josie Kins"));

    // The identity operations are folded shut until asked for.
    await user.click(screen.getByRole("button", { name: /Danger zone/ }));
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
  it("opens another member's record read only for an editor below admin, and their own for editing", async () => {
    const user = userEvent.setup();
    stubProfileApi({
      ADA: { ...storedProfile("ADA", "Ada Lovelace"), membershipEmail: "ada@example.org" },
      JOSIE: storedProfile("JOSIE", "Josie Kins"),
    });
    renderTab({ canApprove: false, viewerEmail: "josie@example.org" });

    await waitFor(() => expect(screen.getByLabelText("Display name")).toHaveValue("Ada Lovelace"));
    expect(screen.getByText(/Another member is linked to this profile, so only they or an admin can change it/)).toBeInTheDocument();
    expect(screen.getByLabelText("Display name")).toBeDisabled();
    expect(screen.queryByRole("button", { name: /^Save profile/ })).toBeNull();
    expect(screen.queryByRole("button", { name: "Save works order" })).toBeNull();
    // The identity operations are admin only on the route, so an editor reads why.
    expect(screen.getByText("Merging, retargeting bylines and deleting a profile are admin only.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Danger zone/ })).toBeNull();

    await user.click(within(screen.getByRole("listbox", { name: "Contributors" })).getByRole("option", { name: /Josie Kins/ }));
    await waitFor(() => expect(screen.getByLabelText("Display name")).toHaveValue("Josie Kins"));
    expect(screen.getByLabelText("Display name")).toBeEnabled();
    expect(screen.getByRole("button", { name: /^Save profile/ })).toBeInTheDocument();
  });

  it("names the changed parts before a save and never saves past the confirm, from the button or Cmd+S", async () => {
    const user = userEvent.setup();
    const fetchMock = stubProfileApi({ ADA: storedProfile("ADA", "Ada Lovelace") });
    renderTab();
    const displayName = await screen.findByLabelText("Display name");
    await waitFor(() => expect(displayName).toHaveValue("Ada Lovelace"));

    await user.type(displayName, " Byron");
    await user.click(screen.getByLabelText("Archival profile"));
    await user.keyboard("{Meta>}s{/Meta}");
    const dialog = await screen.findByRole("dialog", { name: "Save Ada Lovelace Byron?" });
    expect(dialog).toHaveTextContent("You changed the name and archival flag.");
    expect(dialog).toHaveTextContent("Archival profile: off to on.");
    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === "POST")).toBe(false);

    await saveThroughConfirm(user);
    await waitFor(() => expect(fetchMock.mock.calls.some(([, init]) => init?.method === "POST")).toBe(true));
    expect(await screen.findByText(/Saved Ada Lovelace Byron\. The public contributor page shows it now\./)).toBeInTheDocument();
  });

  it("holds Save while a link is half filled and says which row", async () => {
    const user = userEvent.setup();
    stubProfileApi({ ADA: storedProfile("ADA", "Ada Lovelace") });
    renderTab();
    await waitFor(() => expect(screen.getByLabelText("Display name")).toHaveValue("Ada Lovelace"));

    await user.click(screen.getByRole("button", { name: "Add link" }));
    await user.type(screen.getByLabelText("Link 1 label"), "Shop");

    expect(screen.getByRole("button", { name: /^Save profile/ })).toBeDisabled();
    expect(screen.getByText("Link 1: Add the address this link opens.")).toBeInTheDocument();
    await user.type(screen.getByLabelText("Link 1 URL"), "https://shop.example.org");
    expect(screen.getByRole("button", { name: /^Save profile/ })).toBeEnabled();
  });

  it("offers the latest version after a conflict, behind a confirm", async () => {
    const user = userEvent.setup();
    const fetchMock = stubProfileApi({ ADA: storedProfile("ADA", "Ada Lovelace") }, { status: 409 });
    renderTab();
    const displayName = await screen.findByLabelText("Display name");
    await waitFor(() => expect(displayName).toHaveValue("Ada Lovelace"));

    await user.type(displayName, " Byron");
    await saveThroughConfirm(user);
    expect(await screen.findByText("Someone saved this profile after you opened it.")).toBeInTheDocument();
    expect(displayName).toHaveValue("Ada Lovelace Byron");

    const reads = () => fetchMock.mock.calls.filter(([, init]) => init?.method !== "POST").length;
    const before = reads();
    await user.click(screen.getByRole("button", { name: "Load the latest version" }));
    const dialog = await screen.findByRole("dialog", { name: "Load the latest version?" });
    await user.click(within(dialog).getByRole("button", { name: "Load latest" }));
    await waitFor(() => expect(screen.getByLabelText("Display name")).toHaveValue("Ada Lovelace"));
    expect(reads()).toBe(before + 1);
    expect(await screen.findByText("Loaded the latest version. Apply your edits again, then save.")).toBeInTheDocument();
  });

  it("opens the profile a deep link names, by key or alias, and says when none answers", async () => {
    stubProfileApi({ ADA: storedProfile("ADA", "Ada Lovelace"), JOSIE: storedProfile("JOSIE", "Josie Kins") });
    const { unmount } = renderTab({ initialKey: "josie" });
    await waitFor(() => expect(screen.getByLabelText("Display name")).toHaveValue("Josie Kins"));
    unmount();

    renderTab({ initialKey: "countess" });
    await waitFor(() => expect(screen.getByLabelText("Display name")).toHaveValue("Ada Lovelace"));
  });

  it("warns about a deep link no profile answers to and drops it from the address", async () => {
    stubProfileApi({ ADA: storedProfile("ADA", "Ada Lovelace") });
    const replaceState = vi.spyOn(window.history, "replaceState");
    renderTab({ initialKey: "nobody" });
    expect(await screen.findByText('No profile answers to "nobody".')).toBeInTheDocument();
    await waitFor(() => expect(replaceState).toHaveBeenLastCalledWith(window.history.state, "", "/dev/contributors"));
  });

  it("saves a curated order from its own panel and says so there", async () => {
    const user = userEvent.setup();
    const fetchMock = stubProfileApi(
      { ADA: { ...storedProfile("ADA", "Ada Lovelace"), orderingRevision: "a".repeat(64) } },
      { works: [{ slug: "work-1", title: "First work", artist: "Ada", role: "replication", type: "image", effectSlug: null, createdAt: null, thumbnailUrl: null }] },
    );
    renderTab();
    await waitFor(() => expect(screen.getByLabelText("Display name")).toHaveValue("Ada Lovelace"));

    await user.click(screen.getByRole("button", { name: "Curate First work" }));
    await user.click(screen.getByRole("button", { name: "Save works order" }));
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith("/api/dev/contributor-profile/ordering", expect.objectContaining({ method: "POST" })),
    );
    const works = screen.getByRole("heading", { name: "Works" }).closest("section") as HTMLElement;
    expect(await within(works).findByText("Order saved. The contributor page shows it now.")).toBeInTheDocument();
  });
});
