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
  { email: "ada@example.com", username: "ada", name: "Ada", role: "editor", invitedBy: SELF, lastSeenAt: "2026-08-02T10:00:00.000Z" },
  { email: SELF, username: "josie", name: "Josie", role: "admin" },
  { email: "lyrea@example.com", username: "lyrea", role: "admin" },
  { email: "bob@example.com", username: "bob", role: "contributor", bannedAt: "2026-08-01T00:00:00.000Z" },
];

type Call = { path: string; body: Record<string, unknown> | null };

/** Serves the roster and records every action POST; the roster is re-served after each. */
function stubMembersApi(members: MemberRow[], self = SELF) {
  const calls: Call[] = [];
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = new URL(String(input), "https://dev.dose.wiki").pathname;
    if (path === "/api/dev/members") {
      return Response.json({ ok: true, self, members });
    }
    const body = typeof init?.body === "string" ? (JSON.parse(init.body) as Record<string, unknown>) : null;
    calls.push({ path, body });
    if (path.endsWith("/reset")) {
      return Response.json({ ok: true, email: body?.email, resetPath: "/reset-password?token=abc123" });
    }
    return Response.json({ ok: true });
  });
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
    vi.stubGlobal("location", { ...window.location, origin: "https://dev.dose.wiki" });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders the roster with actions hidden for admins and disabled for the signed-in admin's own row", async () => {
    stubMembersApi(ROSTER);
    render(<MembersTab />);

    await screen.findByText("ada");
    expect(screen.getByTestId("invite-codes-panel")).toBeTruthy();

    // Admins sort first, then editors, then contributors.
    const names = [...document.querySelectorAll("tr[data-member]")].map((row) => row.getAttribute("data-member"));
    expect(names).toEqual([SELF, "lyrea@example.com", "ada@example.com", "bob@example.com"]);

    // The other admin: a note, no controls at all.
    const lyrea = rowFor("lyrea@example.com");
    expect(lyrea.getByText("Admin accounts are managed from the seed script.")).toBeTruthy();
    expect(lyrea.queryByRole("group", { name: "Actions for lyrea" })).toBeNull();
    expect(lyrea.queryByRole("button")).toBeNull();

    // Self is an admin too, so the note rather than disabled controls.
    const self = rowFor(SELF);
    expect(self.queryByRole("button")).toBeNull();
    expect(self.getByText("Admin accounts are managed from the seed script.")).toBeTruthy();

    // An editor row carries the full set of enabled actions.
    const ada = rowFor("ada@example.com");
    expect(ada.getByRole("combobox", { name: "Role for ada" })).toHaveValue("editor");
    expect(ada.getByRole("button", { name: "Ban" })).toBeEnabled();
    expect(ada.getByRole("button", { name: "Reset password" })).toBeEnabled();
    expect(ada.getByText("Editor", { selector: ":not(option)" })).toBeTruthy();
    expect(ada.getByText("2026-08-02")).toBeTruthy();
    expect(ada.getByText(SELF)).toBeTruthy();

    // A banned contributor shows the pill and the inverse action.
    const bob = rowFor("bob@example.com");
    expect(bob.getByText("Banned")).toBeTruthy();
    expect(bob.getByRole("button", { name: "Unban" })).toBeEnabled();
  });

  it("disables every action on the signed-in user's own non-admin row", async () => {
    // A self row that is not admin cannot happen for a real admin session, but
    // the lock is about the email, and the tab must not depend on the role.
    stubMembersApi([{ email: SELF, username: "josie", role: "editor" }]);
    render(<MembersTab />);

    await screen.findByText("josie");
    const self = rowFor(SELF);
    const select = self.getByRole("combobox", { name: "Role for josie" });
    expect(select).toBeDisabled();
    expect(select).toHaveAttribute("title", "This is your own account.");
    expect(self.getByRole("button", { name: "Ban" })).toBeDisabled();
    expect(self.getByRole("button", { name: "Reset password" })).toBeDisabled();
  });

  it("posts role, ban, and reset actions for the row and shows the reset link once", async () => {
    const { calls } = stubMembersApi(ROSTER);
    const user = userEvent.setup();
    render(<MembersTab />);
    await screen.findByText("ada");

    await user.selectOptions(rowFor("ada@example.com").getByRole("combobox", { name: "Role for ada" }), "contributor");
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]).toEqual({ path: "/api/dev/members/role", body: { email: "ada@example.com", role: "contributor" } });

    await user.click(rowFor("bob@example.com").getByRole("button", { name: "Unban" }));
    await waitFor(() => expect(calls).toHaveLength(2));
    expect(calls[1]).toEqual({ path: "/api/dev/members/unban", body: { email: "bob@example.com" } });

    await user.click(rowFor("ada@example.com").getByRole("button", { name: "Reset password" }));
    await waitFor(() => expect(calls).toHaveLength(3));
    expect(calls[2]).toEqual({ path: "/api/dev/members/reset", body: { email: "ada@example.com" } });

    const link = await screen.findByTestId("reset-link");
    expect(link.textContent).toBe("https://dev.dose.wiki/reset-password?token=abc123");
    expect(screen.getByRole("button", { name: "Copy link" })).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(screen.queryByTestId("reset-link")).toBeNull();
  });

  it("surfaces a refused action without dropping the roster", async () => {
    stubMembersApi(ROSTER);
    const failing = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "POST") {
        return Response.json({ error: "You cannot change your own membership." }, { status: 400 });
      }
      return Response.json({ ok: true, self: SELF, members: ROSTER });
    });
    vi.stubGlobal("fetch", failing);
    render(<MembersTab />);
    await screen.findByText("ada");

    await userEvent.click(rowFor("ada@example.com").getByRole("button", { name: "Ban" }));

    expect(await screen.findByText("You cannot change your own membership.")).toBeTruthy();
    expect(screen.getByText("ada")).toBeTruthy();
  });
});
