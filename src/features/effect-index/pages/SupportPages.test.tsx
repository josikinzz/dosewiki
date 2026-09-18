import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { EFFECT_INDEX_DISCORD_INVITE_URL } from "@server/next/effectIndexLegacyRedirects";
import { ContactPage } from "./ContactPage";
import { CopyrightDisclaimerPage } from "./CopyrightDisclaimerPage";
import { DiscordPage } from "./DiscordPage";
import { DocumentationStyleGuidePage } from "./DocumentationStyleGuidePage";
import { DonatePage } from "./DonatePage";

describe("donate page", () => {
  it("carries every donation option from the old site", () => {
    render(<DonatePage />);

    expect(
      screen.getByText(/we have a number of donation options available/i),
    ).toBeInTheDocument();
    expect(screen.getByText("Any contribution is greatly appreciated!")).toBeInTheDocument();

    expect(screen.getByRole("link", { name: /Effect Index Patreon/ })).toHaveAttribute(
      "href",
      "https://www.patreon.com/JosieKins",
    );
    expect(screen.getByRole("link", { name: /Merchandise Store/ })).toHaveAttribute(
      "href",
      "https://teespring.com/stores/effectindex",
    );
    // The PayPal account is plain text on the old site and stays that way.
    expect(screen.getByText("effectindex@gmail.com")).toBeInTheDocument();
  });

  it("links the Ethereum address and its QR code to the same explorer page", () => {
    render(<DonatePage />);

    const address = "0xaaAcEF54d563CE7d3Cff5bE5cBeEcAbAf5816f78";
    const explorer = `https://etherscan.io/address/${address}`;

    expect(screen.getByRole("link", { name: address })).toHaveAttribute("href", explorer);
    expect(screen.getByAltText(new RegExp(address))).toBeInTheDocument();
  });
});

describe("contact page", () => {
  it("carries the project email and the founder's contact details", () => {
    render(<ContactPage />);

    // The trailing period sits inside the link text on the old site.
    expect(screen.getByRole("link", { name: "effectindex@gmail.com." })).toHaveAttribute(
      "href",
      "mailto:effectindex@gmail.com",
    );
    expect(screen.getByText("josikinz#1066")).toBeInTheDocument();
    expect(screen.getByText("/u/josikins")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "disregardeverythingisay@gmail.com" }),
    ).toHaveAttribute("href", "mailto:disregardeverythingisay@gmail.com");
  });
});

describe("discord page", () => {
  it("sources the invite from the legacy redirect table rather than a second copy", () => {
    render(<DiscordPage />);

    expect(screen.getByRole("link", { name: /^here\.$/ })).toHaveAttribute(
      "href",
      EFFECT_INDEX_DISCORD_INVITE_URL,
    );
  });

  it("does not promote the expired invite to a primary call to action", () => {
    render(<DiscordPage />);

    // The invite is expired upstream; the inline prose link is the faithful port, but a
    // button would make a broken action the page's headline.
    expect(screen.queryByRole("link", { name: /join the discord/i })).not.toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: /^here\.$/ })).toHaveLength(1);
  });

  it("describes the community and lists all six rules", () => {
    render(<DiscordPage />);

    expect(screen.getByText(/semi-private community/i)).toBeInTheDocument();
    expect(screen.getByText(/public waiting room channel/i)).toBeInTheDocument();

    const rules = screen.getAllByRole("listitem");
    expect(rules.map((rule) => rule.textContent)).toEqual([
      "You must be at least 18+ years old.",
      "Please be polite and reasonable.",
      "You may not discuss any drug sources. Not even in DMs.",
      "Keep specific topics within their relevant channels.",
      "This community is inclusive and does not accept any kind of racism, homophobia, sexism, transphobia, ableism, general hatefulness, etc, etc.",
      "This community is relatively Safe For Work (SFW), please do not post overtly sexual or edgy content. This includes hornyposting and excessive shitposting.",
    ]);
  });
});

describe("copyright disclaimer page", () => {
  it("states the licence and how to request removal or reattribution", () => {
    render(<CopyrightDisclaimerPage />);

    // Link text and href disagree on the old site; both are reproduced as written.
    expect(
      screen.getByRole("link", { name: "Creative Commons Attribution-ShareAlike License" }),
    ).toHaveAttribute("href", "https://creativecommons.org/licenses/by-nc-sa/4.0/");

    expect(screen.getByText(/belong to their original creators/i)).toBeInTheDocument();
    expect(screen.getByText(/removed or reattributed/i)).toBeInTheDocument();

    const contactLinks = screen.getAllByRole("link", { name: "effectindex@gmail.com" });
    expect(contactLinks).toHaveLength(2);
    for (const link of contactLinks) {
      expect(link).toHaveAttribute("href", "mailto:effectindex@gmail.com");
    }
  });
});

describe("documentation style guide page", () => {
  it("carries every section of the old style guide, in order", () => {
    render(<DocumentationStyleGuidePage />);

    const headings = screen
      .getAllByRole("heading", { level: 2 })
      .map((heading) => heading.textContent);

    expect(headings).toEqual([
      "Rules of Thumb",
      "Write about facts, note speculation:",
      "Levels of intensity intro",
      "Tiers",
      "Referring to the experiencer",
      "Outro paragraph sentence:",
      "Word preferences:",
      "Grammatical/syntax preferences:",
    ]);
  });

  it("reproduces the word preferences as context/term pairs", () => {
    render(<DocumentationStyleGuidePage />);

    expect(
      screen.getByText("To describe an illusion the subject cannot recognize as such:"),
    ).toBeInTheDocument();
    expect(screen.getByText("Delusion")).toBeInTheDocument();
    expect(screen.getByText("Hallucination / hallucinatory")).toBeInTheDocument();
  });

  it("keeps the nested example under the preferred phrasing", () => {
    render(<DocumentationStyleGuidePage />);

    const preferred = screen.getByText(/“A person” is preferred/);

    expect(preferred.querySelector("li")?.textContent).toBe(
      '"At this level a person experiences morphing"',
    );
  });

  it("keeps the original's own duplicated bullets rather than silently editing content", () => {
    render(<DocumentationStyleGuidePage />);

    // The last two bullets of "Rules of Thumb" are repeated verbatim under "Write about
    // facts, note speculation" on the old site. This is the site's own statement of its own
    // rules, so it is transcribed as written and left for the owner to edit.
    expect(
      screen.getAllByText(/Do not make absolute or black\/white assertions/),
    ).toHaveLength(2);
    expect(
      screen.getAllByText(/Do not talk about the conclusions reached during these states/),
    ).toHaveLength(2);
  });
});
