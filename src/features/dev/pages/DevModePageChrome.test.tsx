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

import { DevModePageChrome } from "./DevModePageChrome";
import { DEV_TAB_REGISTRY, type DevModeTab } from "./devTabRegistry";

const TOOL_TABS = DEV_TAB_REGISTRY.filter((tab) => tab.group !== "chrome");

function renderChrome(activeTab: DevModeTab) {
  const utils = render(
    <DevModePageChrome
      activePrimaryTab={activeTab === "change-log" ? activeTab : "tools"}
      activeTab={activeTab}
      isSignedIn
      canEdit
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
        canEdit
        sessionStatus="authenticated"
        onPrimaryTabChange={vi.fn()}
        onTabChange={onTabChange}
        onSignIn={vi.fn()}
      />,
    );

    getByRole("button", { name: "Molecules" }).click();
    expect(onTabChange).toHaveBeenCalledWith("molecule-editor");
  });

  it("leaves every tab enabled for an editor session", () => {
    const { nav } = renderChrome("articles");

    for (const button of Array.from(nav.querySelectorAll("button"))) {
      expect(button.hasAttribute("disabled")).toBe(false);
      expect(button.getAttribute("aria-disabled")).toBeNull();
    }
  });

  it("disables editor-only tabs with a reason for a signed-in contributor and keeps the rest live", () => {
    const onTabChange = vi.fn();
    const { getByRole } = render(
      <DevModePageChrome
        activePrimaryTab="tools"
        activeTab="contributors"
        isSignedIn
        canEdit={false}
        sessionStatus="authenticated"
        userEmail="reader@example.test"
        onPrimaryTabChange={vi.fn()}
        onTabChange={onTabChange}
        onSignIn={vi.fn()}
      />,
    );
    const nav = getByRole("navigation", { name: "Dev mode tools" });

    const shellTabs = TOOL_TABS.filter((tab) => tab.destination.kind === "shell");
    for (const tab of shellTabs) {
      const button = within(nav).getByRole("button", { name: tab.label });
      if (tab.role === "editor") {
        expect(button).toBeDisabled();
        expect(button.getAttribute("aria-disabled")).toBe("true");
        expect(button.getAttribute("title")).toBe("Editor role required");
      } else {
        expect(button).toBeEnabled();
        expect(button.getAttribute("aria-disabled")).toBeNull();
        expect(button.hasAttribute("title")).toBe(false);
      }
      button.click();
    }
    const openTabs = shellTabs.filter((tab) => tab.role !== "editor").map((tab) => tab.id);
    expect(onTabChange.mock.calls.map(([tab]) => tab)).toEqual(openTabs);

    // The external launcher stays a plain link: the review route enforces its own role.
    const review = within(nav).getByRole("link", { name: /Review/ });
    expect(review.getAttribute("href")).toBe("/review");

    const changeLog = getByRole("button", { name: "Change log" });
    expect(changeLog).toBeDisabled();
    expect(changeLog.getAttribute("title")).toBe("Editor role required");
    expect(getByRole("button", { name: "Sign out" })).toBeEnabled();
  });
});
