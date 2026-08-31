import { describe, expect, it } from "vitest";
import { stripPreviewPrefix } from "./previewPath";

describe("retired preview address parser", () => {
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
    expect(stripPreviewPrefix("/previewer/2c-b")).toBeNull();
  });

  it("does not resolve inherited object keys to the homepage", () => {
    // A keyed lookup would answer `/preview/constructor` truthily off the prototype.
    expect(stripPreviewPrefix("/previewconstructor")).toBeNull();
    expect(stripPreviewPrefix("/preview/constructor")).toBe("/constructor");
  });

  it("leaves ordinary paths alone", () => {
    expect(stripPreviewPrefix("/substances")).toBeNull();
  });
});
