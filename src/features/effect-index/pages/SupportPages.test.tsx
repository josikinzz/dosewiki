import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { EFFECT_INDEX_DISCORD_INVITE_URL } from "@server/next/effectIndexLegacyRedirects";
import { ContactPage } from "./ContactPage";
import { CopyrightDisclaimerPage } from "./CopyrightDisclaimerPage";
import { DiscordPage } from "./DiscordPage";
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
    expect(screen.getByText("contact@dose.wiki")).toBeInTheDocument();
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
    expect(screen.getByRole("link", { name: "contact@dose.wiki." })).toHaveAttribute(
      "href",
      "mailto:contact@dose.wiki",
    );
    expect(screen.getByText("josikinz#1066")).toBeInTheDocument();
    expect(screen.getByText("/u/josikins")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "contact@dose.wiki" }),
    ).toHaveAttribute("href", "mailto:contact@dose.wiki");
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

    const contactLinks = screen.getAllByRole("link", { name: "contact@dose.wiki" });
    expect(contactLinks).toHaveLength(2);
    for (const link of contactLinks) {
      expect(link).toHaveAttribute("href", "mailto:contact@dose.wiki");
    }
  });
});
