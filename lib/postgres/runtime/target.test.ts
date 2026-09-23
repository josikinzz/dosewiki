import { describe, expect, it } from "vitest";
import { parsePostgresTarget } from "./target";

describe("parsePostgresTarget", () => {
  it("names the host and database of a valid target", () => {
    expect(parsePostgresTarget("postgres://db.example:6432/dosewiki")).toEqual({
      displayUrl: "postgres://db.example:6432/dosewiki",
      identity: "db.example/dosewiki",
    });
  });

  it.each(["%00", "%01", "%1F", "%7F"])("rejects a database name carrying control character %s", (encoded) => {
    expect(() => parsePostgresTarget(`postgres://db.example/dose${encoded}wiki`)).toThrow(/valid postgres:\/\/ URL/);
  });
});
