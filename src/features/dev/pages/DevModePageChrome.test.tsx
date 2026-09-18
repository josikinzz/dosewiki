/* eslint-disable jsx-a11y/aria-role -- `role` here is the component prop for the member role, not an ARIA role */
import { fireEvent, render, within } from "@testing-library/react";
import { beforeAll, describe, expect, it, vi } from "vitest";

const { badgeState } = vi.hoisted(() => ({
  badgeState: { counts: {} as Record<string, number | undefined> },
}));

vi.mock("next-auth/react", () => ({
  signOut: vi.fn(),
}));

vi.mock("@/components/common/Icon", () => ({
  Icon: ({ icon }: { icon: string }) => <span data-icon={icon} />,
}));

vi.mock("./useDevRailBadges", () => ({
  useDevRailBadges: () => badgeState.counts,
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
  const nav = utils.getByRole("navigation", { name: "Dev mode tools" });
  return { ...utils, nav };
}

/** Radix menu triggers toggle on left-button pointerdown. */
function openMenu(trigger: HTMLElement) {
  fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false });
  return document.body.querySelector('[role="menu"]') as HTMLElement;
}

describe("DevModePageChrome rail", () => {
  it("keeps Content inline and collapses Intake and Site into menus for an admin", () => {
    const { nav } = renderChrome("articles", "admin");

    const groups = within(nav).getAllByRole("group");
    expect(groups.map((group) => group.getAttribute("aria-label"))).toEqual(["Content", "Intake", "Site"]);

    const content = groups[0];
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
    badgeState.counts = { "trip-reports": 3, feedback: 12, proposals: 2 };
    try {
      const { nav } = renderChrome("articles", "admin");

      const trigger = within(nav).getByRole("button", { name: "Intake, 17 awaiting review" });
      expect(within(trigger).getByTitle("17 awaiting review").textContent).toBe("17");

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

    const intakeTrigger = within(nav).getByRole("button", { name: "Intake" });
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
    const { nav, getByText } = renderChrome("articles", "admin");

    for (const pill of Array.from(nav.querySelectorAll("button"))) {
      expect(pill.hasAttribute("disabled")).toBe(false);
    }
    expect(within(nav).queryByRole("button", { name: /Locked/ })).toBeNull();
    expect(getByText("Admin")).toBeInTheDocument();
  });

  it("moves admin tools into the Locked menu with reasons for an editor", () => {
    const { nav, getByText } = renderChrome("articles", "editor");

    // Content keeps only the editor-floor tools inline; Intake includes Change Review.
    const content = within(nav).getByRole("group", { name: "Content" });
    const contentItems = Array.from(content.querySelectorAll("button, a")).map((el) => el.textContent?.trim());
    expect(contentItems).toEqual(["Substances", "Review", "Tags", "Index layout"]);
    expect(within(nav).getByRole("button", { name: "Intake" })).toBeTruthy();
    expect(within(nav).getByRole("button", { name: "Site" })).toBeTruthy();

    const lockedTrigger = within(nav).getByRole("button", { name: /^Locked,/ });
    const menu = openMenu(lockedTrigger);
    expect(within(menu).getByText("Glossary")).toBeTruthy();
    expect(within(menu).getByText("Members")).toBeTruthy();
    for (const item of within(menu).getAllByRole("menuitem")) {
      expect(item.getAttribute("aria-disabled")).toBe("true");
    }
    expect(getByText("Editor")).toBeInTheDocument();
  });

  it("shows a contributor only their own tools flat, with everything else in Locked", () => {
    const { nav, getByRole } = renderChrome("contributors", "contributor");

    // The whole rail fits flat: no group menus, the contributor's own tools are pills.
    expect(within(nav).queryByRole("button", { name: "Site" })).toBeNull();
    expect(within(nav).queryByRole("button", { name: "Intake" })).toBeNull();
    expect(within(nav).queryByRole("button", { name: "Substances" })).toBeNull();

    const content = within(nav).getByRole("group", { name: "Content" });
    expect(within(content).getByRole("link", { name: /Review/ }).getAttribute("href")).toBe("/review");

    const site = within(nav).getByRole("group", { name: "Site" });
    const ownTools = Array.from(site.querySelectorAll("button")).map((el) => el.textContent?.trim());
    expect(ownTools).toEqual(["Contributors", "Playlists", "My reports"]);

    const lockedTrigger = within(nav).getByRole("button", { name: "Locked, 14 locked" });
    const menu = openMenu(lockedTrigger);
    const items = within(menu).getAllByRole("menuitem");
    expect(items).toHaveLength(14);
    expect(within(menu).getByText("Substances").parentElement?.textContent).toContain("Editor role required");
    expect(within(menu).getByText("Members").parentElement?.textContent).toContain("Admin role required");

    const changeLog = getByRole("button", { name: "Change log" });
    expect(changeLog).toBeDisabled();
    expect(changeLog.getAttribute("title")).toBe("Editor role required");
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
    const nav = getByRole("navigation", { name: "Dev mode tools" });

    // The Review launcher stays a plain link; every shell tool sits in Locked.
    expect(within(nav).getByRole("link", { name: /Review/ }).getAttribute("href")).toBe("/review");
    const menu = openMenu(within(nav).getByRole("button", { name: `Locked, ${SHELL_TABS.length} locked` }));
    for (const item of within(menu).getAllByRole("menuitem")) {
      expect(item.getAttribute("aria-disabled")).toBe("true");
      expect(within(item).getByText("Sign in required")).toBeTruthy();
    }
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
    const nav = getByRole("navigation", { name: "Dev mode tools" });

    // Same groups as a full-access rail, no Locked overflow, nothing clickable yet.
    expect(within(nav).getAllByRole("group").map((g) => g.getAttribute("aria-label"))).toEqual([
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

    const menu = within(sheet).getByRole("navigation", { name: "Dev mode tools menu" });
    const groups = within(menu).getAllByRole("group").map((group) => group.getAttribute("aria-label"));
    expect(groups).toEqual(["Content", "Intake", "Site"]);

    // Every tool is listed; locked ones carry their reason inline.
    for (const tab of SHELL_TABS) {
      const row = within(menu).getByRole("button", { name: new RegExp(`^${tab.id === "queue" ? "My submissions" : tab.label}`) });
      expect(row.getAttribute("data-state")).toBe(tab.id === "tag-editor" ? "active" : "inactive");
      if (!roleMeetsFloor("editor", tab.role)) {
        expect(row).toBeDisabled();
      }
    }
    expect(within(menu).getByRole("link", { name: /Review/ }).getAttribute("href")).toBe("/review");

    const footer = within(sheet).getByRole("group", { name: "Site sections" });
    expect(within(footer).getByRole("link", { name: "UI kit" }).getAttribute("href")).toBe("/dev/kit");
    expect(within(footer).getByRole("link", { name: "Theme lab" }).getAttribute("href")).toBe("/dev/themes");
    expect(within(footer).getByRole("button", { name: "Change log" })).toBeEnabled();
    expect(within(sheet).getByRole("button", { name: "Sign out" })).toBeEnabled();
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

  it("carries badges into the sheet with a full accessible name", () => {
    badgeState.counts = { "trip-reports": 4 };
    try {
      const { getByRole } = renderPhone("admin");
      fireEvent.click(getByRole("button", { name: "Tools menu, current tool Tags" }));
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
