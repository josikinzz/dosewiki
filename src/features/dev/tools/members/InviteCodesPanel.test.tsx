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
  let listedInvites = [activeInvite, usedInvite];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input), "https://dev.dose.wiki");
      calls.push({ url: url.pathname, init });

      if (url.pathname === "/api/dev/invites" && (!init || !init.method)) {
        return Response.json({ ok: true, invites: listedInvites, continuationCursor: null });
      }
      if (url.pathname === "/api/dev/invites" && init?.method === "POST") {
        if (options.mintStatus) {
          return Response.json({ error: "Expiry must be between 1 and 365 days." }, { status: options.mintStatus });
        }
        const mintedInvite = { ...activeInvite, id: "inv3", role: "contributor" as const, note: "Linus", maxUses: 2 };
        listedInvites = [mintedInvite, ...listedInvites];
        return Response.json({
          ok: true,
          code: CODE,
          invite: mintedInvite,
        });
      }
      if (url.pathname === "/api/dev/invites/inv1/revoke" && init?.method === "POST") {
        if (options.revokeStatus) {
          return Response.json({ error: "Already fully redeemed.", code: "INVITE_EXHAUSTED" }, { status: options.revokeStatus });
        }
        listedInvites = listedInvites.map((invite) =>
          invite.id === "inv1"
            ? { ...invite, revokedAt: "2026-09-02T00:00:00.000Z", status: "revoked" as const }
            : invite,
        );
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

  it("automatically loads continuation pages and deduplicates records", async () => {
    const olderInvite = {
      ...usedInvite,
      id: "inv3",
      note: "Older",
      createdAt: "2026-08-01T00:00:00.000Z",
    };
    let releaseContinuation: (() => void) | undefined;
    const continuationReady = new Promise<void>((resolve) => {
      releaseContinuation = resolve;
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = new URL(String(input), "https://dev.dose.wiki");
        if (url.searchParams.get("cursor") === "page-2") {
          await continuationReady;
          return Response.json({
            ok: true,
            invites: [usedInvite, olderInvite],
            continuationCursor: null,
          });
        }
        return Response.json({
          ok: true,
          invites: [activeInvite, usedInvite],
          continuationCursor: "page-2",
        });
      }),
    );

    render(<InviteCodesPanel />);
    const list = await screen.findByRole("list", { name: "Invite codes" });
    expect(within(list).getAllByRole("listitem")).toHaveLength(2);
    expect(screen.getByRole("status")).toHaveTextContent("Loading invite code history");

    releaseContinuation?.();
    await waitFor(() => expect(within(list).getAllByRole("listitem")).toHaveLength(3));
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(within(list).getAllByRole("listitem")[2]).toHaveTextContent("Older");
  });

  it("mints with the form values, reveals the plaintext once with a copyable invite link, and prepends the row", async () => {
    const calls = stubRoutes();
    const user = userEvent.setup();
    render(<InviteCodesPanel />);
    await screen.findByRole("list", { name: "Invite codes" });

    await user.click(screen.getByRole("checkbox", { name: "Editor" }));
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
      glossaryLocales: [],
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

  it("requires a language for Translator while retaining the independent Editor checkbox", async () => {
    const calls = stubRoutes();
    const user = userEvent.setup();
    render(<InviteCodesPanel />);
    await screen.findByRole("list", { name: "Invite codes" });
    await user.click(screen.getByRole("checkbox", { name: "Translator" }));
    expect(screen.getByRole("checkbox", { name: "Editor" })).toBeChecked();
    expect(screen.getByRole("button", { name: "Mint invite" })).toBeDisabled();
    await user.click(screen.getByRole("checkbox", { name: /Dutch/ }));
    await user.click(screen.getByRole("button", { name: "Mint invite" }));
    await screen.findByRole("region", { name: "New invite code" });
    const mint = calls.find((call) => call.init?.method === "POST");
    expect(JSON.parse(String(mint?.init?.body))).toMatchObject({ role: "editor_translator", glossaryLocales: ["nl"] });
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
