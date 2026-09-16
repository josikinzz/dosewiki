export type DataBackend = "postgres";
export type RuntimeEnv = Record<string, string | undefined>;
export type PostgresTarget = {
  url: string;
  sourceEnvVar: "POSTGRES_POOLED_URL" | "POSTGRES_DIRECT_URL";
  /** Safe for diagnostics: no userinfo or connection parameters. */
  displayUrl: string;
  identity: string;
};

export function requirePostgresBackend(env: RuntimeEnv = process.env): DataBackend {
  if (env.DATA_BACKEND !== "postgres") {
    throw new Error("Normal data access requires DATA_BACKEND=postgres; no fallback backend is permitted.");
  }
  return "postgres";
}

export function parsePostgresTarget(value: string): { displayUrl: string; identity: string } {
  try {
    const url = new URL(value);
    const database = decodeURIComponent(url.pathname.slice(1));
    if (!["postgres:", "postgresql:"].includes(url.protocol) || !url.hostname || !database || database.includes("/") || /[\u0000-\u001f\u007f]/.test(database) || url.hash || url.port === "0") {
      throw new Error();
    }
    // libpq options must not silently redirect the URL to another destination.
    for (const parameter of ["host", "hostaddr", "port", "dbname", "database", "service"]) {
      if (url.searchParams.has(parameter)) throw new Error();
    }
    return {
      displayUrl: `postgres://${url.host}/${encodeURIComponent(database)}`,
      identity: `${url.hostname.toLowerCase().replace(/^\[|\]$/g, "")}/${database}`,
    };
  } catch {
    throw new Error("Postgres target must be a valid postgres:// URL naming one host and database, without destination overrides.");
  }
}

export function resolveRuntimePostgresTarget(env: RuntimeEnv = process.env): PostgresTarget {
  requirePostgresBackend(env);
  const sourceEnvVar = env.POSTGRES_POOLED_URL !== undefined ? "POSTGRES_POOLED_URL" : "POSTGRES_DIRECT_URL";
  const url = env[sourceEnvVar]?.trim();
  if (!url) throw new Error("Postgres requires POSTGRES_POOLED_URL or POSTGRES_DIRECT_URL.");
  const target = parsePostgresTarget(url);
  // Pooled and direct ports may differ, but must address the same database.
  for (const key of ["POSTGRES_POOLED_URL", "POSTGRES_DIRECT_URL", "TARGET_POSTGRES_URL"] as const) {
    if (env[key] !== undefined && parsePostgresTarget(env[key]!.trim()).identity !== target.identity) {
      throw new Error(`Postgres target mismatch: ${sourceEnvVar} and ${key} must identify the same host and database.`);
    }
  }
  return { url, sourceEnvVar, ...target };
}
