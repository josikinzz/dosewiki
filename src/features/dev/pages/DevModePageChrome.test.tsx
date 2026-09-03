/* eslint-disable jsx-a11y/aria-role -- `role` here is the component prop for the member role, not an ARIA role */
import { render, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

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

function renderChrome(activeTab: DevModeTab, role: AppRole | null = "editor") {
  const utils = render(
    <DevModePageChrome
      activePrimaryTab={activeTab === "change-log" ? activeTab : "tools"}
      activeTab={activeTab}
      isSignedIn
      role={role}
      sessionStatus="authenticated"
      userEmail="editor@example.test"
      userName="Editor"
      onPrimaryTabChange={vi.fn()}
      onTabChange={vi.fn()}
      onSignIn={vi.fn()}
    />,
  );
  const nav = utils.getByRole("navigation", { name: "Dev mode tools" });
  return { ...utils, nav };
}

describe("DevModePageChrome rail", () => {
  it("renders the tool groups as Content, Intake, Site in that order", () => {
    const { nav } = renderChrome("articles");

    const groups = within(nav).getAllByRole("group");
    expect(groups.map((group) => group.getAttribute("aria-label"))).toEqual(["Content", "Intake", "Site"]);
    for (const group of groups) {
      const label = group.getAttribute("aria-label") ?? "";
      expect(within(group).getByText(label)).toBeTruthy();
    }
  });

  it("places every non-chrome descriptor in its group exactly once, in registry order", () => {
    const { nav } = renderChrome("articles");

    for (const group of within(nav).getAllByRole("group")) {
      const groupId = group.getAttribute("aria-label")?.toLowerCase();
      const expected = TOOL_TABS.filter((tab) => tab.group === groupId).map((tab) => tab.label);
      const items = Array.from(group.querySelectorAll("button, a")).map((el) => el.textContent?.trim());
      expect(items).toEqual(expected);
    }

    for (const tab of TOOL_TABS) {
      expect(within(nav).getAllByText(tab.label)).toHaveLength(1);
    }
    expect(within(nav).queryByText("Change log")).toBeNull();
    expect(within(nav).queryByText("Profile")).toBeNull();
  });

  it("marks the active shell tab and only that tab", () => {
    const { nav } = renderChrome("tag-editor");

    const active = nav.querySelectorAll('[aria-current="page"]');
    expect(active).toHaveLength(1);
    expect(active[0].textContent).toBe("Tags");
    expect(active[0].getAttribute("data-state")).toBe("active");
    expect(nav.querySelectorAll('[data-state="active"]')).toHaveLength(1);
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

  it("renders each descriptor's badge count on its own tab only", () => {
    badgeState.counts = { "trip-reports": 3, feedback: 12 };
    try {
      const { nav } = renderChrome("articles");
      const tripReports = within(nav).getByRole("button", { name: /Trip reports/ });
      expect(within(tripReports).getByText("3")).toBeTruthy();
      const feedback = within(nav).getByRole("button", { name: /Feedback/ });
      expect(within(feedback).getByText("12")).toBeTruthy();
      expect(within(nav).getByRole("button", { name: "Substances" }).textContent).toBe("Substances");
    } finally {
      badgeState.counts = {};
    }
  });

  it("routes shell tab clicks through onTabChange", () => {
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
      />,
    );

    getByRole("button", { name: "Molecules" }).click();
    expect(onTabChange).toHaveBeenCalledWith("molecule-editor");
  });

  it("leaves every tab enabled for an admin session and labels the role", () => {
    const { nav, getByText } = renderChrome("articles", "admin");

    for (const button of Array.from(nav.querySelectorAll("button"))) {
      expect(button.hasAttribute("disabled")).toBe(false);
      expect(button.getAttribute("aria-disabled")).toBeNull();
    }
    expect(getByText("Admin")).toBeInTheDocument();
  });

  /**
   * Every shell tab is clicked; only the open ones may reach `onTabChange`, and
   * every closed one carries the reason as its title.
   */
  function expectRailForRole(role: AppRole, roleLabel: string) {
    const onTabChange = vi.fn();
    const { getByRole, getByText } = render(
      <DevModePageChrome
        activePrimaryTab="tools"
        activeTab="contributors"
        isSignedIn
        role={role}
        sessionStatus="authenticated"
        userEmail="member@example.test"
        userName="Member"
        onPrimaryTabChange={vi.fn()}
        onTabChange={onTabChange}
        onSignIn={vi.fn()}
      />,
    );
    const nav = getByRole("navigation", { name: "Dev mode tools" });

    const shellTabs = TOOL_TABS.filter((tab) => tab.destination.kind === "shell");
    for (const tab of shellTabs) {
      const button = within(nav).getByRole("button", { name: tab.label });
      if (roleMeetsFloor(role, tab.role)) {
        expect(button).toBeEnabled();
        expect(button.getAttribute("aria-disabled")).toBeNull();
        expect(button.hasAttribute("title")).toBe(false);
      } else {
        expect(button).toBeDisabled();
        expect(button.getAttribute("aria-disabled")).toBe("true");
        expect(button.getAttribute("title")).toBe(`${tab.role === "admin" ? "Admin" : "Editor"} role required`);
      }
      button.click();
    }
    const openTabs = shellTabs.filter((tab) => roleMeetsFloor(role, tab.role)).map((tab) => tab.id);
    expect(openTabs.length).toBeGreaterThan(0);
    expect(openTabs.length).toBeLessThan(shellTabs.length);
    expect(onTabChange.mock.calls.map(([tab]) => tab)).toEqual(openTabs);

    // The external launcher stays a plain link: the review route enforces its own role.
    const review = within(nav).getByRole("link", { name: /Review/ });
    expect(review.getAttribute("href")).toBe("/review");

    expect(within(nav).getByRole("button", { name: "Banners" }).getAttribute("title")).toBe("Admin role required");
    expect(getByText(roleLabel)).toBeInTheDocument();
    expect(getByRole("button", { name: "Sign out" })).toBeEnabled();
    return { getByRole };
  }

  it("disables admin tabs with a reason for an editor and keeps editor tabs live", () => {
    const { getByRole } = expectRailForRole("editor", "Editor");
    expect(within(getByRole("navigation", { name: "Dev mode tools" })).getByRole("button", { name: "Substances" })).toBeEnabled();
    expect(getByRole("button", { name: "Change log" })).toBeEnabled();
  });

  it("disables editor and admin tabs with reasons for a contributor and keeps Contributors live", () => {
    const { getByRole } = expectRailForRole("contributor", "Contributor");
    const nav = getByRole("navigation", { name: "Dev mode tools" });
    expect(within(nav).getByRole("button", { name: "Substances" }).getAttribute("title")).toBe("Editor role required");
    expect(within(nav).getByRole("button", { name: "Contributors" })).toBeEnabled();

    const changeLog = getByRole("button", { name: "Change log" });
    expect(changeLog).toBeDisabled();
    expect(changeLog.getAttribute("aria-disabled")).toBe("true");
    expect(changeLog.getAttribute("title")).toBe("Editor role required");
  });

  it("asks a signed-out session to sign in on every tab", () => {
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
      />,
    );
    const nav = getByRole("navigation", { name: "Dev mode tools" });
    for (const button of Array.from(nav.querySelectorAll("button"))) {
      expect(button).toBeDisabled();
      expect(button.getAttribute("title")).toBe("Sign in required");
    }
    expect(getByRole("button", { name: "Sign in" })).toBeEnabled();
  });
});
