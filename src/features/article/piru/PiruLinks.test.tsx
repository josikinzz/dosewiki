import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PiruLogLink, PiruOpenChip } from "./PiruLinks.client";

describe("Piru links", () => {
  it("links the header chip to the substance in Piru", () => {
    render(<PiruOpenChip slug="mdma" />);

    expect(screen.getByRole("link", { name: /Open in Piru/ })).toHaveAttribute(
      "href",
      "https://kagerou.glass/piru/open?substance=mdma&from=dosewiki",
    );
  });

  it("links the log pill to the substance and the selected route", () => {
    render(<PiruLogLink slug="mdma" routeKey="Oral" routeLabel="Oral" />);

    expect(
      screen.getByRole("link", { name: /Log a dose in Piru/ }),
    ).toHaveAttribute(
      "href",
      "https://kagerou.glass/piru/log?substance=mdma&route=oral&from=dosewiki",
    );
  });
});
