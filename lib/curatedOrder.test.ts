import { describe, expect, it } from "vitest";
import { applyCuratedOrder } from "./curatedOrder";

type Item = { slug: string };

const slugOf = (item: Item) => item.slug;
const items: Item[] = [{ slug: "a" }, { slug: "b" }, { slug: "c" }, { slug: "d" }];

describe("applyCuratedOrder", () => {
  it("leads with the curated subset in the curated order", () => {
    expect(applyCuratedOrder(items, ["c", "a"], slugOf).map(slugOf)).toEqual(["c", "a", "b", "d"]);
  });

  it("keeps the incoming default sort for everything unlisted", () => {
    expect(applyCuratedOrder(items, ["d"], slugOf).map(slugOf)).toEqual(["d", "a", "b", "c"]);
  });

  it("ignores slugs that match no item", () => {
    expect(applyCuratedOrder(items, ["gone", "b", "also-gone"], slugOf).map(slugOf)).toEqual([
      "b",
      "a",
      "c",
      "d",
    ]);
  });

  it("places a duplicated slug once, at its first mention", () => {
    expect(applyCuratedOrder(items, ["c", "a", "c"], slugOf).map(slugOf)).toEqual([
      "c",
      "a",
      "b",
      "d",
    ]);
  });

  it("returns the input unchanged when curation is empty or absent", () => {
    expect(applyCuratedOrder(items, [], slugOf).map(slugOf)).toEqual(["a", "b", "c", "d"]);
    expect(applyCuratedOrder(items, undefined, slugOf).map(slugOf)).toEqual(["a", "b", "c", "d"]);
    expect(applyCuratedOrder(items, null, slugOf).map(slugOf)).toEqual(["a", "b", "c", "d"]);
  });

  it("does not mutate the input", () => {
    const input = [...items];
    applyCuratedOrder(input, ["d"], slugOf);
    expect(input.map(slugOf)).toEqual(["a", "b", "c", "d"]);
  });

  it("orders a fully curated list exactly as listed", () => {
    expect(applyCuratedOrder(items, ["d", "c", "b", "a"], slugOf).map(slugOf)).toEqual([
      "d",
      "c",
      "b",
      "a",
    ]);
  });
});
