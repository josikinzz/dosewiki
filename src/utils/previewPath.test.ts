import { describe, expect, it } from "vitest";
import {
  isPreviewPath,
  PREVIEW_HOME_PATH,
  stripPreviewPrefix,
  toAppPath,
  toPreviewPath,
} from "./previewPath";

describe("preview address space", () => {
  it("resolves the homepage from every spelling of the bare prefix", () => {
    expect(stripPreviewPrefix("/preview")).toBe("/");
    expect(stripPreviewPrefix("/preview/")).toBe("/");
    expect(stripPreviewPrefix("/preview/home")).toBe("/");
    expect(stripPreviewPrefix("/preview/home/")).toBe("/");
  });

  it("resolves a section to the route it mirrors", () => {
    expect(stripPreviewPrefix("/preview/substances")).toBe("/substances");
    expect(stripPreviewPrefix("/preview/replications/tutorials")).toBe(
      "/replications/tutorials",
    );
  });

  it("does not claim paths that merely start with the prefix text", () => {
    expect(stripPreviewPrefix("/previewing")).toBeNull();
    expect(stripPreviewPrefix("/preview-mode")).toBeNull();
    expect(isPreviewPath("/previewer/2c-b")).toBe(false);
  });

  it("does not resolve inherited object keys to the homepage", () => {
    // A keyed lookup would answer `/preview/constructor` truthily off the prototype.
    expect(stripPreviewPrefix("/previewconstructor")).toBeNull();
    expect(stripPreviewPrefix("/preview/constructor")).toBe("/constructor");
  });

  it("leaves ordinary paths alone", () => {
    expect(stripPreviewPrefix("/substances")).toBeNull();
    expect(toAppPath("/substances")).toBe("/substances");
    expect(toAppPath("/preview/substances")).toBe("/substances");
  });

  it("round-trips app paths through their preview address", () => {
    for (const appPath of ["/", "/substances", "/replications/tutorials", "/2c-b"]) {
      expect(stripPreviewPrefix(toPreviewPath(appPath))).toBe(appPath);
    }
  });

  it("gives the homepage an address of its own", () => {
    // `/preview` alone cannot be it: `/` on a construction host is the holding page, and
    // the prefix has to name the real homepage explicitly for a link to be shareable.
    expect(toPreviewPath("/")).toBe(PREVIEW_HOME_PATH);
  });

  it("prefixes a path that carries a query string", () => {
    expect(toPreviewPath("/search?q=lsd")).toBe("/preview/search?q=lsd");
  });
});
