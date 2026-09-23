import { describe, expect, it } from "vitest";
import { DataWriteFrozenError } from "../runtime/dataWriteFreeze";
import { classifyPostgresError } from "./postgresErrors";

const sqlState = (code: string) => Object.assign(new Error(`SQLSTATE ${code}`), { code });

describe("Postgres error classification", () => {
  it.each(["40001", "40P01", "55P03", "53300"])("treats SQLSTATE %s as transient", (code) => {
    expect(classifyPostgresError(sqlState(code))).toBe("transient");
  });

  it("treats both pool acquisition timeouts as transient", () => {
    expect(classifyPostgresError(new Error("timeout exceeded when trying to connect"))).toBe("transient");
    expect(classifyPostgresError(new Error("Connection terminated due to connection timeout"))).toBe("transient");
  });

  it("treats the application freeze refusal as frozen", () => {
    expect(classifyPostgresError(new DataWriteFrozenError("articles:save"))).toBe("frozen");
  });

  it("treats a raw SQL write refused inside a read-only transaction as frozen", () => {
    expect(classifyPostgresError(sqlState("25006"))).toBe("frozen");
  });

  it("finds a classified error behind a wrapping cause", () => {
    expect(classifyPostgresError(Object.assign(new Error("save failed"), { cause: sqlState("55P03") }))).toBe("transient");
  });

  it("treats everything else as permanent", () => {
    expect(classifyPostgresError(sqlState("23505"))).toBe("permanent");
    expect(classifyPostgresError(new Error("layout write failed"))).toBe("permanent");
    expect(classifyPostgresError("not an error")).toBe("permanent");
    expect(classifyPostgresError(null)).toBe("permanent");
  });
});
