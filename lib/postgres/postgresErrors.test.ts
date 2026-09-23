import { describe, expect, it } from "vitest";
import { DataWriteFrozenError } from "../runtime/dataWriteFreeze";
import { classifyPostgresError, isConnectionLoss, isReplayableOnFreshConnection } from "./postgresErrors";

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
    expect(isConnectionLoss(new Error("Query read timeout"))).toBe(true);
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

describe("Replaying idempotent work on a fresh connection", () => {
  it.each([
    ["a socket closed under an active query", new Error("Connection terminated unexpectedly")],
    ["a silent socket", new Error("Query read timeout")],
    ["a pool acquisition timeout", new Error("timeout exceeded when trying to connect")],
    ["a handshake timeout", new Error("Connection terminated due to connection timeout")],
    ["a refused connection", Object.assign(new Error("connect ECONNREFUSED 127.0.0.1:5432"), { code: "ECONNREFUSED" })],
    ["a broken pipe", Object.assign(new Error("write EPIPE"), { code: "EPIPE" })],
    ["a crash shutdown", sqlState("57P02")],
    ["a server that cannot connect now", sqlState("57P03")],
    ["a serialization failure", sqlState("40001")],
    ["too many connections", sqlState("53300")],
  ])("replays %s", (_label, error) => {
    expect(isReplayableOnFreshConnection(error)).toBe(true);
  });

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
