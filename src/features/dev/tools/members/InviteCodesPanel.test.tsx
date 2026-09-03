import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import InviteCodesPanel from "./InviteCodesPanel";
import type { InviteCodeSummary } from "./inviteCodeRequests";

const CODE = "abcd-efgh-jkmn-pqrs-tuvw-xyz2";

const activeInvite: InviteCodeSummary = {
  id: "inv1",
  role: "editor",
  createdBy: "admin@example.com",
  createdAt: "2026-09-01T00:00:00.000Z",
  expiresAt: "2026-09-08T00:00:00.000Z",
  maxUses: 1,
  redemptions: [],
  note: "Ada",
  status: "active",
};

const usedInvite: InviteCodeSummary = {
  id: "inv2",
  role: "contributor",
  createdBy: "admin@example.com",
  createdAt: "2026-08-20T00:00:00.000Z",
  expiresAt: "2026-08-27T00:00:00.000Z",
  maxUses: 1,
  redemptions: [{ email: "grace@members.dose.wiki", at: "2026-08-21T00:00:00.000Z" }],
  status: "exhausted",
};

function stubRoutes(options: { mintStatus?: number; revokeStatus?: number } = {}) {
  const calls: { url: string; init?: RequestInit }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input), "https://dev.dose.wiki");
      calls.push({ url: url.pathname, init });

      if (url.pathname === "/api/dev/invites" && (!init || !init.method)) {
        return Response.json({ ok: true, invites: [activeInvite, usedInvite] });
      }
      if (url.pathname === "/api/dev/invites" && init?.method === "POST") {
        if (options.mintStatus) {
          return Response.json({ error: "Expiry must be between 1 and 365 days." }, { status: options.mintStatus });
        }
        return Response.json({
          ok: true,
          code: CODE,
          invite: { ...activeInvite, id: "inv3", role: "contributor", note: "Linus", maxUses: 2 },
        });
      }
      if (url.pathname === "/api/dev/invites/inv1/revoke" && init?.method === "POST") {
        if (options.revokeStatus) {
          return Response.json({ error: "Already fully redeemed.", code: "INVITE_EXHAUSTED" }, { status: options.revokeStatus });
        }
        return Response.json({ ok: true });
      }
      return Response.json({ error: "unexpected" }, { status: 500 });
    }),
  );
  return calls;
}

describe("InviteCodesPanel", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("lists issued codes newest first with status pills and a Revoke only on active ones", async () => {
    stubRoutes();
    render(<InviteCodesPanel />);

    const list = await screen.findByRole("list", { name: "Invite codes" });
    const rows = within(list).getAllByRole("listitem");
    expect(rows).toHaveLength(2);

    expect(within(rows[0]).getByText("Active")).toBeInTheDocument();
    expect(within(rows[0]).getByText("Editor")).toBeInTheDocument();
    expect(within(rows[0]).getByText("Ada")).toBeInTheDocument();
    expect(within(rows[0]).getByRole("button", { name: "Revoke invite for Ada" })).toBeInTheDocument();

    expect(within(rows[1]).getByText("Used")).toBeInTheDocument();
    expect(within(rows[1]).getByText(/grace@members\.dose\.wiki/)).toBeInTheDocument();
    expect(within(rows[1]).queryByRole("button", { name: /Revoke/ })).not.toBeInTheDocument();
  });

  it("mints with the form values, reveals the plaintext once with a copyable invite link, and prepends the row", async () => {
    const calls = stubRoutes();
    const user = userEvent.setup();
    render(<InviteCodesPanel />);
    await screen.findByRole("list", { name: "Invite codes" });

    await user.selectOptions(screen.getByLabelText("Role"), "contributor");
    await user.type(screen.getByLabelText("Note"), "Linus");
    await user.clear(screen.getByLabelText("Expires in (days)"));
    await user.type(screen.getByLabelText("Expires in (days)"), "14");
    await user.clear(screen.getByLabelText("Uses"));
    await user.type(screen.getByLabelText("Uses"), "2");
    await user.click(screen.getByRole("button", { name: "Mint invite" }));

    const reveal = await screen.findByRole("region", { name: "New invite code" });
    expect(within(reveal).getByTestId("minted-invite-code")).toHaveTextContent(CODE);
    expect(within(reveal).getByTestId("minted-invite-link")).toHaveTextContent(
      `${window.location.origin}/invite?code=${encodeURIComponent(CODE)}`,
    );

    const mint = calls.find((call) => call.url === "/api/dev/invites" && call.init?.method === "POST");
    expect(JSON.parse(String(mint?.init?.body))).toEqual({
      role: "contributor",
      note: "Linus",
      expiresInDays: 14,
      maxUses: 2,
    });

    // user-event installs a working clipboard stub; read it back.
    await user.click(within(reveal).getByRole("button", { name: "Copy code" }));
    await expect(navigator.clipboard.readText()).resolves.toBe(CODE);
    await user.click(within(reveal).getByRole("button", { name: "Copy link" }));
    await expect(navigator.clipboard.readText()).resolves.toBe(
      `${window.location.origin}/invite?code=${encodeURIComponent(CODE)}`,
    );

    const rows = within(screen.getByRole("list", { name: "Invite codes" })).getAllByRole("listitem");
    expect(rows).toHaveLength(3);
    expect(within(rows[0]).getByText("Linus")).toBeInTheDocument();
    expect(within(rows[0]).getByText(/0\/2 used/)).toBeInTheDocument();

    await user.click(within(reveal).getByRole("button", { name: "Dismiss" }));
    expect(screen.queryByRole("region", { name: "New invite code" })).not.toBeInTheDocument();
  });

  it("shows the route's mint refusal beside the button", async () => {
    stubRoutes({ mintStatus: 400 });
    const user = userEvent.setup();
    render(<InviteCodesPanel />);
    await screen.findByRole("list", { name: "Invite codes" });

    await user.click(screen.getByRole("button", { name: "Mint invite" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Expiry must be between 1 and 365 days.");
    expect(screen.queryByRole("region", { name: "New invite code" })).not.toBeInTheDocument();
  });

  it("revokes an active code and flips its pill", async () => {
    const calls = stubRoutes();
    const user = userEvent.setup();
    render(<InviteCodesPanel />);
    const list = await screen.findByRole("list", { name: "Invite codes" });

    await user.click(within(list).getByRole("button", { name: "Revoke invite for Ada" }));

    await waitFor(() =>
      expect(calls.some((call) => call.url === "/api/dev/invites/inv1/revoke" && call.init?.method === "POST")).toBe(true),
    );
    const row = within(list).getAllByRole("listitem")[0];
    await within(row).findByText("Revoked");
    expect(within(row).queryByRole("button", { name: /Revoke/ })).not.toBeInTheDocument();
  });

  it("surfaces a revoke refusal and keeps the row active", async () => {
    stubRoutes({ revokeStatus: 400 });
    const user = userEvent.setup();
    render(<InviteCodesPanel />);
    const list = await screen.findByRole("list", { name: "Invite codes" });

    await user.click(within(list).getByRole("button", { name: "Revoke invite for Ada" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Already fully redeemed.");
    expect(within(list).getByRole("button", { name: "Revoke invite for Ada" })).toBeEnabled();
  });
});
