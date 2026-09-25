import { screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import type { AppRole } from "@/lib/auth/roles";

const { sessionState } = vi.hoisted(() => ({
  sessionState: { current: { user: { email: "ada@example.com", glossaryLocales: [] as string[] } } },
}));

vi.mock("next-auth/react", () => ({
  signOut: vi.fn(),
  useSession: () => ({ status: "authenticated", data: sessionState.current }),
}));
vi.mock("@/components/common/Icon", () => ({
  Icon: ({ icon }: { icon: string }) => <span data-icon={icon} />,
}));

import { renderInDevShell } from "@/features/dev/pages/devShellTestHarness";
import { resetDevRailBadgesForTests } from "@/features/dev/pages/useDevRailBadges";

import { HomeTab } from "./HomeTab";

beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
});

type Answer = { status?: number; body: unknown };

/** Every read the Home and the rail make, answered by path (plus `?locale=` for the translation inbox). */
const HEALTHY: Record<string, Answer> = {
  "/api/dev/trip-reports/needs-review-count": { body: { ok: true, count: 2 } },
  "/api/feedback/pending-count": { body: { ok: true, article: 1, site: 1, total: 2 } },
  "/api/dev/proposals/count": { body: { ok: true, submitted: 3 } },
  "/api/citation-evidence/open-count": { body: { ok: true, count: 4 } },
  "/api/glossary-feedback/pending-count": { body: { ok: true, total: 1 } },
  "/api/dev/review-recommendations": { body: { ok: true, recommendations: [{ slug: "dmt" }] } },
  "/api/dev/invites": {
    body: {
      ok: true,
      continuationCursor: null,
      invites: [
        { id: "inv-1", role: "editor", createdBy: "admin@example.com", createdAt: "2026-09-20T00:00:00.000Z", expiresAt: "2026-09-27T00:00:00.000Z", maxUses: 1, redemptions: [], status: "active", note: "For Ben" },
        { id: "inv-2", role: "translator", createdBy: "admin@example.com", createdAt: "2026-09-01T00:00:00.000Z", expiresAt: "2026-09-08T00:00:00.000Z", maxUses: 1, redemptions: [], status: "expired" },
      ],
    },
  },
  "/api/dev/my-work": {
    body: {
      ok: true,
      drafts: [{ slug: "lsd", title: "LSD", updatedAt: "2026-09-01T00:00:00.000Z" }],
      proposals: [{
        _id: "prop-1", proposerName: "Ada", isAuthor: true, status: "changes_requested", summary: "Fix LSD onset",
        createdAt: "2026-09-02T00:00:00.000Z", updatedAt: "2026-09-02T00:00:00.000Z",
        targets: [{ kind: "article", key: "lsd", baseHash: "h" }], commentCount: 1,
      }],
    },
  },
  "/api/dev/translation-inbox?locale=de": { body: { ok: true, locale: "de", items: [], total: 7, counts: {} } },
  "/api/dev/translation-inbox?locale=nl": { body: { ok: true, locale: "nl", items: [], total: 0, counts: {} } },
  "/api/dev/contributor-profile?key=ADA": {
    body: {
      ok: true,
      profile: { key: "ADA", displayName: "Ada", bio: "", links: [], avatarUrl: null, storedAvatarUrl: null },
      works: [],
      reports: [],
    },
  },
};

let requested: string[] = [];

function stubNetwork(overrides: Record<string, Answer> = {}) {
  const answers = { ...HEALTHY, ...overrides };
  requested = [];
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
    const url = new URL(String(input), "https://dose.wiki");
    const locale = url.searchParams.get("locale");
    const key = url.searchParams.get("key");
    const path = locale ? `${url.pathname}?locale=${locale}` : key ? `${url.pathname}?key=${key}` : url.pathname;
    requested.push(path);
    const answer = answers[path];
    if (!answer) return Response.json({ error: `Unexpected ${path}` }, { status: 404 });
    return Response.json(answer.body, { status: answer.status ?? 200 });
  }));
}

function renderHome(role: AppRole, glossaryLocales: string[] = []) {
  sessionState.current = { user: { email: "ada@example.com", glossaryLocales } };
  renderInDevShell(<HomeTab role={role} profileKey="ADA" />, { tab: "home", role });
  return screen.getByRole("region", { name: "Your work" });
}

const cardTitles = (home: HTMLElement) =>
  within(home).getAllByRole("heading", { level: 2 }).map((heading) => heading.textContent);

const hrefs = (home: HTMLElement) =>
  within(home).getAllByRole("link").map((link) => link.getAttribute("href"));

