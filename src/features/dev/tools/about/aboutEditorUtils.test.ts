import { describe, expect, it } from "vitest";

import { resizeTextareaToContent } from "./aboutEditorUtils";

function textareaWithScrollHeight(scrollHeight: number): HTMLTextAreaElement {
  const element = document.createElement("textarea");
  Object.defineProperty(element, "scrollHeight", { value: scrollHeight, configurable: true });
  return element;
}

describe("resizeTextareaToContent", () => {
  it("grows to the content between the floor and the cap", () => {
    const element = textareaWithScrollHeight(300);
    resizeTextareaToContent(element, 240, 400);
    expect(element.style.height).toBe("300px");
  });

  it("holds the floor for short content", () => {
    const element = textareaWithScrollHeight(50);
    resizeTextareaToContent(element, 240, 400);
    expect(element.style.height).toBe("240px");
  });

  it("never exceeds the cap, leaving the field to scroll", () => {
    const element = textareaWithScrollHeight(5000);
    resizeTextareaToContent(element, 240, 400);
    expect(element.style.height).toBe("400px");
  });
});
