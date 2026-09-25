import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./InviteCodesPanel", () => ({
  default: () => <div data-testid="invite-codes-panel">invite codes</div>,
}));

import { MembersTab } from "./MembersTab";
import type { MemberRow } from "./membersModel";

const SELF = "josie@example.com";

const ROSTER: MemberRow[] = [
  {
    email: "ada@example.com",
    username: "ada",
    name: "Ada",
    role: "editor",
    invitedBy: SELF,
    lastSeenAt: "2026-08-02T10:00:00.000Z",
  },
  { email: SELF, username: "josie", name: "Josie", role: "admin" },
  { email: "lyrea@example.com", username: "lyrea", role: "admin" },
  {
    email: "bob@example.com",
    username: "bob",
    role: "contributor",
    bannedAt: "2026-08-01T00:00:00.000Z",
  },
];

type Call = { path: string; body: Record<string, unknown> | null };

/** Serves the roster and records every action POST; the roster is re-served after each. */
function stubMembersApi(members: MemberRow[], self = SELF) {
  const calls: Call[] = [];
  const fetchMock = vi.fn(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = new URL(String(input), "https://dev.dose.wiki").pathname;
      if (path === "/api/dev/members") {
        return Response.json({ ok: true, self, members });
      }
      const body =
        typeof init?.body === "string"
          ? (JSON.parse(init.body) as Record<string, unknown>)
          : null;
      calls.push({ path, body });
      if (path.endsWith("/reset")) {
        return Response.json({
          ok: true,
          email: body?.email,
          resetPath: "/reset-password?token=abc123",
        });
      }
      return Response.json({ ok: true });
    },
  );
  vi.stubGlobal("fetch", fetchMock);
  return { fetchMock, calls };
}

const rowFor = (email: string) => {
  const row = document.querySelector(`tr[data-member="${email}"]`);
  if (!(row instanceof HTMLTableRowElement)) {
    throw new Error(`no row for ${email}`);
  }
  return within(row);
};

