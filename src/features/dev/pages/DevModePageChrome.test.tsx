/* eslint-disable jsx-a11y/aria-role -- `role` here is the component prop for the member role, not an ARIA role */
import { fireEvent, render, within } from "@testing-library/react";
import { beforeAll, describe, expect, it, vi } from "vitest";

const { badgeState } = vi.hoisted(() => ({
  badgeState: {
    counts: {} as Record<string, number | undefined>,
    readings: {} as Record<string, { failed: boolean } | undefined>,
  },
}));

vi.mock("next-auth/react", () => ({
  signOut: vi.fn(),
}));

vi.mock("@/components/common/Icon", () => ({
  Icon: ({ icon }: { icon: string }) => <span data-icon={icon} />,
}));

vi.mock("./useDevRailBadges", () => ({
  useDevRailBadges: () => badgeState.counts,
  useDevRailBadgeReadings: () => badgeState.readings,
}));

import { roleMeetsFloor, type AppRole } from "@/lib/auth/roles";
import { DevModePageChrome } from "./DevModePageChrome";
import { DEV_TAB_REGISTRY, type DevModeTab } from "./devTabRegistry";

const TOOL_TABS = DEV_TAB_REGISTRY.filter((tab) => tab.group !== "chrome");
const SHELL_TABS = TOOL_TABS.filter((tab) => tab.destination.kind === "shell");
const CONTENT_TABS = TOOL_TABS.filter((tab) => tab.group === "content");

beforeAll(() => {
  // jsdom has no layout; the sheet's open-focus reveal calls scrollIntoView.
  Element.prototype.scrollIntoView = vi.fn();
});

function renderChrome(activeTab: DevModeTab, role: AppRole | null = "editor") {
  const utils = render(
    <DevModePageChrome
      activePrimaryTab={activeTab === "change-log" ? activeTab : "tools"}
      activeTab={activeTab}
      isSignedIn
      role={role}
      sessionStatus="authenticated"
      userEmail="member@example.test"
      userName="Member"
      onPrimaryTabChange={vi.fn()}
      onTabChange={vi.fn()}
      onSignIn={vi.fn()}
      onLeave={vi.fn()}
    />,
  );
  const nav = utils.getByRole("navigation", { name: "Editor tools" });
  return { ...utils, nav };
}

/** Radix menu triggers toggle on left-button pointerdown. */
function openMenu(trigger: HTMLElement) {
  fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false });
  return document.body.querySelector('[role="menu"]') as HTMLElement;
}

/** The Locked list is a popover of text, not a menu: it opens on click. */
function openLocked(trigger: HTMLElement) {
  fireEvent.click(trigger);
  return document.body.querySelector('[role="dialog"][aria-label="Locked tools"]') as HTMLElement;
}

