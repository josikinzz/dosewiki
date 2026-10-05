import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next-auth/react", () => ({ signOut: vi.fn() }));
vi.mock("@/components/common/Icon", () => ({
  Icon: ({ icon }: { icon: string }) => <span data-icon={icon} />,
}));
vi.mock("./useDevRailBadges", () => ({ useDevRailBadges: () => ({}), useDevRailBadgeReadings: () => ({}) }));

import { useDevShortcuts } from "../components/devShortcuts";
import { useUnsavedWork } from "../components/unsavedWork";
import { useTriageShortcuts } from "../components/useTriageShortcuts";
import { clearDevRecordSourceCache } from "./devRecordSources";
import { renderInDevShell } from "./devShellTestHarness";

beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
});

const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
  const url = String(input);
  const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });
  if (url.startsWith("/api/editor/substances?page=lookup")) {
    return json({
      page: [
        { slug: "mdma", name: "MDMA" },
        { slug: "lsd", name: "LSD" },
      ],
      continueCursor: null,
      isDone: true,
    });
  }
  if (url === "/api/dev/warning-banner") {
    return json({ presets: [{ key: "serotonin", headline: "Serotonin syndrome risk", severityLabel: "Danger" }] });
  }
  if (url === "/api/dev/writing-article") {
    return json({ articles: [{ slug: "on-set-and-setting", title: "On set and setting", kind: "blog" }] });
  }
  if (url === "/api/dev/members") {
    return json({ self: "admin@example.com", members: [{ email: "sam@example.com", username: "sam" }] });
  }
  return new Response("{}", { status: 404 });
});

