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

  it("renders the roster with actions hidden for admins and disabled for the signed-in admin's own row", async () => {
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

    // The other admin: a note, no controls at all.
    const lyrea = rowFor("lyrea@example.com");
    expect(
      lyrea.getByText("Admin accounts are managed from the seed script."),
    ).toBeTruthy();
    expect(
      lyrea.queryByRole("group", { name: "Actions for lyrea" }),
    ).toBeNull();
    expect(lyrea.queryByRole("button")).toBeNull();

    // Self is an admin too, so the note rather than disabled controls.
    const self = rowFor(SELF);
    expect(self.queryByRole("button")).toBeNull();
    expect(
      self.getByText("Admin accounts are managed from the seed script."),
    ).toBeTruthy();

    // An editor row carries the full set of enabled actions.
    const ada = rowFor("ada@example.com");
    expect(ada.getByRole("checkbox", { name: "Editor" })).toBeChecked();
    expect(ada.getByRole("checkbox", { name: "Translator" })).not.toBeChecked();
    expect(ada.getByRole("button", { name: "Ban" })).toBeEnabled();
    expect(ada.getByRole("button", { name: "Reset password" })).toBeEnabled();
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
    expect(self.getByRole("checkbox", { name: "Editor" })).toBeDisabled();
    expect(self.getByRole("checkbox", { name: "Translator" })).toBeDisabled();
    expect(self.getByRole("button", { name: "Ban" })).toBeDisabled();
    expect(self.getByRole("button", { name: "Reset password" })).toBeDisabled();
  });

  it("renders each row as a labelled card that carries the role control, Ban, and Reset", async () => {
    stubMembersApi(ROSTER);
    render(<MembersTab />);
    await screen.findByText("ada");

    // Below the tablet step the header row is hidden and the row itself is
    // the card, so every field label and every action must live inside it.
    const ada = rowFor("ada@example.com");
    expect(ada.getByRole("cell", { name: /^Role\s*Editor$/ })).toBeTruthy();
    expect(ada.getByRole("cell", { name: /^Status\s*Active$/ })).toBeTruthy();
    expect(
      ada.getByRole("cell", { name: /^Last sign-in\s*2026-08-02/ }),
    ).toBeTruthy();
    expect(
      ada.getByRole("cell", { name: new RegExp(`^Invited by\\s*${SELF}$`) }),
    ).toBeTruthy();

    const actions = ada.getByRole("group", { name: "Actions for ada" });
    expect(within(actions).getByRole("checkbox", { name: "Editor" })).toBeChecked();
    expect(within(actions).getByRole("button", { name: "Ban" })).toBeEnabled();
    expect(
      within(actions).getByRole("button", { name: "Reset password" }),
    ).toBeEnabled();

    const bob = rowFor("bob@example.com");
    expect(bob.getByRole("cell", { name: /^Status\s*Banned$/ })).toBeTruthy();
    expect(
      within(bob.getByRole("group", { name: "Actions for bob" })).getByRole(
        "button",
        { name: "Unban" },
      ),
    ).toBeEnabled();
  });

  it("posts unban and reset for the row and shows the reset link once", async () => {
    const { calls } = stubMembersApi(ROSTER);
    const user = userEvent.setup();
    render(<MembersTab />);
    await screen.findByText("ada");

    await user.click(
      rowFor("bob@example.com").getByRole("button", { name: "Unban" }),
    );
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]).toEqual({
      path: "/api/dev/members/unban",
      body: { email: "bob@example.com" },
    });

    await user.click(
      rowFor("ada@example.com").getByRole("button", { name: "Reset password" }),
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

    await user.click(
      rowFor("ada@example.com").getByRole("button", { name: "Ban" }),
    );
    const dialog = await screen.findByRole("dialog", { name: "Ban ada?" });
    expect(calls).toHaveLength(0);

    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(calls).toHaveLength(0);

    await user.click(
      rowFor("ada@example.com").getByRole("button", { name: "Ban" }),
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
  });

  it("stages independent roles and languages, and writes only after confirmation", async () => {
    const { calls } = stubMembersApi(ROSTER);
    const user = userEvent.setup();
    render(<MembersTab />);
    await screen.findByText("ada");
    const row = rowFor("ada@example.com");
    await user.click(row.getByRole("checkbox", { name: "Translator" }));
    expect(row.getByRole("checkbox", { name: "Editor" })).toBeChecked();
    expect(row.getByRole("button", { name: "Save permissions" })).toBeDisabled();
    await user.click(row.getByRole("checkbox", { name: /Dutch/ }));
    await user.click(row.getByRole("checkbox", { name: /Simplified Chinese/ }));
    expect(calls).toHaveLength(0);
    await user.click(row.getByRole("button", { name: "Save permissions" }));
    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(calls).toHaveLength(0);
    await user.click(row.getByRole("button", { name: "Save permissions" }));
    await user.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Save permissions" }));
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
      rowFor("ada@example.com").getByRole("button", { name: "Ban" }),
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
