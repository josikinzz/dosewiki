import { describe, expect, it } from "vitest";
import { DataWriteFrozenError } from "../runtime/dataWriteFreeze";
import { classifyPostgresError, isReplayableOnFreshConnection } from "./postgresErrors";

const sqlState = (code: string) => Object.assign(new Error(`SQLSTATE ${code}`), { code });

describe("Postgres error classification", () => {
  it("treats the application freeze refusal as frozen", () => {
    expect(classifyPostgresError(new DataWriteFrozenError("articles:save"))).toBe("frozen");
  });

  it("treats a raw SQL write refused inside a read-only transaction as frozen", () => {
    expect(classifyPostgresError(sqlState("25006"))).toBe("frozen");
  });
});

describe("Postgres connection loss", () => {
  it("leaves connection loss permanent for writers", () => {
    expect(classifyPostgresError(new Error("Connection terminated unexpectedly"))).toBe("permanent");
  });
});

describe("Replaying idempotent work on a fresh connection", () => {
  it.each([
    ["a write refused by the freeze", new DataWriteFrozenError("articles:save")],
    ["a write refused inside a read-only transaction", sqlState("25006")],
    ["a server statement timeout", sqlState("57014")],
    ["a unique violation", sqlState("23505")],
    ["an unrelated error", new Error("layout write failed")],
  ])("does not replay %s", (_label, error) => {
    expect(isReplayableOnFreshConnection(error)).toBe(false);
  });
});
