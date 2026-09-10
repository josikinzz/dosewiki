import { describe, expect, it } from "vitest";
import {
  projectPublicEffectIndexPost,
  projectPublicEffectIndexPosts,
  unwrapMongoDate,
} from "../src/data/projections/effectIndexArchiveProjections";

/**
 * Shaped exactly like the two rows that exist in production: `payload` is a JSON *string*
 * of the raw Mongo document, reserved keys and extended-JSON wrappers intact, and the key
 * order differs between rows (so nothing may be read positionally).
 */
const siteUpdatesRow = {
  kind: "post",
  key: "site-updates",
  importedAt: 1785262822345,
  payload: JSON.stringify({
    _id: { $oid: "5c522e27ef61181624530e25" },
    slug: "site-updates",
    author: "josikinz",
    datetime: { $date: "2019-01-30T23:07:19.231Z" },
    title: "Site updates",
    body: "After a several month hiatus, the [SEI form system](https://example.org/) is back.",
    __v: 0,
  }),
};

const welcomeRow = {
  kind: "post",
  key: "welcome-to-the-effect-index",
  importedAt: 1785262822345,
  payload: JSON.stringify({
    _id: { $oid: "5b41003638dd2242a72c8eee" },
    author: "Viscid",
    datetime: { $date: "2018-07-07T18:02:30.681Z" },
    title: "Welcome to the Effect Index",
    body: "We are pleased to announce the launch of [Effect Index](/).",
    slug: "welcome-to-the-effect-index",
    __v: 0,
  }),
};

describe("effect index archive read projections", () => {
  it("projects a well-formed archive record, unwrapping the Mongo-wrapped date", () => {
    expect(projectPublicEffectIndexPost(siteUpdatesRow)).toEqual({
      slug: "site-updates",
      title: "Site updates",
      author: "josikinz",
      timestamp: "2019-01-30T23:07:19.231Z",
      body: "After a several month hiatus, the [SEI form system](https://example.org/) is back.",
    });
  });

  it("projects regardless of payload key order", () => {
    const post = projectPublicEffectIndexPost(welcomeRow);

    expect(post?.slug).toBe("welcome-to-the-effect-index");
    expect(post?.title).toBe("Welcome to the Effect Index");
    expect(post?.author).toBe("Viscid");
    expect(post?.timestamp).toBe("2018-07-07T18:02:30.681Z");
  });

  it("prefers the row key as the slug and falls back to the payload slug", () => {
    const keyedDifferently = { ...siteUpdatesRow, key: "renamed-slug" };
    expect(projectPublicEffectIndexPost(keyedDifferently)?.slug).toBe("renamed-slug");

    const keyless = { ...siteUpdatesRow, key: "   " };
    expect(projectPublicEffectIndexPost(keyless)?.slug).toBe("site-updates");
  });

  it("unwraps the extended-JSON date forms and rejects unusable ones", () => {
    expect(unwrapMongoDate({ $date: "2019-01-30T23:07:19.231Z" })).toBe("2019-01-30T23:07:19.231Z");
    expect(unwrapMongoDate({ $date: { $numberLong: "1548889639231" } })).toBe(
      "2019-01-30T23:07:19.231Z",
    );
    expect(unwrapMongoDate("2019-01-30T23:07:19.231Z")).toBe("2019-01-30T23:07:19.231Z");
    expect(unwrapMongoDate(1548889639231)).toBe("2019-01-30T23:07:19.231Z");
    expect(unwrapMongoDate(undefined)).toBeNull();
    expect(unwrapMongoDate({ $date: "not a date" })).toBeNull();
    expect(unwrapMongoDate({})).toBeNull();
  });

  it("rejects an out-of-range epoch instead of throwing RangeError", () => {
    // `Number.isFinite` is true for these, but they exceed the ±8.64e15 time-value limit,
    // so `new Date(ms).toISOString()` throws. The projection must never throw.
    const outOfRange: unknown[] = [
      { $date: { $numberLong: "99999999999999999" } },
      1e20,
      "99999999999999999",
      { $date: "-9999999999999999" },
    ];

    for (const value of outOfRange) {
      expect(() => unwrapMongoDate(value)).not.toThrow();
      expect(unwrapMongoDate(value)).toBeNull();
    }

    // The boundary itself still decodes.
    expect(unwrapMongoDate(8.64e15)).toBe("+275760-09-13T00:00:00.000Z");

    // …and one such row must not take the whole index down.
    const badDateRow = {
      kind: "post",
      key: "bad-date",
      payload: JSON.stringify({ title: "Bad date", body: "B", datetime: 1e20 }),
    };

    expect(() => projectPublicEffectIndexPost(badDateRow)).not.toThrow();
    expect(projectPublicEffectIndexPost(badDateRow)).toMatchObject({ timestamp: null });
    expect(() => projectPublicEffectIndexPosts([siteUpdatesRow, badDateRow])).not.toThrow();
    expect(projectPublicEffectIndexPosts([siteUpdatesRow, badDateRow]).map((p) => p.slug)).toEqual([
      "site-updates",
      "bad-date",
    ]);
  });

  it("keeps a post whose date cannot be decoded, with a null timestamp", () => {
    const undated = {
      ...siteUpdatesRow,
      payload: JSON.stringify({ slug: "site-updates", title: "Site updates", body: "Body." }),
    };

    expect(projectPublicEffectIndexPost(undated)).toMatchObject({
      slug: "site-updates",
      timestamp: null,
      author: "",
    });
  });

  it("returns null rather than throwing for malformed or unparseable records", () => {
    const malformed: unknown[] = [
      null,
      undefined,
      42,
      "not a record",
      [],
      { kind: "post", key: "broken", payload: "", importedAt: 1 },
      { kind: "post", key: "broken", payload: "   ", importedAt: 1 },
      { kind: "post", key: "broken", payload: "{ this is not json", importedAt: 1 },
      { kind: "post", key: "broken", payload: "[]", importedAt: 1 },
      { kind: "post", key: "broken", payload: "null", importedAt: 1 },
      { kind: "post", key: "broken", payload: 12345, importedAt: 1 },
      // Structurally valid JSON, but missing the fields a readable post needs.
      { kind: "post", key: "broken", payload: JSON.stringify({ title: "No body" }) },
      { kind: "post", key: "broken", payload: JSON.stringify({ body: "No title" }) },
      { kind: "post", key: "", payload: JSON.stringify({ title: "T", body: "B" }) },
    ];

    for (const record of malformed) {
      expect(() => projectPublicEffectIndexPost(record)).not.toThrow();
      expect(projectPublicEffectIndexPost(record)).toBeNull();
    }
  });

  it("survives one bad row in the list and orders the rest newest first", () => {
    const rows = [siteUpdatesRow, { kind: "post", key: "broken", payload: "{{{" }, welcomeRow];

    expect(() => projectPublicEffectIndexPosts(rows)).not.toThrow();
    expect(projectPublicEffectIndexPosts(rows).map((post) => post.slug)).toEqual([
      "site-updates",
      "welcome-to-the-effect-index",
    ]);
  });

  it("sorts undated posts last and tolerates a non-array input", () => {
    const undated = {
      kind: "post",
      key: "undated",
      payload: JSON.stringify({ title: "Undated", body: "Body." }),
    };

    expect(projectPublicEffectIndexPosts([undated, welcomeRow]).map((post) => post.slug)).toEqual([
      "welcome-to-the-effect-index",
      "undated",
    ]);
    expect(projectPublicEffectIndexPosts(undefined as unknown as unknown[])).toEqual([]);
  });
});
