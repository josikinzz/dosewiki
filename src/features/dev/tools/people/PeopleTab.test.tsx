import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next-auth/react", () => ({ signOut: vi.fn() }));
vi.mock("../../pages/useDevRailBadges", () => ({ useDevRailBadges: () => ({}), useDevRailBadgeReadings: () => ({}) }));
vi.mock("../members/InviteCodesPanel", () => ({
  default: () => <div data-testid="invite-codes-panel">invite codes</div>,
}));

import type { NormalizedUserProfile } from "@/data/userProfiles";

import { expectRailMarksUnsaved, renderInDevShell, switchTabExpectingGuard } from "../../pages/devShellTestHarness";
import type { EditorContributorProfile } from "../contributors/contributorsModel";
import type { MemberRow } from "../members/membersModel";
import { PeopleTab } from "./PeopleTab";
import type { ProfileLink } from "./peopleModel";

// cmdk scrolls the active item into view; jsdom has no scrollIntoView.
beforeAll(() => {
  Element.prototype.scrollIntoView ??= () => {};
});

const SELF = "josie@example.com";

const ROSTER: MemberRow[] = [
  { email: "ada@example.com", username: "ada", name: "Ada", role: "editor", invitedBy: SELF, lastSeenAt: "2026-08-02T10:00:00.000Z" },
  { email: SELF, username: "josie", name: "Josie", role: "admin" },
  { email: "lyrea@example.com", username: "lyrea", role: "admin" },
  { email: "bob@example.com", username: "bob", role: "contributor", bannedAt: "2026-08-01T00:00:00.000Z" },
];

const entry = (key: string, displayName: string): NormalizedUserProfile => ({
  key,
  displayName,
  aliases: [],
  avatarUrl: null,
  bio: "",
  links: [],
  hasCustomBio: false,
});

const DIRECTORY = [entry("ADA", "Ada Lovelace"), entry("JOSIE", "Josie Kins"), entry("ZED", "Zed Artist")];

const stored = (key: string, displayName: string, membershipEmail: string | null): EditorContributorProfile => ({
  key,
  displayName,
  aliases: [],
  bio: "A bio.",
  role: null,
  links: [],
  membershipEmail,
  avatarUrl: null,
  avatarStorageId: null,
  storedAvatarUrl: null,
  replicationOrder: [],
  reportOrder: [],
  exclude_from_gallery: false,
  archival: false,
  approved_replicator: false,
  staffNote: null,
  updatedAt: "2026-09-01T00:00:00.000Z",
  updatedBy: null,
});

type Call = { path: string; body: Record<string, unknown> };

/**
 * Serves `/api/dev/people`, the profile read, and every write. A profile POST
 * that names a membership email moves the link the next people read returns.
 */
function stubApi({ members = ROSTER, links = [{ key: "ADA", membershipEmail: "ada@example.com" }] }: { members?: MemberRow[]; links?: ProfileLink[] } = {}) {
  const calls: Call[] = [];
  let currentLinks = [...links];
  const records: Record<string, EditorContributorProfile> = {
    ADA: stored("ADA", "Ada Lovelace", "ada@example.com"),
    JOSIE: stored("JOSIE", "Josie Kins", null),
    ZED: stored("ZED", "Zed Artist", null),
  };
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input), "https://dev.dose.wiki");
    if (init?.method !== "POST") {
      if (url.pathname === "/api/dev/people") return Response.json({ ok: true, self: SELF, members, links: currentLinks });
      const profile = records[url.searchParams.get("key") ?? ""];
      return profile
        ? Response.json({ ok: true, profile, works: [], reports: [] })
        : Response.json({ error: "No contributor profile." }, { status: 404 });
    }
    const body = JSON.parse(String(init.body)) as Record<string, unknown>;
    calls.push({ path: url.pathname, body });
    if (url.pathname === "/api/dev/contributor-profile" && "membershipEmail" in body) {
      const key = String(body.key);
      currentLinks = currentLinks.filter((link) => link.key !== key);
      if (typeof body.membershipEmail === "string") currentLinks.push({ key, membershipEmail: body.membershipEmail });
    }
    if (url.pathname.endsWith("/reset")) return Response.json({ ok: true, resetPath: "/reset-password?token=abc123" });
    return Response.json({ ok: true });
  });
  vi.stubGlobal("fetch", fetchMock);
  return { calls, fetchMock };
}

function renderTab(props: Partial<Parameters<typeof PeopleTab>[0]> = {}) {
  return render(<PeopleTab profiles={DIRECTORY} isDirectoryLoading={false} sessionProfileKey="JOSIE" {...props} />);
}

