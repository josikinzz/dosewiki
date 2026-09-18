import { describe, expect, it } from "vitest";
import { normalizeWhitespace, toInitials } from "./text";

describe("text helpers", () => {
  it("normalizes Windows newlines", () => {
    expect(normalizeWhitespace("line 1\r\nline 2\r\n")).toBe("line 1\nline 2\n");
  });

  it("builds initials from the first two non-empty words", () => {
    expect(toInitials("Dose Wiki")).toBe("DW");
    expect(toInitials("  alexander   shulgin  ")).toBe("AS");
  });

  it("produces readable initials for empty, short, and punctuation-heavy names", () => {
    expect(toInitials("")).toBe("");
    expect(toInitials("x")).toBe("X");
    expect(toInitials("-_Illuminated_-")).toBe("I");
    expect(toInitials("✨")).toBe("");
  });
});
