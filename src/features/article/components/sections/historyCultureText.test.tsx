import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { renderWithBoldYears } from "./historyCultureText";

function boldedIn(text: string): string[] {
  const { container } = render(<p>{renderWithBoldYears(text)}</p>);
  return Array.from(container.querySelectorAll("strong")).map(
    (node) => node.textContent ?? "",
  );
}

describe("renderWithBoldYears", () => {
  it("bolds standalone years and decade forms", () => {
    expect(boldedIn("Synthesised in 1912, rediscovered in the 1970s.")).toEqual([
      "1912",
      "1970s",
    ]);
  });

  it("leaves the number in a code designation alone", () => {
    // The Edgewood agent codes are the reported case: "EA-1298" is a compound
    // designation, not a year, and the hyphen alone opened a word boundary.
    expect(boldedIn("under the code designation EA-1298 as part of")).toEqual([]);
    expect(boldedIn("JWH-1250 and NIH-2044 were screened.")).toEqual([]);
  });

  it("still bolds both ends of a year range", () => {
    expect(boldedIn("Banned between 1966-1970 in most states.")).toEqual([
      "1966",
      "1970",
    ]);
    expect(boldedIn("Banned between 1966–1970.")).toEqual(["1966", "1970"]);
  });

  it("keeps a code designation from suppressing a real year beside it", () => {
    expect(boldedIn("EA-1298 was tested in 1953.")).toEqual(["1953"]);
  });

  it("ignores four-digit numbers above the plausible year range", () => {
    expect(boldedIn("A 2500 mg dose was administered.")).toEqual([]);
  });

  it("returns the original text when there is nothing to bold", () => {
    expect(boldedIn("No dates appear in this sentence.")).toEqual([]);
  });
});