beforeEach(() => {
  clearDevRecordSourceCache();
  fetchMock.mockClear();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function Idle() {
  return <p>Tool body</p>;
}

/** A stand-in tool with one field whose draft registers with the shell. */
function DirtyWritingTool() {
  const [draft, setDraft] = useState("");
  useUnsavedWork({
    id: "writing",
    label: "Writing: Harm reduction basics",
    dirty: draft !== "",
    discard: () => setDraft(""),
  });
  return <input aria-label="Draft" value={draft} onChange={(event) => setDraft(event.target.value)} />;
}

function openPalette() {
  fireEvent.keyDown(window, { key: "k", metaKey: true });
  return screen.getByRole("dialog", { name: "Open a tool or record" });
}

async function search(user: ReturnType<typeof userEvent.setup>, text: string) {
  const dialog = openPalette();
  await user.type(within(dialog).getByRole("combobox"), text);
  return dialog;
}

describe("the Cmd+K palette", () => {
  it("opens People when an admin types the retired name 'members' and presses Enter", async () => {
    const user = userEvent.setup();
    const { onTabChange } = renderInDevShell(<Idle />, { tab: "articles", role: "admin" });

    const dialog = await search(user, "members");
    expect(within(dialog).getByRole("option", { name: /^People/ })).toBeTruthy();
    await user.keyboard("{Enter}");

    expect(onTabChange).toHaveBeenCalledWith("people");
    expect(screen.queryByRole("dialog", { name: "Open a tool or record" })).toBeNull();
  });

  it("lands a member record on that person in People", async () => {
    const user = userEvent.setup();
    const { onOpenPath } = renderInDevShell(<Idle />, { tab: "articles", role: "admin" });

    const dialog = await search(user, "people sam");
    await user.click(await within(dialog).findByRole("option", { name: /sam/ }));

    expect(onOpenPath).toHaveBeenCalledWith("/dev/people/sam@example.com");
  });

  it("never offers a tool or a record above the role", async () => {
    const user = userEvent.setup();
    renderInDevShell(<Idle />, { tab: "articles", role: "editor" });

    const dialog = await search(user, "members");
    expect(within(dialog).queryByRole("option", { name: /People/ })).toBeNull();
    await user.clear(within(dialog).getByRole("combobox"));
    await user.type(within(dialog).getByRole("combobox"), "banners mdma");
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    await waitFor(() => expect(within(dialog).queryByRole("status")).toBeNull());

    expect(within(dialog).queryByRole("option", { name: /Banners/ })).toBeNull();
    const requested = fetchMock.mock.calls.map(([url]) => String(url));
    expect(requested).not.toContain("/api/dev/members");
    expect(requested).not.toContain("/api/dev/warning-banner");
  });

  it("lands 'banners mdma' on MDMA in Banners", async () => {
    const user = userEvent.setup();
    const { onOpenPath } = renderInDevShell(<Idle />, { tab: "articles", role: "admin" });

    const dialog = await search(user, "banners mdma");
    const option = await within(dialog).findByRole("option", { name: /MDMA.*Banners on/ });
    await user.click(option);

    expect(onOpenPath).toHaveBeenCalledWith("/dev/banners/mdma");
  });

  it("lands 'writing about' on the About entry, and finds a preset by its headline", async () => {
    const user = userEvent.setup();
    const { onOpenPath } = renderInDevShell(<Idle />, { tab: "articles", role: "admin" });

    const writing = await search(user, "writing about");
    await within(writing).findByRole("option", { name: /About/ });
    await user.keyboard("{Enter}");
    expect(onOpenPath).toHaveBeenCalledWith("/dev/writing/about");

    const dialog = await search(user, "serotonin");
    await user.click(await within(dialog).findByRole("option", { name: /Serotonin syndrome risk/ }));
    expect(onOpenPath).toHaveBeenLastCalledWith("/dev/banners/preset:serotonin");
  });

  it("lists saved views on open, with their counts, and opens a view as its queue", async () => {
    const user = userEvent.setup();
    const viewsFetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.startsWith("/api/article-feedback/queue?status=unresolved")) {
        return Response.json({ ok: true, feedback: [], counts: {}, nextCursor: null, total: 4 });
      }
      if (url === "/api/dev/proposals") {
        return Response.json({
          ok: true,
          proposals: [
            { _id: "a", isAuthor: true, status: "submitted" },
            { _id: "b", isAuthor: true, status: "applied" },
            { _id: "c", isAuthor: false, status: "submitted" },
          ],
        });
      }
      return new Response("{}", { status: 404 });
    });
    vi.stubGlobal("fetch", viewsFetch);
    const { onOpenPath } = renderInDevShell(<Idle />, { tab: "articles", role: "admin" });

    const views = openPalette();
    expect(await within(views).findByRole("option", { name: /Oldest unresolved article feedback.*4 unresolved/ })).toBeTruthy();
    // A count that could not be read leaves the view without one; it still opens.
    expect(within(views).getByRole("option", { name: /Oldest unresolved site feedback/ })).not.toHaveTextContent(/\d+ unresolved/);
    expect(within(views).getByRole("option", { name: /My pending proposals.*1 waiting/ })).toBeTruthy();
    expect(within(views).getByRole("option", { name: /Needs another pass/ })).toBeTruthy();

    await user.click(within(views).getByRole("option", { name: /Oldest unresolved article feedback/ }));
    expect(onOpenPath).toHaveBeenCalledWith("/dev/article-feedback?source=article&status=unresolved&sort=oldest");
  });

  it("offers a translator only the glossary languages the session grants", async () => {
    const user = userEvent.setup();
    renderInDevShell(<Idle />, { tab: "glossary", role: "translator", glossaryLocales: ["nl"] });

    const dialog = await search(user, "glossary");
    await user.type(within(dialog).getByRole("combobox"), " n");
    expect(await within(dialog).findByRole("option", { name: /Glossary · nl/ })).toBeTruthy();
    expect(within(dialog).queryByRole("option", { name: /Glossary · de/ })).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("asks before a palette jump drops unsaved work, like a rail click", async () => {
    const user = userEvent.setup();
    const { onTabChange, onOpenPath } = renderInDevShell(<DirtyWritingTool />, { tab: "writing", role: "admin" });
    await user.type(screen.getByRole("textbox", { name: "Draft" }), "New intro");

    await search(user, "members");
    await user.keyboard("{Enter}");

    const guard = screen.getByRole("dialog", { name: /discard/i });
    expect(within(guard).getByText("Writing: Harm reduction basics")).toBeTruthy();
    expect(onTabChange).not.toHaveBeenCalled();
    await user.click(within(guard).getByRole("button", { name: "Keep editing" }));
    expect(onTabChange).not.toHaveBeenCalled();

    // A record in the open tool remounts it, so it asks too.
    const palette = await search(user, "writing about");
    await within(palette).findByRole("option", { name: /About/ });
    await user.keyboard("{Enter}");
    const again = screen.getByRole("dialog", { name: /discard/i });
    expect(onOpenPath).not.toHaveBeenCalled();
    await user.click(within(again).getByRole("button", { name: "Discard" }));
    expect(onOpenPath).toHaveBeenCalledWith("/dev/writing/about");
  });
});

function KeyedTool() {
  useDevShortcuts([
    { keys: "j / k", label: "Next and previous card" },
    { keys: "Cmd+Z", label: "Undo the last move" },
  ]);
  return <input aria-label="Search cards" />;
}

function TriageTool() {
  const { helpDialog } = useTriageShortcuts({ onMove: vi.fn(), onAccept: vi.fn(), labels: { accept: "Resolve" } });
  return <>{helpDialog}</>;
}

describe("the ? sheet", () => {
  it("lists the open tool's keys and the shell's own", async () => {
    const user = userEvent.setup();
    renderInDevShell(<KeyedTool />, { tab: "replications", role: "admin" });

    await user.keyboard("?");

    const sheet = screen.getByRole("dialog", { name: "Keyboard shortcuts" });
    const tool = within(sheet).getByRole("region", { name: "Replications" });
    expect(within(tool).getByText("Next and previous card")).toBeTruthy();
    // Spoken as written, drawn as keycaps.
    expect(within(tool).getAllByText("Cmd+Z").length).toBeGreaterThan(0);
    const shell = within(sheet).getByRole("region", { name: "Everywhere in the editor" });
    expect(within(shell).getByText("Open any tool or record")).toBeTruthy();
  });

  it("does not open from inside a text field", async () => {
    const user = userEvent.setup();
    renderInDevShell(<KeyedTool />, { tab: "replications", role: "admin" });

    await user.type(screen.getByRole("textbox", { name: "Search cards" }), "?");

    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("shows one sheet, not two, for a tool with triage keys", async () => {
    const user = userEvent.setup();
    renderInDevShell(<TriageTool />, { tab: "article-feedback", role: "admin" });

    await user.keyboard("?");

    const dialogs = screen.getAllByRole("dialog");
    expect(dialogs).toHaveLength(1);
    const tool = within(dialogs[0]).getByRole("region", { name: "Feedback" });
    expect(within(tool).getByText("Resolve")).toBeTruthy();
    expect(within(tool).getByText("j / k")).toBeTruthy();
  });
});
