import { describe, expect, it } from "vitest";
import { proposalChangelogArticles } from "./proposalChangelogStamp";

describe("proposalChangelogArticles", () => {
  it("stamps every article target when the proposal carried no changelog block", () => {
    expect(
      proposalChangelogArticles(undefined, [
        { slug: "lsd", id: 1, title: "LSD" },
        { slug: "mdma", id: 2, title: "MDMA" },
      ]),
    ).toEqual([
      { id: 1, title: "LSD", slug: "lsd" },
      { id: 2, title: "MDMA", slug: "mdma" },
    ]);
  });

  it("prefers production's id and title over the payload's", () => {
    expect(
      proposalChangelogArticles([{ id: 0, title: "Lsd draft", slug: "lsd" }], [
        { slug: "lsd", id: 7, title: "LSD" },
      ]),
    ).toEqual([{ id: 7, title: "LSD", slug: "lsd" }]);
  });

  it("falls back to the payload stamp, then the slug, for a row without id or title", () => {
    expect(
      proposalChangelogArticles([{ id: 5, title: "4-HO-MET", slug: "4-ho-met" }], [
        { slug: "4-ho-met", id: null, title: "  " },
        { slug: "new-substance", id: null, title: null },
      ]),
    ).toEqual([
      { id: 5, title: "4-HO-MET", slug: "4-ho-met" },
      { id: 0, title: "new-substance", slug: "new-substance" },
    ]);
  });

  it("keeps the payload stamps for a proposal with no article targets", () => {
    const provided = [{ id: 1, title: "LSD", slug: "lsd" }];
    expect(proposalChangelogArticles(provided, [])).toEqual(provided);
    expect(proposalChangelogArticles(undefined, [])).toEqual([]);
  });
});
