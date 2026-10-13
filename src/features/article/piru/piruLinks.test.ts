import { describe, expect, it } from "vitest";
import {
  buildPiruLogHref,
  buildPiruOpenHref,
  piruRouteParam,
} from "./piruLinks";

function params(href: string): Record<string, string> {
  return Object.fromEntries(new URL(href).searchParams);
}

describe("Piru link builder", () => {
  it("stages the substance and the route in the log link", () => {
    const href = buildPiruLogHref("mdma", "Oral");

    expect(new URL(href).origin + new URL(href).pathname).toBe(
      "https://kagerou.glass/piru/log",
    );
    expect(params(href)).toEqual({
      substance: "mdma",
      route: "oral",
      from: "dosewiki",
    });
  });

  it("leaves the route out when the article gives none", () => {
    expect(params(buildPiruLogHref("mdma", ""))).toEqual({
      substance: "mdma",
      from: "dosewiki",
    });
    expect(params(buildPiruLogHref("mdma"))).toEqual({
      substance: "mdma",
      from: "dosewiki",
    });
  });

  it("encodes slugs and free-form route names so they survive the round trip", () => {
    const href = buildPiruLogHref("2c-b & friends", "Oral & intranasal");

    expect(params(href)).toMatchObject({
      substance: "2c-b & friends",
      route: "oral & intranasal",
    });
    // Spaces as %20: the receiving app's URL parser reads `+` as a literal plus.
    expect(href).not.toContain("+");
  });

  it("points the open link at the substance page", () => {
    const href = buildPiruOpenHref("lsd");

    expect(new URL(href).pathname).toBe("/piru/open");
    expect(params(href)).toEqual({ substance: "lsd", from: "dosewiki" });
  });

  it("lowercases and trims route keys", () => {
    expect(piruRouteParam(" Insufflated ")).toBe("insufflated");
    expect(piruRouteParam("   ")).toBeNull();
    expect(piruRouteParam(null)).toBeNull();
  });
});