describe("DevModePageChrome rail", () => {
  // First in the file on purpose: React reports a missing key once per
  // component, so a later render would pass even with the key gone.
  it("gives inline and menu rail groups stable keys (no missing-key warning)", () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      // Admin renders Content inline beside Intake and Site menus; a
      // contributor renders every group inline.
      renderChrome("articles", "admin").unmount();
      renderChrome("contributors", "contributor").unmount();
      const keyWarnings = errors.mock.calls.filter((call) =>
        call.some((arg) => typeof arg === "string" && arg.includes('unique "key" prop')),
      );
      expect(keyWarnings).toEqual([]);
    } finally {
      errors.mockRestore();
    }
  });

  it("leads with the Inbox, keeps Content inline and collapses Intake and Site into menus for an admin", () => {
    const { nav } = renderChrome("articles", "admin");

    const groups = within(nav).getAllByRole("group");
    expect(groups.map((group) => group.getAttribute("aria-label"))).toEqual(["Start", "Content", "Intake", "Site"]);
    expect(within(groups[0]).getByRole("button", { name: "Inbox" })).toBeTruthy();

    const content = groups[1];
    const pills = Array.from(content.querySelectorAll("button, a")).map((el) => el.textContent?.trim());
    expect(pills).toEqual(CONTENT_TABS.map((tab) => tab.label));

    for (const label of ["Intake", "Site"]) {
      const trigger = within(nav).getByRole("button", { name: label });
      expect(trigger.getAttribute("aria-haspopup")).toBe("menu");
    }
    expect(within(nav).queryByRole("button", { name: /Locked/ })).toBeNull();
  });

  it("lists the group's tools in its menu and routes clicks through onTabChange", () => {
    const onTabChange = vi.fn();
    const { getByRole } = render(
      <DevModePageChrome
        activePrimaryTab="tools"
        activeTab="articles"
        isSignedIn
        role="admin"
        sessionStatus="authenticated"
        onPrimaryTabChange={vi.fn()}
        onTabChange={onTabChange}
        onSignIn={vi.fn()}
        onLeave={vi.fn()}
      />,
    );

    const intakeTrigger = getByRole("button", { name: "Intake" });
    const menu = openMenu(intakeTrigger);

    fireEvent.click(within(menu).getByRole("menuitem", { name: "Change Review" }));
    expect(onTabChange).toHaveBeenCalledWith("queue");
  });

  it("rolls group badges up onto the menu trigger and keeps full accessible names", () => {
    badgeState.counts = { proposals: 2 };
    try {
      // An editor has no Inbox, so the Intake menu carries the count itself.
      const { nav } = renderChrome("articles", "editor");

      const trigger = within(nav).getByRole("button", { name: "Intake, 2 awaiting review" });
      expect(within(trigger).getByTitle("2 awaiting review").textContent).toBe("2");
      expect(within(openMenu(trigger)).getByRole("menuitem", { name: "My submissions, 2 awaiting review" })).toBeTruthy();
    } finally {
      badgeState.counts = {};
    }
  });

  it("collapses an admin's intake counts into the one Inbox count while each tool keeps its own", () => {
    badgeState.counts = { inbox: 20, "trip-reports": 3, feedback: 12, proposals: 2, "glossary-feedback": 3 };
    try {
      const { nav } = renderChrome("articles", "admin");

      expect(within(nav).getByRole("button", { name: "Inbox, 20 awaiting review" })).toBeTruthy();
      // The menus do not count the same items a second time.
      expect(within(nav).getByRole("button", { name: "Site" })).toBeTruthy();
      const trigger = within(nav).getByRole("button", { name: "Intake" });

      const menu = openMenu(trigger);
      const feedback = within(menu).getByRole("menuitem", { name: "Feedback, 12 awaiting review" });
      expect(within(feedback).getByTitle("12 awaiting review")).toBeTruthy();
      expect(within(menu).getByRole("menuitem", { name: "Change Review, 2 awaiting review" })).toBeTruthy();
    } finally {
      badgeState.counts = {};
    }
  });

  it("marks the active inline tab and only that tab", () => {
    const { nav } = renderChrome("tag-editor");

    const active = nav.querySelectorAll('[aria-current="page"]');
    expect(active).toHaveLength(1);
    expect(active[0].textContent).toContain("Tags");
    expect(active[0].getAttribute("data-state")).toBe("active");
    expect(nav.querySelectorAll('[data-state="active"]')).toHaveLength(1);
  });

  it("marks the menu trigger active when the current tool lives inside it", () => {
    const { nav } = renderChrome("queue", "admin");

    const intakeTrigger = within(nav).getByRole("button", { name: "Intake, current tool Change Review" });
    expect(intakeTrigger.hasAttribute("data-active")).toBe(true);
    expect(nav.querySelectorAll('[aria-current="page"]')).toHaveLength(0);
  });

  it.each(["articles", "review", "writing", "change-log"] as const)(
    "renders Review as an external link with no active state when activeTab is %s",
    (activeTab) => {
      const { nav } = renderChrome(activeTab);

      const review = within(nav).getByRole("link", { name: /Review/ });
      expect(review.tagName).toBe("A");
      expect(review.getAttribute("href")).toBe("/review");
      expect(review.hasAttribute("aria-current")).toBe(false);
      expect(review.getAttribute("data-state")).not.toBe("active");
      expect(review.querySelector('[data-icon="lucide:arrow-up-right"]')).not.toBeNull();
    },
  );

  it("routes inline tab clicks through onTabChange", () => {
    const onTabChange = vi.fn();
    const { getByRole } = render(
      <DevModePageChrome
        activePrimaryTab="tools"
        activeTab="articles"
        isSignedIn
        role="admin"
        sessionStatus="authenticated"
        onPrimaryTabChange={vi.fn()}
        onTabChange={onTabChange}
        onSignIn={vi.fn()}
        onLeave={vi.fn()}
      />,
    );

    getByRole("button", { name: "Molecules" }).click();
    expect(onTabChange).toHaveBeenCalledWith("molecule-editor");
  });

  it("leaves every tab reachable for an admin session and labels the role", () => {
    const { nav, getByRole } = renderChrome("articles", "admin");

    for (const pill of Array.from(nav.querySelectorAll("button"))) {
      expect(pill.hasAttribute("disabled")).toBe(false);
    }
    expect(within(nav).queryByRole("button", { name: /Locked/ })).toBeNull();
    expect(getByRole("button", { name: "Signed in as Member, Admin" })).toBeInTheDocument();
  });

  it("moves admin tools into the Locked menu with reasons for an editor", () => {
    const { nav, getByRole } = renderChrome("articles", "editor");

    // Content keeps only the editor-floor tools inline; Intake includes Change Review.
    const content = within(nav).getByRole("group", { name: "Content" });
    const contentItems = Array.from(content.querySelectorAll("button, a")).map((el) => el.textContent?.trim());
    expect(contentItems).toEqual(["Substances", "Review", "Tags", "Index layout"]);
    expect(within(nav).getByRole("button", { name: "Intake" })).toBeTruthy();
    expect(within(nav).getByRole("button", { name: "Site" })).toBeTruthy();

    const lockedTrigger = within(nav).getByRole("button", { name: /^Locked,/ });
    const panel = openLocked(lockedTrigger);
    // Grouped by what each tool needs, as readable text a keyboard reaches.
    const admin = within(panel).getByRole("region", { name: "Admin role required" });
    expect(within(admin).getByText("People")).toBeTruthy();
    const translator = within(panel).getByRole("region", { name: "Translator role required" });
    expect(within(translator).getByText("Glossary")).toBeTruthy();
    expect(within(panel).queryAllByRole("menuitem")).toHaveLength(0);
    expect(getByRole("button", { name: "Signed in as Member, Editor" })).toBeInTheDocument();
  });

  it("shows a contributor only their own tools flat, with everything else in Locked", () => {
    const { nav, queryByRole } = renderChrome("contributors", "contributor");

    // The whole rail fits flat: no group menus, the contributor's own tools are pills.
    expect(within(nav).queryByRole("button", { name: "Site" })).toBeNull();
    expect(within(nav).queryByRole("button", { name: "Intake" })).toBeNull();
    expect(within(nav).queryByRole("button", { name: "Substances" })).toBeNull();

    // Review needs the editor role too, so it is locked rather than a live link.
    expect(within(nav).queryByRole("group", { name: "Content" })).toBeNull();
    expect(within(nav).queryByRole("link", { name: /Review/ })).toBeNull();

    const site = within(nav).getByRole("group", { name: "Site" });
    const ownTools = Array.from(site.querySelectorAll("button")).map((el) => el.textContent?.trim());
    expect(ownTools).toEqual(["Contributors", "Playlists", "My reports"]);

    // Every locked tool, Change log included, says why in text inside the list.
    const lockedTrigger = within(nav).getByRole("button", { name: "Locked, 17 locked" });
    const panel = openLocked(lockedTrigger);
    expect(within(panel).getAllByRole("listitem")).toHaveLength(17);
    const editorFloor = within(panel).getByRole("region", { name: "Editor role required" });
    for (const label of ["Substances", "Review", "Change log"]) {
      expect(within(editorFloor).getByText(label)).toBeTruthy();
    }
    expect(within(within(panel).getByRole("region", { name: "Admin role required" })).getByText("People")).toBeTruthy();

    expect(queryByRole("button", { name: "Change log" })).toBeNull();
    expect(queryByRole("button", { name: "Utilities" })).toBeNull();
  });

  it("counts locked tools with a neutral lock glyph, not the work-count badge", () => {
    const { nav } = renderChrome("contributors", "contributor");

    const lockedTrigger = within(nav).getByRole("button", { name: /^Locked,/ });
    expect(lockedTrigger.querySelector('[data-icon="lucide:lock"]')).not.toBeNull();
    expect(lockedTrigger.querySelector(".theme-dev-count-badge")).toBeNull();
  });

  it("offers the kit and theme utilities, the keys sheet and sign out from the account menu", () => {
    const { getByRole } = renderChrome("articles", "editor");
    const menu = openMenu(getByRole("button", { name: /^Signed in as Member/ }));
    expect(within(menu).getByRole("menuitem", { name: /^UI kit/ })).toHaveAttribute("href", "/dev/kit");
    expect(within(menu).getByRole("menuitem", { name: /^Theme lab/ })).toHaveAttribute("href", "/dev/themes");
    expect(within(menu).getByRole("menuitem", { name: /Keyboard shortcuts/ })).toBeTruthy();
    expect(within(menu).getByRole("menuitem", { name: "Sign out" })).toBeTruthy();
  });

  it("keeps the utilities out of a contributor's account menu", () => {
    const { getByRole } = renderChrome("contributors", "contributor");
    const menu = openMenu(getByRole("button", { name: /^Signed in as Member/ }));
    expect(within(menu).queryByRole("menuitem", { name: /^UI kit/ })).toBeNull();
    expect(within(menu).getByRole("menuitem", { name: "Sign out" })).toBeTruthy();
  });

  it("marks a count whose refresh failed as possibly out of date", () => {
    badgeState.counts = { proposals: 2 };
    badgeState.readings = { proposals: { failed: true } };
    try {
      const { nav } = renderChrome("articles", "editor");
      const trigger = within(nav).getByRole("button", { name: "Intake, 2 awaiting review, may be out of date" });
      expect(trigger.querySelector("[data-stale]")).not.toBeNull();
    } finally {
      badgeState.counts = {};
      badgeState.readings = {};
    }
  });

  it("names the open tool beside its group menu", () => {
    const { nav } = renderChrome("writing", "editor");
    const site = within(nav).getByRole("button", { name: "Site, current tool Writing" });
    expect(site.hasAttribute("data-active")).toBe(true);
    expect(site.textContent).toContain("Writing");
  });

  it("asks a signed-out session to sign in behind the Locked menu", () => {
    const { getByRole } = render(
      <DevModePageChrome
        activePrimaryTab="tools"
        activeTab="articles"
        isSignedIn={false}
        role={null}
        sessionStatus="unauthenticated"
        onPrimaryTabChange={vi.fn()}
        onTabChange={vi.fn()}
        onSignIn={vi.fn()}
        onLeave={vi.fn()}
      />,
    );
    const nav = getByRole("navigation", { name: "Editor tools" });

    // Every tool, the Review launcher and Change log included, sits in Locked.
    expect(within(nav).queryByRole("link", { name: /Review/ })).toBeNull();
    const panel = openLocked(within(nav).getByRole("button", { name: `Locked, ${TOOL_TABS.length + 1} locked` }));
    const signIn = within(panel).getByRole("region", { name: "Sign in required" });
    expect(within(signIn).getAllByRole("listitem")).toHaveLength(TOOL_TABS.length + 1);
    expect(getByRole("button", { name: "Sign in" })).toBeEnabled();
  });

  it("holds its shape while the session resolves instead of filing every tool under Locked", () => {
    const { getByRole } = render(
      <DevModePageChrome
        activePrimaryTab="tools"
        activeTab="articles"
        isSignedIn={false}
        role={null}
        sessionStatus="loading"
        onPrimaryTabChange={vi.fn()}
        onTabChange={vi.fn()}
        onSignIn={vi.fn()}
        onLeave={vi.fn()}
      />,
    );
    const nav = getByRole("navigation", { name: "Editor tools" });

    // Same groups as a full-access rail, no Locked overflow, nothing clickable yet.
    expect(within(nav).getAllByRole("group").map((g) => g.getAttribute("aria-label"))).toEqual([
      "Start",
      "Content",
      "Intake",
      "Site",
    ]);
    expect(within(nav).queryByRole("button", { name: /Locked/ })).toBeNull();
    for (const label of ["Substances", "Intake", "Site"]) {
      const control = within(nav).getByRole("button", { name: label });
      expect(control).toBeDisabled();
      expect(control.getAttribute("title")).toBe("Checking your account");
    }
    // The reason is visible text on the rail, not only a tooltip.
    expect(getByRole("status").textContent).toBe("Checking your account");
    expect(getByRole("button", { name: "Change log" })).toBeDisabled();
  });
});

