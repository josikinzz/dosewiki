/**
 * Point-of-risk gate for scripts that write to Postgres. Any non-localhost
 * target requires `--allow-remote` AND `POSTGRES_IMPORT_CONFIRM=<hostname>`,
 * so a stray env var cannot point a rehearsal at PlanetScale.
 */

export function resolveTarget(argv: string[]): string {
  const index = argv.indexOf("--target");
  return (index >= 0 ? argv[index + 1] : undefined) ?? process.env.POSTGRES_DIRECT_URL ?? "postgres://localhost:5432/dosewiki";
}

export function guardTarget(target: string, allowRemote: boolean, env: NodeJS.ProcessEnv = process.env): void {
  const hostname = new URL(target).hostname;
  const local = hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
  if (local) return;
  if (!allowRemote) throw new Error(`Refusing non-local target ${hostname}; pass --allow-remote and POSTGRES_IMPORT_CONFIRM=${hostname}`);
  if (env.POSTGRES_IMPORT_CONFIRM !== hostname) {
    throw new Error(`POSTGRES_IMPORT_CONFIRM must equal ${hostname} to write to a remote target`);
  }
}
