import type { PoolClient } from "pg";
import { describe, expect, it } from "vitest";
import { beginWithTimeouts, setTransactionTimeouts } from "./transactionTimeouts";

function recordingClient() {
  const statements: string[] = [];
  const client = {
    query: async (text: string) => {
      statements.push(text);
      return { rows: [], rowCount: 0 };
    },
  };
  return { client: client as unknown as Pick<PoolClient, "query">, statements };
}

describe("beginWithTimeouts", () => {
  it("sends BEGIN and every SET LOCAL as separate protocol messages", async () => {
    const { client, statements } = recordingClient();
    await beginWithTimeouts(client, "BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    expect(statements).toEqual([
      "BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY",
      "SET LOCAL statement_timeout = '30s'",
      "SET LOCAL lock_timeout = '5s'",
      "SET LOCAL idle_in_transaction_session_timeout = '30s'",
    ]);
    for (const statement of statements) {
      expect(statement).not.toContain(";");
    }
  });

  it("applies all three timeouts without a BEGIN wrapper", async () => {
    const { client, statements } = recordingClient();
    await setTransactionTimeouts(client);
    expect(statements).toHaveLength(3);
    expect(statements.every((s) => s.startsWith("SET LOCAL"))).toBe(true);
  });
});