describe("DevModePageChrome phone sheet", () => {
  function renderPhone(role: AppRole = "editor", activeTab: DevModeTab = "tag-editor") {
    const onTabChange = vi.fn();
    const onPrimaryTabChange = vi.fn();
    const onLeave = vi.fn();
    const utils = render(
      <DevModePageChrome
        activePrimaryTab="tools"
        activeTab={activeTab}
        isSignedIn
        role={role}
        sessionStatus="authenticated"
        userEmail="editor@example.test"
        userName="Editor"
        onPrimaryTabChange={onPrimaryTabChange}
        onTabChange={onTabChange}
        onSignIn={vi.fn()}
        onLeave={onLeave}
      />,
    );
    return { ...utils, onTabChange, onPrimaryTabChange, onLeave };
  }

  it("names the current tool on the bar and uses the shared disclosure cue", () => {
    const { getByRole, queryByRole } = renderPhone();
    expect(queryByRole("dialog")).toBeNull();

    const trigger = getByRole("button", { name: "Tools menu, current tool Tags" });
    expect(trigger.querySelector("[data-expand-indicator]")).not.toBeNull();
  });

  it("opens with a header, scrolling groups, and a sticky footer with the way out", () => {
    const { getByRole } = renderPhone();
    fireEvent.click(getByRole("button", { name: "Tools menu, current tool Tags" }));

    const sheet = getByRole("dialog");
    expect(within(sheet).getByText("Tools")).toBeTruthy();
    expect(within(sheet).getByRole("button", { name: "Close tools menu" })).toBeTruthy();

    const menu = within(sheet).getByRole("navigation", { name: "Editor tools menu" });
    const groups = within(menu).getAllByRole("group").map((group) => group.getAttribute("aria-label"));
    // The site sections scroll with the tools; locked tools fold at the end;
    // only the session line is pinned.
    expect(groups).toEqual(["Start", "Content", "Intake", "Site", "Site sections", "Locked tools"]);
    expect(within(menu).getByRole("button", { name: "Search tools and records" })).toBeTruthy();

    // Every tool the role opens is a tile; the rest sit folded under Locked
    // with their reason as text.
    const locked = within(menu).getByRole("group", { name: "Locked tools" });
    const lockedToggle = within(locked).getByRole("button", { name: /^Locked,/ });
    expect(lockedToggle.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(lockedToggle);
    expect(lockedToggle.getAttribute("aria-expanded")).toBe("true");
    for (const tab of SHELL_TABS) {
      const label = tab.id === "queue" ? "My submissions" : tab.label;
      if (roleMeetsFloor("editor", tab.role)) {
        const row = within(menu).getByRole("button", { name: new RegExp(`^${label}`) });
        expect(row.getAttribute("data-state")).toBe(tab.id === "tag-editor" ? "active" : "inactive");
      } else {
        expect(within(locked).getByText(label)).toBeTruthy();
      }
    }
    expect(within(menu).getByRole("link", { name: /Review/ }).getAttribute("href")).toBe("/review");

    const footer = within(sheet).getByRole("group", { name: "Site sections" });
    expect(within(footer).getByRole("link", { name: "UI kit" }).getAttribute("href")).toBe("/dev/kit");
    expect(within(footer).getByRole("link", { name: "Theme lab" }).getAttribute("href")).toBe("/dev/themes");
    expect(within(footer).getByRole("button", { name: "Change log" })).toBeEnabled();
    expect(within(sheet).getByRole("button", { name: "Sign out" })).toBeEnabled();
  });

  it("keeps the kit and theme links out of a contributor's sheet", () => {
    const { getByRole } = renderPhone("contributor", "contributors");
    fireEvent.click(getByRole("button", { name: "Tools menu, current tool Contributors" }));

    const sheet = getByRole("dialog");
    expect(within(sheet).queryByRole("link", { name: "UI kit" })).toBeNull();
    expect(within(sheet).queryByRole("link", { name: "Theme lab" })).toBeNull();
    expect(within(sheet).queryByRole("link", { name: /Review/ })).toBeNull();
    // A Change log the role cannot open joins the folded Locked list, with its reason.
    expect(within(sheet).queryByRole("button", { name: /^Change log/ })).toBeNull();
    const locked = within(sheet).getByRole("group", { name: "Locked tools" });
    fireEvent.click(within(locked).getByRole("button", { name: /^Locked,/ }));
    expect(within(within(locked).getByRole("region", { name: "Editor role required" })).getByText("Change log")).toBeTruthy();
  });

  it("focuses and reveals the active row on open instead of the first row", () => {
    const { getByRole } = renderPhone("editor", "queue");
    fireEvent.click(getByRole("button", { name: "Tools menu, current tool My submissions" }));

    const sheet = getByRole("dialog");
    const active = within(sheet).getByRole("button", { name: "My submissions" });
    expect(document.activeElement).toBe(active);
    expect(Element.prototype.scrollIntoView).toHaveBeenCalled();
  });

  it("switches tool and closes on selection", () => {
    const { getByRole, queryByRole, onTabChange } = renderPhone();
    fireEvent.click(getByRole("button", { name: "Tools menu, current tool Tags" }));
    fireEvent.click(within(getByRole("dialog")).getByRole("button", { name: "Substances" }));

    expect(onTabChange).toHaveBeenCalledWith("articles");
    expect(queryByRole("dialog")).toBeNull();
  });

  it("closes from the header close button", () => {
    const { getByRole, queryByRole } = renderPhone();
    fireEvent.click(getByRole("button", { name: "Tools menu, current tool Tags" }));
    expect(getByRole("dialog")).toBeTruthy();

    fireEvent.click(getByRole("button", { name: "Close tools menu" }));
    expect(queryByRole("dialog")).toBeNull();
  });

  it("carries the roll-up count and unsaved state onto the bar, and badges into the sheet", () => {
    badgeState.counts = { "trip-reports": 4, inbox: 4 };
    try {
      const { getByRole } = renderPhone("admin");
      // The bar shows the Inbox's one count: every queue, summed once.
      fireEvent.click(getByRole("button", { name: "Tools menu, current tool Tags, 4 awaiting review" }));
      const sheet = getByRole("dialog");
      expect(within(sheet).getByRole("button", { name: "Trip reports, 4 awaiting review" })).toBeTruthy();
    } finally {
      badgeState.counts = {};
    }
  });

  it("leaves the editor from the sheet and from the rail through the same handler", () => {
    const { getByRole, getAllByRole, queryByRole, onLeave } = renderPhone();
    fireEvent.click(getAllByRole("button", { name: "Leave editor" })[0]);
    expect(onLeave).toHaveBeenCalledTimes(1);

    fireEvent.click(getByRole("button", { name: "Tools menu, current tool Tags" }));
    fireEvent.click(within(getByRole("dialog")).getByRole("button", { name: "Leave editor" }));
    expect(onLeave).toHaveBeenCalledTimes(2);
    expect(queryByRole("dialog")).toBeNull();
  });
});