beforeEach(() => {
  resetDevRailBadgesForTests();
  stubNetwork();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Home, per role", () => {
  it("shows an admin everything waiting and the pending invites, and nothing else", async () => {
    const home = renderHome("admin");

    const inbox = await within(home).findByRole("link", { name: /^Inbox/ });
    await waitFor(() => expect(inbox).toHaveTextContent("13"));
    expect(within(home).getByRole("link", { name: /^Trip reports/ })).toHaveTextContent("2");
    expect(within(home).getByRole("link", { name: /^Citations/ })).toHaveTextContent("4");
    expect(within(home).getByRole("link", { name: /^Article feedback/ })).toHaveTextContent("1");
    expect(within(home).getByRole("link", { name: /^Site feedback/ })).toHaveTextContent("1");
    // Only the active invite is pending; the expired one is history.
    expect(await within(home).findByText(/For Ben/)).toBeTruthy();
    expect(within(home).queryByText(/expired/i)).toBeNull();

    expect(cardTitles(home)).toEqual(["Waiting on admins", "Pending invites"]);
    expect(requested).not.toContain("/api/dev/my-work");
    expect(requested.some((path) => path.startsWith("/api/dev/translation-inbox"))).toBe(false);
  });

  it("shows an editor their drafts and open proposals, and nothing else", async () => {
    const home = renderHome("editor");

    expect(await within(home).findByRole("link", { name: /^LSD/ })).toBeTruthy();
    const proposal = within(home).getByRole("link", { name: /Fix LSD onset/ });
    expect(proposal).toHaveTextContent("Changes requested");

    expect(cardTitles(home)).toEqual(["My drafts", "My open proposals"]);
    expect(requested).not.toContain("/api/dev/invites");
  });

  it("shows a translator the inbox count per language with Continue, and nothing else", async () => {
    const home = renderHome("translator", ["de", "nl"]);

    const german = await within(home).findByRole("listitem", { name: /German/ });
    await waitFor(() => expect(german).toHaveTextContent("7"));
    expect(within(german).getByRole("link", { name: /Continue/ })).toBeTruthy();
    const dutch = within(home).getByRole("listitem", { name: /Dutch/ });
    await waitFor(() => expect(dutch).toHaveTextContent("Nothing waiting"));

    expect(cardTitles(home)).toEqual(["Translation inbox"]);
    expect(requested).not.toContain("/api/dev/my-work");
    expect(requested).not.toContain("/api/dev/invites");
  });

  it("shows an editor who also translates both sets of cards", async () => {
    const home = renderHome("editor_translator", ["de"]);

    await within(home).findByRole("link", { name: /^LSD/ });
    expect(cardTitles(home)).toEqual(["My drafts", "My open proposals", "Translation inbox"]);
  });

  it("shows a contributor a profile checklist, and nothing else", async () => {
    const home = renderHome("contributor");

    const checklist = await within(home).findByRole("list", { name: "Profile checklist" });
    await waitFor(() => expect(within(checklist).getByRole("listitem", { name: /Display name/ })).toHaveTextContent("Done"));
    expect(within(checklist).getByRole("listitem", { name: /Short bio/ })).toHaveTextContent("To do");
    expect(within(checklist).getByRole("listitem", { name: /Profile picture/ })).toHaveTextContent("To do");
    expect(within(checklist).getByRole("listitem", { name: /link/i })).toHaveTextContent("To do");

    expect(cardTitles(home)).toEqual(["Your profile"]);
    expect(requested).not.toContain("/api/dev/my-work");
  });
});

describe("Home cards", () => {
  it.each([
    ["admin", [], [
      "/dev/inbox",
      "/dev/trip-report-submissions",
      "/dev/article-feedback?source=article",
      "/dev/article-feedback?source=site",
      "/dev/glossary?translationView=inbox",
      "/dev/citation-review",
      "/dev/queue",
      "/dev/queue",
      "/dev/people",
    ]],
    ["editor", [], ["/dev/articles/lsd", "/dev/queue/prop-1"]],
    // In the site's language order, whatever order the grant lists them in.
    ["translator", ["de", "nl"], [
      "/dev/glossary?locale=nl&translationView=inbox",
      "/dev/glossary?locale=de&translationView=inbox",
    ]],
    ["contributor", [], [
      "/dev/contributors?scope=me",
      "/dev/contributors?scope=me",
      "/dev/contributors?scope=me",
      "/dev/contributors?scope=me",
    ]],
  ] as const)("link a %s to the exact item each card names", async (role, locales, expected) => {
    const home = renderHome(role, [...locales]);

    await waitFor(() => expect(hrefs(home)).toEqual(expected), { timeout: 1500 });
  });
});

describe("Home counts", () => {
  it("says a count that failed to load is unknown, never zero", async () => {
    stubNetwork({ "/api/citation-evidence/open-count": { status: 500, body: { error: "down" } } });
    const home = renderHome("admin");

    const citations = await within(home).findByRole("link", { name: /^Citations/ });
    await waitFor(() => expect(citations).toHaveTextContent("Unknown"));
    expect(citations).not.toHaveTextContent(/\b0\b/);
    // The Inbox total cannot be complete without it, so it says so.
    await waitFor(() => expect(within(home).getByRole("link", { name: /^Inbox/ })).toHaveTextContent("At least 9"));
  });

  it("says a language whose inbox failed to load is unknown, never zero", async () => {
    stubNetwork({ "/api/dev/translation-inbox?locale=de": { status: 500, body: { error: "down" } } });
    const home = renderHome("translator", ["de"]);

    const german = await within(home).findByRole("listitem", { name: /German/ });
    await waitFor(() => expect(german).toHaveTextContent("Unknown"));
    expect(german).not.toHaveTextContent("Nothing waiting");
  });

  it("tells an editor their work could not load instead of showing an empty list", async () => {
    stubNetwork({ "/api/dev/my-work": { status: 500, body: { error: "Unable to load your drafts and proposals right now." } } });
    const home = renderHome("editor");

    expect(await within(home).findAllByText("Unable to load your drafts and proposals right now.")).not.toHaveLength(0);
    expect(within(home).queryByText(/No saved drafts/)).toBeNull();
  });
});