describe("MembersTab", () => {
  beforeEach(() => {
    vi.stubGlobal("location", {
      ...window.location,
      origin: "https://dev.dose.wiki",
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders the roster read-only, with lock reasons as text and one Edit per editable row", async () => {
    stubMembersApi(ROSTER);
    render(<MembersTab />);

    await screen.findByText("ada");
    expect(screen.getByTestId("invite-codes-panel")).toBeTruthy();

    // Admins sort first, then editors, then contributors.
    const names = [...document.querySelectorAll("tr[data-member]")].map((row) =>
      row.getAttribute("data-member"),
    );
    expect(names).toEqual([
      SELF,
      "lyrea@example.com",
      "ada@example.com",
      "bob@example.com",
    ]);

    // No row carries a form control until Edit opens the drawer.
    for (const row of document.querySelectorAll("tr[data-member]")) {
      expect(row.querySelectorAll("input, select, textarea")).toHaveLength(0);
    }

    // The other admin: a visible reason, no controls at all.
    const lyrea = rowFor("lyrea@example.com");
    expect(
      lyrea.getByText("Admin accounts are managed from the seed script."),
    ).toBeTruthy();
    expect(lyrea.queryByRole("button")).toBeNull();

    // Self is an admin too, so the note rather than controls.
    const self = rowFor(SELF);
    expect(self.queryByRole("button")).toBeNull();

    // An editor row reads as text, with one Edit button.
    const ada = rowFor("ada@example.com");
    expect(ada.getByRole("cell", { name: /^Role\s*Editor$/ })).toBeTruthy();
    expect(ada.getByRole("cell", { name: /^Status\s*Active$/ })).toBeTruthy();
    expect(ada.getByRole("cell", { name: /^Last sign-in\s*2026-08-02/ })).toBeTruthy();
    expect(
      ada.getByRole("cell", { name: new RegExp(`^Invited by\\s*${SELF}$`) }),
    ).toBeTruthy();
    expect(ada.getAllByRole("button").map((button) => button.textContent)).toEqual(["Edit"]);
    expect(ada.queryByRole("button", { name: "Ban" })).toBeNull();

    const bob = rowFor("bob@example.com");
    expect(bob.getByRole("cell", { name: /^Status\s*Banned$/ })).toBeTruthy();
  });

  it("opens one member in a drawer with permissions, ban and reset", async () => {
    stubMembersApi(ROSTER);
    const user = userEvent.setup();
    render(<MembersTab />);
    await screen.findByText("ada");

    await user.click(rowFor("ada@example.com").getByRole("button", { name: "Edit ada" }));
    const drawer = await screen.findByRole("dialog", { name: "Edit ada" });
    expect(within(drawer).getByRole("checkbox", { name: "Editor" })).toBeChecked();
    expect(within(drawer).getByRole("checkbox", { name: "Translator" })).not.toBeChecked();
    expect(within(drawer).getByText("No role selected: Contributor access only.", { exact: false })).toBeTruthy();
    expect(within(drawer).getByRole("button", { name: "Ban" })).toBeEnabled();
    expect(within(drawer).getByRole("button", { name: "Reset password" })).toBeEnabled();

    await user.click(within(drawer).getByRole("button", { name: "Close" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("says in text why the signed-in user's own non-admin row cannot be edited", async () => {
    // A self row that is not admin cannot happen for a real admin session, but
    // the lock is about the email, and the tab must not depend on the role.
    stubMembersApi([{ email: SELF, username: "josie", role: "editor" }]);
    render(<MembersTab />);

    await screen.findByText("josie");
    const self = rowFor(SELF);
    expect(self.getByText("This is your own account.")).toBeTruthy();
    expect(self.queryByRole("button")).toBeNull();
  });

  it("posts unban and reset for the member and shows the reset link once", async () => {
    const { calls } = stubMembersApi(ROSTER);
    const user = userEvent.setup();
    render(<MembersTab />);
    await screen.findByText("ada");

    await user.click(rowFor("bob@example.com").getByRole("button", { name: "Edit bob" }));
    await user.click(
      within(await screen.findByRole("dialog", { name: "Edit bob" })).getByRole("button", { name: "Unban" }),
    );
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]).toEqual({
      path: "/api/dev/members/unban",
      body: { email: "bob@example.com" },
    });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());

    await user.click(rowFor("ada@example.com").getByRole("button", { name: "Edit ada" }));
    await user.click(
      within(await screen.findByRole("dialog", { name: "Edit ada" })).getByRole("button", { name: "Reset password" }),
    );
    await waitFor(() => expect(calls).toHaveLength(2));
    expect(calls[1]).toEqual({
      path: "/api/dev/members/reset",
      body: { email: "ada@example.com" },
    });

    const link = await screen.findByTestId("reset-link");
    expect(link.textContent).toBe(
      "https://dev.dose.wiki/reset-password?token=abc123",
    );
    expect(screen.getByRole("button", { name: "Copy link" })).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(screen.queryByTestId("reset-link")).toBeNull();
  });

  it("asks before a ban and posts only once the admin confirms", async () => {
    const { calls } = stubMembersApi(ROSTER);
    const user = userEvent.setup();
    render(<MembersTab />);
    await screen.findByText("ada");

    await user.click(rowFor("ada@example.com").getByRole("button", { name: "Edit ada" }));
    await user.click(
      within(await screen.findByRole("dialog", { name: "Edit ada" })).getByRole("button", { name: "Ban" }),
    );
    const dialog = await screen.findByRole("dialog", { name: "Ban ada?" });
    expect(calls).toHaveLength(0);

    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Ban ada?" })).toBeNull());
    expect(calls).toHaveLength(0);

    await user.click(
      within(screen.getByRole("dialog", { name: "Edit ada" })).getByRole("button", { name: "Ban" }),
    );
    await user.click(
      within(await screen.findByRole("dialog", { name: "Ban ada?" })).getByRole(
        "button",
        { name: "Ban" },
      ),
    );
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]).toEqual({
      path: "/api/dev/members/ban",
      body: { email: "ada@example.com" },
    });
    expect(await screen.findByText("ada is banned.")).toBeTruthy();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("stages independent roles and languages, names the languages in the confirm, and writes only after confirmation", async () => {
    const { calls } = stubMembersApi(ROSTER);
    const user = userEvent.setup();
    render(<MembersTab />);
    await screen.findByText("ada");
    await user.click(rowFor("ada@example.com").getByRole("button", { name: "Edit ada" }));
    const drawer = within(await screen.findByRole("dialog", { name: "Edit ada" }));
    await user.click(drawer.getByRole("checkbox", { name: "Translator" }));
    expect(drawer.getByRole("checkbox", { name: "Editor" })).toBeChecked();
    expect(drawer.getByRole("button", { name: "Save permissions" })).toBeDisabled();
    await user.click(drawer.getByRole("checkbox", { name: /Dutch/ }));
    await user.click(drawer.getByRole("checkbox", { name: /Simplified Chinese/ }));
    expect(calls).toHaveLength(0);
    await user.click(drawer.getByRole("button", { name: "Save permissions" }));
    const confirm = await screen.findByRole("dialog", { name: "Change permissions for ada?" });
    expect(confirm).toHaveTextContent("Dutch, Simplified Chinese (mainland)");
    expect(confirm).not.toHaveTextContent(/\bnl\b|zh-Hans/);
    await user.click(within(confirm).getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: /Change permissions/ })).toBeNull());
    expect(calls).toHaveLength(0);
    await user.click(drawer.getByRole("button", { name: "Save permissions" }));
    await user.click(within(await screen.findByRole("dialog", { name: "Change permissions for ada?" })).getByRole("button", { name: "Save permissions" }));
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]).toEqual({
      path: "/api/dev/members/role",
      body: { email: "ada@example.com", role: "editor_translator", glossaryLocales: ["nl", "zh-Hans"] },
    });
  });

  it("surfaces a refused action without dropping the roster", async () => {
    stubMembersApi(ROSTER);
    const failing = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        if (init?.method === "POST") {
          return Response.json(
            { error: "You cannot change your own membership." },
            { status: 400 },
          );
        }
        return Response.json({ ok: true, self: SELF, members: ROSTER });
      },
    );
    vi.stubGlobal("fetch", failing);
    render(<MembersTab />);
    await screen.findByText("ada");

    await userEvent.click(
      rowFor("ada@example.com").getByRole("button", { name: "Edit ada" }),
    );
    await userEvent.click(
      within(await screen.findByRole("dialog", { name: "Edit ada" })).getByRole("button", { name: "Ban" }),
    );
    await userEvent.click(
      within(await screen.findByRole("dialog", { name: "Ban ada?" })).getByRole(
        "button",
        { name: "Ban" },
      ),
    );

    expect(
      await screen.findByText("You cannot change your own membership."),
    ).toBeTruthy();
    expect(screen.getByText("ada")).toBeTruthy();
  });
});
