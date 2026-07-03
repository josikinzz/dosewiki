import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import type { NormalizedUserProfile } from "@/data/userProfiles";
import { AboutPage } from "./AboutPage";

const founderProfiles: NormalizedUserProfile[] = [
  {
    key: "JOSIE",
    displayName: "Josie Founder",
    aliases: [],
    avatarUrl: null,
    bio: "",
    links: [],
    hasCustomBio: false,
  },
  {
    key: "ALEX",
    displayName: "Alex Contributor",
    aliases: [],
    avatarUrl: null,
    bio: "",
    links: [],
    hasCustomBio: false,
  },
];

function renderAboutPage() {
  return render(
    <AboutPage
      founderProfiles={founderProfiles}
      previewSnapshots={[]}
      missionContent={<p>Mission test copy for harm reduction.</p>}
      moleculeCount={572}
    />,
  );
}

beforeEach(() => {
  window.history.pushState(null, "", "/about");
});

describe("AboutPage tabs", () => {
  it("shows Mission content by default", () => {
    renderAboutPage();

    expect(screen.getByRole("tab", { name: /mission/i })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByRole("tab", { name: /open data/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /contributors/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /documentation/i })).toBeInTheDocument();
    expect(
      screen.getByText("Mission test copy for harm reduction."),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: /open data/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: /founders & contributors/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: /documentation/i }),
    ).not.toBeInTheDocument();
  });

  it("reveals open data and download tooling when Open Data is selected", async () => {
    const user = userEvent.setup();
    renderAboutPage();

    await user.click(screen.getByRole("tab", { name: /open data/i }));

    expect(
      screen.getByRole("heading", { name: /open data/i }),
    ).toBeInTheDocument();
    expect(screen.getByText("SubstanceIndex.json")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /github repository/i }),
    ).toHaveAttribute("href", "https://github.com/josikinzz/dosewiki");
    expect(
      screen.getByRole("heading", { name: /molecule art pack/i }),
    ).toBeInTheDocument();
    expect(screen.getByText("molecules.json")).toBeInTheDocument();
  });

  it("reveals founder cards when Contributors is selected", async () => {
    const user = userEvent.setup();
    renderAboutPage();

    await user.click(screen.getByRole("tab", { name: /contributors/i }));

    expect(
      screen.getByRole("heading", { name: /founders & contributors/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /josie founder/i }),
    ).toHaveAttribute("href", "/contributors/josie");
    expect(
      screen.getByRole("link", { name: /alex contributor/i }),
    ).toHaveAttribute("href", "/contributors/alex");
  });

  it("uses hash anchors without making the selected panel the native scroll target", async () => {
    window.history.pushState(null, "", "/about#contributors");

    renderAboutPage();

    await waitFor(() => {
      expect(screen.getByRole("tab", { name: /contributors/i })).toHaveAttribute(
        "aria-selected",
        "true",
      );
    });

    const panel = screen.getByRole("tabpanel", {
      name: /founders & contributors/i,
    });
    const hashAnchor = document.getElementById("contributors");

    expect(panel).toHaveAttribute("id", "about-panel-contributors");
    expect(hashAnchor).not.toBeNull();
    expect(hashAnchor).not.toBe(panel);
    expect(hashAnchor?.closest('[aria-hidden="true"]')).not.toBeNull();
  });

  it("reveals documentation links when Documentation is selected", async () => {
    const user = userEvent.setup();
    renderAboutPage();

    await user.click(screen.getByRole("tab", { name: /documentation/i }));

    expect(
      screen.getByRole("heading", { name: /documentation/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /how articles are made/i }),
    ).toHaveAttribute("href", "/docs/how");
    expect(
      screen.getByRole("link", { name: /how dose\.wiki is built/i }),
    ).toHaveAttribute("href", "/docs/code");
    expect(
      screen.getByRole("link", { name: /license & reuse/i }),
    ).toHaveAttribute("href", "/docs/license");
  });
});

describe("AboutPage public export contract", () => {
  it("keeps archival snapshot actions without the removed explanatory heading", async () => {
    const user = userEvent.setup();
    renderAboutPage();

    await user.click(screen.getByRole("tab", { name: /open data/i }));

    expect(screen.queryByText("Download archival snapshot")).not.toBeInTheDocument();
    expect(screen.queryByText(/Convex is the live runtime source/i)).not.toBeInTheDocument();
    expect(screen.getByText("Static JSON snapshot")).toBeInTheDocument();
    expect(screen.getByText("GitHub Repository")).toBeInTheDocument();
    expect(screen.queryByText("Full database export")).not.toBeInTheDocument();
  });
});
