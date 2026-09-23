/**
 * Point-of-risk gate for scripts that write to Postgres. The target must be
 * named explicitly with `--target` or TARGET_POSTGRES_URL; the app connection
 * variables (POSTGRES_DIRECT_URL, POSTGRES_POOLED_URL) never select a writer,
 * because Bun loads them from `.env.local` automatically. Any non-loopback
 * target also requires `--allow-remote` AND `POSTGRES_IMPORT_CONFIRM=<hostname>`,
 * so a stray env var cannot point a rehearsal at PlanetScale.
 */

const LOOPBACK_HOSTNAMES = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

export const MISSING_TARGET_MESSAGE =
  "Postgres target is required: pass --target <url> or set TARGET_POSTGRES_URL. POSTGRES_DIRECT_URL and POSTGRES_POOLED_URL never select a write target.";

function flagValue(argv: string[]): string | null | undefined {
  for (let index = 0; index < argv.length; index += 1) {
    const entry = argv[index];
    if (entry === "--target") return argv[index + 1] ?? null;
    if (entry.startsWith("--target=")) return entry.slice("--target=".length);
  }
  return undefined;
}

export function resolveTarget(argv: string[], env: Record<string, string | undefined> = process.env): string {
  const cli = flagValue(argv);
  if (cli !== undefined) {
    if (!cli?.trim() || cli.startsWith("--")) throw new Error("--target requires an explicit Postgres URL.");
    return cli.trim();
  }
  const explicit = env.TARGET_POSTGRES_URL?.trim();
  if (explicit) return explicit;
  throw new Error(MISSING_TARGET_MESSAGE);
}

export function guardTarget(target: string, allowRemote: boolean, env: Record<string, string | undefined> = process.env): void {
  const hostname = new URL(target).hostname;
  if (LOOPBACK_HOSTNAMES.has(hostname)) return;
  if (!allowRemote) throw new Error(`Refusing non-local target ${hostname}; pass --allow-remote and POSTGRES_IMPORT_CONFIRM=${hostname}`);
  if (env.POSTGRES_IMPORT_CONFIRM !== hostname) {
    throw new Error(`POSTGRES_IMPORT_CONFIRM must equal ${hostname} to write to a remote target`);
  }
}
