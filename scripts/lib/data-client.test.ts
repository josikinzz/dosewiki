import { afterEach, describe, expect, it, vi } from "vitest";
import { makeFunctionReference } from "../../lib/postgres/runtime/api";
import { PostgresClient } from "../../lib/postgres/runtime/client";
import { createDataClient, resolvePostgresSource, resolvePostgresTarget } from "./data-client";

vi.mock("server-only", () => ({}));

const env = { NODE_ENV: "test" as const, DATA_BACKEND: "postgres", POSTGRES_POOLED_URL: "postgres://localhost/dosewiki", REPLICATION_MEDIA_BASE_URL: " https://media.example.test/// " };

describe("Postgres-only operator client", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it.each([undefined, "", " \t\n", "http://media.example.test", "https:// spaced.test", "https://"])("rejects unusable media configuration %j in both factories", (baseUrl) => {
    vi.stubEnv("REPLICATION_MEDIA_BASE_URL", baseUrl);
    expect(() => createDataClient({ env: { ...env, REPLICATION_MEDIA_BASE_URL: baseUrl }, argv: [] })).toThrow(/REPLICATION_MEDIA_BASE_URL/);
    expect(() => PostgresClient.fromUrl(env.POSTGRES_POOLED_URL)).toThrow(/REPLICATION_MEDIA_BASE_URL/);
  });


  it.each([undefined, "", "retired-backend", "postgresql"])("refuses backend %s even with a legacy target", (backend) => {
    expect(() => createDataClient({ env: { ...env, DATA_BACKEND: backend }, target: "https://legacy.example.invalid", argv: [] })).toThrow(/DATA_BACKEND=postgres/);
  });

  it("never discards an explicit invalid target in favor of the environment", () => {
    expect(() => createDataClient({ env, target: "https://legacy.example.invalid", argv: [] })).toThrow(/Postgres/);
    expect(() => resolvePostgresTarget({ env, argv: ["--target"] })).toThrow(/--target/);
    expect(() => resolvePostgresTarget({ env: { ...env, TARGET_POSTGRES_URL: "" }, argv: [] })).toThrow(/Postgres/);
    expect(() => createDataClient({ env, argv: ["--target-url=postgres://localhost/other"] })).toThrow(/retired/);
  });

  it("requires both remote acknowledgement and the exact hostname", () => {
    const options = { target: "postgres://db.example/dosewiki", argv: [], env };
    expect(() => createDataClient(options)).toThrow(/allow-remote/);
    expect(() => createDataClient({ ...options, allowRemote: true })).toThrow(/POSTGRES_IMPORT_CONFIRM/);
    expect(() => createDataClient({ ...options, allowRemote: true, env: { ...env, POSTGRES_IMPORT_CONFIRM: "other.example" } })).toThrow(/POSTGRES_IMPORT_CONFIRM/);
    const selected = createDataClient({ ...options, allowRemote: true, env: { ...env, POSTGRES_IMPORT_CONFIRM: "db.example" } });
    expect(selected.fingerprint).toBe("db.example/dosewiki");
  });

  it("keeps independent source selection explicit and validates empty flags", () => {
    expect(resolvePostgresSource({ env, argv: ["--source-url", "postgres://source.example/db"] }).url).toBe("postgres://source.example/db");
    expect(resolvePostgresSource({ env, argv: ["--source-url=postgres://source.example/db"] }).url).toBe("postgres://source.example/db");
    expect(() => resolvePostgresSource({ env, argv: ["--source-url"] })).toThrow(/--source-url/);
  });

  it("enforces the live freeze before loading or contacting the runtime", () => {
    const mutableEnv = { ...env, DATA_WRITES_FROZEN: "1" };
    const { client } = createDataClient({ env: mutableEnv, argv: [] });
    const mutation = makeFunctionReference<"mutation">("siteFeedback:create");
    const action = makeFunctionReference<"action">("replications:sync");
    expect(() => client.mutation(mutation, {})).toThrow(expect.objectContaining({ code: "DATA_WRITES_FROZEN" }));
    expect(() => client.action(action, {})).toThrow(expect.objectContaining({ code: "DATA_WRITES_FROZEN" }));
  });
});
