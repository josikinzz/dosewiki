import { describe, expect, it } from "vitest";
import { getDataRuntimeTargetMatrix, getEditorTargetAlignment, getPrivilegedWriteTarget } from "./runtimeTargets";
import { requirePostgresBackend, resolveRuntimePostgresTarget } from "../postgres/runtime/target";

const valid = { DATA_BACKEND: "postgres", POSTGRES_POOLED_URL: "postgres://user:secret@db.example:6432/dosewiki" };

describe("Postgres runtime destinations", () => {
  it("does not depend on any legacy URL and keeps diagnostics credential-free", () => {
    const matrix = getDataRuntimeTargetMatrix({ ...valid, DATA_ADMIN_KEY: "admin-secret" });
    expect(matrix.editorTargetAlignment.status).toBe("aligned");
    expect(matrix.publicServerRead.selectedUrl).toBe("postgres://db.example:6432/dosewiki");
    expect(matrix.privilegedWrite.selectedUrl).toBe(matrix.publicServerRead.selectedUrl);
    expect(matrix.authMembership.selectedUrl).toBe(matrix.publicServerRead.selectedUrl);
    expect(JSON.stringify(matrix)).not.toContain("secret");
  });

  it.each([undefined, "", "convex", "postgre"])("refuses backend %s rather than falling back", (backend) => {
    expect(() => requirePostgresBackend({ ...valid, DATA_BACKEND: backend })).toThrow(/DATA_BACKEND=postgres/);
    expect(getPrivilegedWriteTarget({ ...valid, DATA_BACKEND: backend }).compatibility.allowed).toBe(false);
  });

  it("accepts a pooled/direct port pair but rejects different databases", () => {
    expect(resolveRuntimePostgresTarget({ ...valid, POSTGRES_DIRECT_URL: "postgres://db.example:5432/dosewiki" }).url).toBe(valid.POSTGRES_POOLED_URL);
    const mismatch = { ...valid, POSTGRES_DIRECT_URL: "postgres://db.example:5432/other", CONVEX_ALLOW_TARGET_SPLIT: "1" };
    expect(() => resolveRuntimePostgresTarget(mismatch)).toThrow(/mismatch/);
    expect(getEditorTargetAlignment(mismatch)).toMatchObject({ status: "split" });
  });

  it.each([
    "",
    "https://legacy.convex.cloud",
    "postgres://db.example",
    "postgres://db.example/db/other",
    "postgres://db.example/db?host=other.example",
    "postgres://db.example/db?password=secret#fragment",
  ])("does not fall back after an invalid preferred target", (url) => {
    expect(() => resolveRuntimePostgresTarget({ ...valid, POSTGRES_POOLED_URL: url, POSTGRES_DIRECT_URL: "postgres://db.example/dosewiki" })).toThrow();
  });

  it("rejects a mismatched explicit runtime target without disclosing it", () => {
    const matrix = getDataRuntimeTargetMatrix({ ...valid, TARGET_POSTGRES_URL: "postgres://secret-user:secret-password@other.example/dosewiki" });
    expect(matrix.privilegedWrite.compatibility.allowed).toBe(false);
    expect(JSON.stringify(matrix)).not.toContain("secret-user");
    expect(JSON.stringify(matrix)).not.toContain("secret-password");
  });
});
