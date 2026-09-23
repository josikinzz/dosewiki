import { describe, expect, it } from "vitest";
import { DataWriteFrozenError } from "../runtime/dataWriteFreeze";
import { classifyPostgresError, isConnectionLoss } from "./postgresErrors";

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

describe("Postgres connection loss", () => {
  it("recognizes a socket closed under an active query", () => {
    expect(isConnectionLoss(new Error("Connection terminated unexpectedly"))).toBe(true);
    expect(isConnectionLoss(new Error("Client has encountered a connection error and is not queryable"))).toBe(true);
    expect(isConnectionLoss(Object.assign(new Error("read ECONNRESET"), { code: "ECONNRESET" }))).toBe(true);
  });

  it.each(["57P01", "08006"])("recognizes SQLSTATE %s", (code) => {
    expect(isConnectionLoss(sqlState(code))).toBe(true);
  });

  it("finds connection loss behind a wrapping cause", () => {
    expect(isConnectionLoss(Object.assign(new Error("render failed"), { cause: new Error("Connection terminated unexpectedly") }))).toBe(true);
  });

  it("does not treat query errors or timeouts as connection loss", () => {
    expect(isConnectionLoss(sqlState("57014"))).toBe(false);
    expect(isConnectionLoss(sqlState("40001"))).toBe(false);
    expect(isConnectionLoss(new Error("layout write failed"))).toBe(false);
    expect(isConnectionLoss(null)).toBe(false);
  });

  it("leaves connection loss permanent for writers", () => {
    expect(classifyPostgresError(new Error("Connection terminated unexpectedly"))).toBe("permanent");
  });
});
