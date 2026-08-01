import { afterEach, describe, expect, it, vi } from "vitest";
import { revealEditorElement } from "./revealEditor";

/**
 * The mobile editor reveal, at its seam: a media-query environment and an
 * element box in → a scroll call (or deliberately none) out.
 */

function mockMedia(matchers: Record<string, boolean>) {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    writable: true,
    value: (query: string) => ({ matches: matchers[query] ?? false, media: query }),
  });
}

/** An element whose box we control, with scrollIntoView spied. */
function elementAt(top: number, height: number) {
  const element = document.createElement("div");
  element.getBoundingClientRect = () =>
    ({
      top,
      bottom: top + height,
      left: 0,
      right: 300,
      width: 300,
      height,
      x: 0,
      y: top,
      toJSON: () => ({}),
    }) as DOMRect;
  element.scrollIntoView = vi.fn();
  return element;
}

const SHEET = "(max-width: 63.999rem)";
const REDUCED = "(prefers-reduced-motion: reduce)";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("Theme Lab editor reveal", () => {
  it("does not scroll on desktop, where the editor is pinned already", () => {
    mockMedia({ [SHEET]: false });
    const editor = elementAt(-400, 200);

    expect(revealEditorElement(editor)).toBeNull();
    expect(editor.scrollIntoView).not.toHaveBeenCalled();
  });

  it("does not scroll when the editor is already on screen", () => {
    mockMedia({ [SHEET]: true });
    window.innerHeight = 800;
    const editor = elementAt(100, 200);

    expect(revealEditorElement(editor)).toBeNull();
    expect(editor.scrollIntoView).not.toHaveBeenCalled();
  });

  it("scrolls to the nearest edge, smoothly, when the editor is off screen", () => {
    mockMedia({ [SHEET]: true });
    window.innerHeight = 800;
    const editor = elementAt(-300, 200);

    expect(revealEditorElement(editor)).toEqual({ behavior: "smooth", block: "nearest" });
    expect(editor.scrollIntoView).toHaveBeenCalledWith({ behavior: "smooth", block: "nearest" });
  });

  it("jumps instead of animating when the visitor asked for reduced motion", () => {
    mockMedia({ [SHEET]: true, [REDUCED]: true });
    window.innerHeight = 800;
    const editor = elementAt(-300, 200);

    expect(editor.scrollIntoView).not.toHaveBeenCalled();
    expect(revealEditorElement(editor)).toEqual({ behavior: "auto", block: "nearest" });
    expect(editor.scrollIntoView).toHaveBeenCalledWith({ behavior: "auto", block: "nearest" });
  });
});
