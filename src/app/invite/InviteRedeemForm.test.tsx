import { render, screen, waitFor } from "@testing-library/react";
import userEvent, { type UserEvent } from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { InviteRedeemForm } from "./InviteRedeemForm";

const authMocks = vi.hoisted(() => ({ signIn: vi.fn() }));

vi.mock("next-auth/react", () => ({
  signIn: authMocks.signIn,
}));

const CODE = "abcd-efgh-jkmn-pqrs-tuvw-xyz2";
const PASSWORD = "correct horse battery";

async function fillAccountFields(user: UserEvent, password = PASSWORD, confirm = password) {
  await user.type(screen.getByLabelText("Username"), "Ada");
  await user.type(screen.getByLabelText("Password"), password);
  await user.type(screen.getByLabelText("Confirm password"), confirm);
}

describe("InviteRedeemForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders every field with the linked code prefilled and editable", () => {
    render(<InviteRedeemForm initialCode={CODE} destination="/dev" />);

    expect(screen.getByLabelText("Invite code")).toHaveValue(CODE);
    expect(screen.getByLabelText("Username")).toBeInTheDocument();
    expect(screen.getByLabelText("Password")).toBeInTheDocument();
    expect(screen.getByLabelText("Confirm password")).toBeInTheDocument();
    expect(screen.getByLabelText("Name (optional)")).toBeInTheDocument();
    expect(screen.getByLabelText("Email (optional)")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Create account" })).toBeEnabled();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("refuses mismatched passwords locally without a request", async () => {
    const user = userEvent.setup();
    render(<InviteRedeemForm initialCode={CODE} destination="/dev" />);

    await fillAccountFields(user, PASSWORD, `${PASSWORD}!`);
    await user.click(screen.getByRole("button", { name: "Create account" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("The two passwords do not match.");
    expect(fetch).not.toHaveBeenCalled();
    expect(authMocks.signIn).not.toHaveBeenCalled();
  });

  it("renders the route's refusal inline and leaves the form usable", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      Response.json({ error: "That invite code has expired.", code: "INVITE_EXPIRED" }, { status: 410 }),
    );
    const user = userEvent.setup();
    render(<InviteRedeemForm initialCode={CODE} destination="/dev" />);

    await fillAccountFields(user);
    await user.click(screen.getByRole("button", { name: "Create account" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("That invite code has expired.");
    expect(screen.getByRole("button", { name: "Create account" })).toBeEnabled();
    expect(authMocks.signIn).not.toHaveBeenCalled();
  });

  it("submits the form, signs in with the new credentials and redirects", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(Response.json({ ok: true, username: "ada" }));
    authMocks.signIn.mockResolvedValueOnce({ ok: true, error: null, url: "https://dev.dose.wiki/dev" });
    const assign = vi.fn();
    vi.stubGlobal("location", { ...window.location, set href(value: string) { assign(value); } });

    const user = userEvent.setup();
    render(<InviteRedeemForm initialCode={CODE} destination="/dev" />);

    await fillAccountFields(user);
    await user.type(screen.getByLabelText("Name (optional)"), "Ada Lovelace");
    await user.click(screen.getByRole("button", { name: "Create account" }));

    await waitFor(() => expect(assign).toHaveBeenCalledWith("https://dev.dose.wiki/dev"));

    expect(fetch).toHaveBeenCalledWith(
      "/api/invite/redeem",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ code: CODE, username: "Ada", password: PASSWORD, name: "Ada Lovelace", email: "" }),
      }),
    );
    expect(authMocks.signIn).toHaveBeenCalledWith("credentials", {
      username: "ada",
      password: PASSWORD,
      callbackUrl: "/dev",
      redirect: false,
    });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("explains when the account exists but sign-in failed", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(Response.json({ ok: true, username: "ada" }));
    authMocks.signIn.mockResolvedValueOnce({ ok: false, error: "CredentialsSignin", url: null });
    const user = userEvent.setup();
    render(<InviteRedeemForm initialCode={CODE} destination="/dev" />);

    await fillAccountFields(user);
    await user.click(screen.getByRole("button", { name: "Create account" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Your account was created but sign-in did not complete.");
  });
});
