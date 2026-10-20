import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { deleteDocument, insertDocument, patchDocument, type SqlClient } from "./documentStore";

function recordingClient() {
  const statements: string[] = [];
  const client: SqlClient = {
    query: (async (text: string) => {
      statements.push(text);
      return { rows: [], rowCount: 1 };
    }) as unknown as SqlClient["query"],
  };
  return { client, statements };
}

const subscriber = {
  email: "reader@example.com",
  list: "updates",
  status: "active",
  created_at: 1,
  honeypot_triggered: false,
};

const writes = [
  ["insertDocument", (client: SqlClient) => insertDocument(client, "mailingListSubscribers", subscriber)],
  ["patchDocument", (client: SqlClient) => patchDocument(client, "mailingListSubscribers", "doc-1", { status: "unsubscribed" })],
  ["deleteDocument", (client: SqlClient) => deleteDocument(client, "mailingListSubscribers", "doc-1")],
] as const;

describe("document mutation helpers under the write freeze", () => {
  beforeEach(() => vi.stubEnv("DATA_WRITES_FROZEN", "1"));
  afterEach(() => vi.unstubAllEnvs());

  it.each(writes)("%s refuses before any statement reaches the client", async (_name, write) => {
    const { client, statements } = recordingClient();
    await expect(write(client)).rejects.toMatchObject({ code: "DATA_WRITES_FROZEN" });
    expect(statements).toEqual([]);
  });

  it.each(writes)("%s issues its statements once writes are allowed", async (_name, write) => {
    vi.stubEnv("DATA_WRITES_FROZEN", "0");
    const { client, statements } = recordingClient();
    await write(client);
    expect(statements.length).toBeGreaterThan(0);
  });
});