const list = () => within(screen.getByRole("listbox", { name: "People" }));
const accountPanel = () => within(screen.getByRole("region", { name: "Account" }));
const profilePanel = () => within(screen.getByRole("region", { name: "Public profile" }));

async function openPerson(user: ReturnType<typeof userEvent.setup>, name: RegExp) {
  const people = await screen.findByRole("listbox", { name: "People" });
  await user.click(await within(people).findByRole("option", { name }));
}

describe("PeopleTab", () => {
  beforeEach(() => {
    vi.stubGlobal("location", { ...window.location, origin: "https://dev.dose.wiki" });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("shows a person's account beside their public profile", async () => {
    const user = userEvent.setup();
    stubApi();
    renderTab();
    expect(screen.getByTestId("invite-codes-panel")).toBeTruthy();

    await openPerson(user, /^ada/);

    expect(accountPanel().getByText("ada@example.com")).toBeTruthy();
    expect(accountPanel().getByRole("checkbox", { name: "Editor" })).toBeChecked();
    expect(accountPanel().getByRole("button", { name: "Ban" })).toBeEnabled();
    expect(accountPanel().getByRole("button", { name: "Reset password" })).toBeEnabled();
    await waitFor(() => expect(profilePanel().getByLabelText("Display name")).toHaveValue("Ada Lovelace"));
    expect(profilePanel().getByText(/Linked to/)).toHaveTextContent("Linked to ada@example.com");
    // The link is a picker and an Unlink button, never a typed email.
    expect(screen.queryByLabelText("Membership email")).toBeNull();
  });

  it("flags an unlinked profile and an account with no profile", async () => {
    const user = userEvent.setup();
    stubApi();
    renderTab();

    await user.click(await screen.findByRole("button", { name: /^Needs a link/ }));
    const zed = await list().findByRole("option", { name: /Zed Artist/ });
    expect(zed).toHaveTextContent("Unlinked profile");
    expect(list().getByRole("option", { name: /^bob/ })).toHaveTextContent("No public profile");
    expect(list().queryByRole("option", { name: /^ada/ })).toBeNull();

    await user.click(zed);
    expect(accountPanel().getByText("No account is linked to this profile, so no member edits it themselves.")).toBeTruthy();
    await waitFor(() => expect(profilePanel().getByLabelText("Display name")).toHaveValue("Zed Artist"));
  });

  it("links a profile to an account from the picker, only after the confirm", async () => {
    const user = userEvent.setup();
    const { calls } = stubApi();
    renderTab();

    await openPerson(user, /^bob/);
    expect(profilePanel().getByText(/No public profile is linked/)).toBeTruthy();
    const linkButton = profilePanel().getByRole("button", { name: "Link profile" });
    expect(linkButton).toBeDisabled();

    await user.click(profilePanel().getByRole("combobox", { name: "Link a profile" }));
    // Only profiles nobody holds are offered.
    const picker = within(await waitFor(() => document.querySelector("[cmdk-list]") as HTMLElement));
    await picker.findByRole("option", { name: /Zed Artist/ });
    expect(picker.queryByRole("option", { name: /Ada Lovelace/ })).toBeNull();
    await user.click(picker.getByRole("option", { name: /Zed Artist/ }));
    await user.click(linkButton);

    const confirm = await screen.findByRole("dialog", { name: "Link Zed Artist to bob?" });
    expect(calls).toHaveLength(0);
    await user.click(within(confirm).getByRole("button", { name: "Link" }));

    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]).toEqual({
      path: "/api/dev/contributor-profile",
      body: { key: "ZED", expectedUpdatedAt: "2026-09-01T00:00:00.000Z", membershipEmail: "bob@example.com" },
    });
    expect(await screen.findByText("Zed Artist is linked to bob. They can edit it when signed in.")).toBeTruthy();
    await waitFor(() => expect(profilePanel().getByLabelText("Display name")).toHaveValue("Zed Artist"));
    expect(list().getByRole("option", { name: /^bob/ })).not.toHaveTextContent("No public profile");
  });

  it("unlinks with a destructive confirm", async () => {
    const user = userEvent.setup();
    const { calls } = stubApi();
    renderTab();
    await openPerson(user, /^ada/);
    await waitFor(() => expect(profilePanel().getByLabelText("Display name")).toHaveValue("Ada Lovelace"));

    await user.click(profilePanel().getByRole("button", { name: "Unlink" }));
    await user.click(within(await screen.findByRole("dialog", { name: "Unlink Ada Lovelace from ada?" })).getByRole("button", { name: "Unlink" }));

    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0].body).toEqual({ key: "ADA", expectedUpdatedAt: "2026-09-01T00:00:00.000Z", membershipEmail: null });
    expect(await list().findByRole("option", { name: /^ada/ })).toHaveTextContent("No public profile");
  });

  it("opens the person an old /dev/members/<email> or a profile key names", async () => {
    stubApi();
    const { unmount } = renderTab({ initialPerson: "Ada@example.com" });
    await waitFor(() => expect(list().getByRole("option", { name: /^ada/ })).toHaveAttribute("aria-selected", "true"));
    expect(accountPanel().getByText("ada@example.com")).toBeTruthy();
    unmount();

    renderTab({ initialPerson: "zed" });
    await waitFor(() => expect(list().getByRole("option", { name: /Zed Artist/ })).toHaveAttribute("aria-selected", "true"));
    expect(screen.getByRole("button", { name: /^Everyone/ })).toHaveAttribute("aria-pressed", "true");
  });

  it("says in text why an admin account or the admin's own account takes no actions", async () => {
    const user = userEvent.setup();
    stubApi({ members: [...ROSTER, { email: "sam@example.com", username: "sam", role: "editor" }], links: [] });
    renderTab({ profiles: [] });

    await openPerson(user, /^lyrea/);
    expect(accountPanel().getByText("Admin accounts are managed from the seed script.")).toBeTruthy();
    expect(accountPanel().queryByRole("button")).toBeNull();
  });

  it("asks before a ban and posts only once the admin confirms", async () => {
    const user = userEvent.setup();
    const { calls } = stubApi();
    renderTab();
    await openPerson(user, /^ada/);

    await user.click(accountPanel().getByRole("button", { name: "Ban" }));
    const dialog = await screen.findByRole("dialog", { name: "Ban ada?" });
    expect(calls).toHaveLength(0);
    await user.click(within(dialog).getByRole("button", { name: "Ban" }));

    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]).toEqual({ path: "/api/dev/members/ban", body: { email: "ada@example.com" } });
    expect(await screen.findByText("ada is banned.")).toBeTruthy();
  });

  it("asks before an unban and a reset, writes nothing on cancel, and shows a reset link once", async () => {
    const user = userEvent.setup();
    const { calls } = stubApi();
    renderTab();

    await openPerson(user, /^bob/);
    await user.click(accountPanel().getByRole("button", { name: "Unban" }));
    const unban = await screen.findByRole("dialog", { name: "Unban bob?" });
    expect(unban).toHaveTextContent("can sign in again at once, with the Contributor permissions");
    await user.click(within(unban).getByRole("button", { name: "Cancel" }));
    expect(calls).toHaveLength(0);
    await user.click(accountPanel().getByRole("button", { name: "Unban" }));
    await user.click(within(await screen.findByRole("dialog", { name: "Unban bob?" })).getByRole("button", { name: "Unban" }));
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]).toEqual({ path: "/api/dev/members/unban", body: { email: "bob@example.com" } });

    await openPerson(user, /^ada/);
    await user.click(accountPanel().getByRole("button", { name: "Reset password" }));
    const reset = await screen.findByRole("dialog", { name: "Issue a password reset link for ada?" });
    expect(reset).toHaveTextContent("Their current password keeps working until they use it");
    await user.click(within(reset).getByRole("button", { name: "Cancel" }));
    expect(calls).toHaveLength(1);
    await user.click(accountPanel().getByRole("button", { name: "Reset password" }));
    await user.click(within(await screen.findByRole("dialog", { name: /password reset link for ada/ })).getByRole("button", { name: "Issue reset link" }));
    await waitFor(() => expect(calls).toHaveLength(2));
    expect(calls[1]).toEqual({ path: "/api/dev/members/reset", body: { email: "ada@example.com" } });
    // The link lands in ada's Account block, under the button that issued it.
    expect((await accountPanel().findByTestId("reset-link")).textContent).toBe("https://dev.dose.wiki/reset-password?token=abc123");
    // Not copied yet, so Dismiss asks first; the link is never shown again.
    await user.click(accountPanel().getByRole("button", { name: "Dismiss" }));
    await user.click(accountPanel().getByRole("button", { name: "Close it" }));
    expect(screen.queryByTestId("reset-link")).toBeNull();
  });

  it("stages roles and languages, names the languages in the confirm, and writes only after it", async () => {
    const user = userEvent.setup();
    const { calls } = stubApi();
    renderTab();
    await openPerson(user, /^ada/);

    await user.click(accountPanel().getByRole("checkbox", { name: "Translator" }));
    expect(accountPanel().getByRole("button", { name: "Save permissions" })).toBeDisabled();
    await user.click(accountPanel().getByRole("checkbox", { name: /Dutch/ }));
    await user.click(accountPanel().getByRole("button", { name: "Save permissions" }));
    const confirm = await screen.findByRole("dialog", { name: "Change permissions for ada?" });
    expect(confirm).toHaveTextContent("Dutch");
    expect(calls).toHaveLength(0);
    await user.click(within(confirm).getByRole("button", { name: "Save permissions" }));

    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]).toEqual({
      path: "/api/dev/members/role",
      body: { email: "ada@example.com", role: "editor_translator", glossaryLocales: ["nl"] },
    });
  });

  it("names the grant it is changing and never says 'No role selected' under a ticked box", async () => {
    const user = userEvent.setup();
    stubApi();
    renderTab();
    await openPerson(user, /^ada/);

    expect(accountPanel().getByRole("checkbox", { name: "Editor" })).toBeChecked();
    expect(accountPanel().queryByText(/No role selected/)).toBeNull();
    await user.click(accountPanel().getByRole("checkbox", { name: "Editor" }));
    expect(accountPanel().getByText(/No role selected/)).toBeTruthy();
    expect(accountPanel().getByText("From Editor to Contributor, once you confirm.")).toBeTruthy();
    await user.click(accountPanel().getByRole("button", { name: "Save permissions" }));
    expect(await screen.findByRole("dialog", { name: "Change permissions for ada?" })).toHaveTextContent("ada goes from Editor to Contributor.");
  });

  it("keeps a result with the account it is about", async () => {
    const user = userEvent.setup();
    stubApi();
    renderTab();
    await openPerson(user, /^ada/);
    await user.click(accountPanel().getByRole("button", { name: "Ban" }));
    await user.click(within(await screen.findByRole("dialog", { name: "Ban ada?" })).getByRole("button", { name: "Ban" }));
    expect(await accountPanel().findByText("ada is banned.")).toBeTruthy();

    await openPerson(user, /^bob/);
    await waitFor(() => expect(accountPanel().getByText("bob@example.com")).toBeTruthy());
    expect(screen.queryByText("ada is banned.")).toBeNull();
  });

  it("reads a refused write under the freeze as the freeze", async () => {
    const user = userEvent.setup();
    stubApi();
    renderTab();
    await openPerson(user, /^ada/);
    vi.mocked(fetch).mockImplementationOnce(async () =>
      Response.json({ error: "Data writes are frozen (DATA_WRITES_FROZEN).", code: "DATA_WRITES_FROZEN" }, { status: 503 }),
    );
    await user.click(accountPanel().getByRole("button", { name: "Ban" }));
    await user.click(within(await screen.findByRole("dialog", { name: "Ban ada?" })).getByRole("button", { name: "Ban" }));
    expect(await accountPanel().findByText("Writes are paused, so that was not saved.")).toBeTruthy();
  });

  describe("in the dev shell", () => {
    it("reports staged permissions and profile edits as People's unsaved work", async () => {
      const user = userEvent.setup();
      stubApi();
      const { nav, onTabChange } = renderInDevShell(
        <PeopleTab profiles={DIRECTORY} isDirectoryLoading={false} sessionProfileKey="JOSIE" />,
        { tab: "people" },
      );
      await openPerson(user, /^ada/);
      await waitFor(() => expect(profilePanel().getByLabelText("Display name")).toHaveValue("Ada Lovelace"));

      await user.type(profilePanel().getByLabelText("Display name"), " Byron");
      await user.click(accountPanel().getByRole("checkbox", { name: "Translator" }));

      expectRailMarksUnsaved(nav, "People");
      const dialog = switchTabExpectingGuard(nav, onTabChange);
      expect(within(dialog).getByText("People: profile of Ada Lovelace")).toBeTruthy();
      expect(within(dialog).getByText("People: permissions for ada")).toBeTruthy();
      fireEvent.click(within(dialog).getByRole("button", { name: "Keep editing" }));

      // Picking another person drops both, so it asks the same dialog.
      fireEvent.click(list().getByRole("option", { name: /^bob/ }));
      const guard = screen.getByRole("dialog", { name: /Save or discard/ });
      expect(within(guard).getByText("People: permissions for ada")).toBeTruthy();
      fireEvent.click(within(guard).getByRole("button", { name: /Discard all/ }));
      await waitFor(() => expect(accountPanel().getByText("bob@example.com")).toBeTruthy());
    });
  });
});
