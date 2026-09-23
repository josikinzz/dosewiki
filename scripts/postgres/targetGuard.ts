/**
 * Point-of-risk gate for scripts that write to Postgres. The target must be
 * named explicitly with `--target` or TARGET_POSTGRES_URL; the app connection
 * variables (POSTGRES_DIRECT_URL, POSTGRES_POOLED_URL) never select a writer,
 * because Bun loads them from `.env.local` automatically. Any non-loopback
 * target also requires `--allow-remote` AND `POSTGRES_IMPORT_CONFIRM=<hostname>`,
 * so a stray env var cannot point a rehearsal at PlanetScale.
 *
 * This module owns explicit target resolution and the loopback list; the data
 * client and the production write command build on it rather than repeating it.
 */

import { parsePostgresTarget } from "../../lib/postgres/runtime/target.ts";

export const MISSING_TARGET_MESSAGE =
  "Postgres target is required: pass --target <url> or set TARGET_POSTGRES_URL. POSTGRES_DIRECT_URL and POSTGRES_POOLED_URL never select a write target.";

export type ExplicitTarget = { url: string; source: "--target" | "TARGET_POSTGRES_URL" };

function flagValue(argv: string[]): string | null | undefined {
  for (let index = 0; index < argv.length; index += 1) {
    const entry = argv[index];
    if (entry === "--target") return argv[index + 1] ?? null;
    if (entry.startsWith("--target=")) return entry.slice("--target=".length);
  }
  return undefined;
}

/**
 * `--target <url>` > TARGET_POSTGRES_URL, or null when neither is present. A
 * present but blank value is refused rather than treated as unset, so a
 * mistyped ceremony never falls through to another target.
 */
export function resolveExplicitTarget(argv: string[], env: Record<string, string | undefined> = process.env): ExplicitTarget | null {
  const cli = flagValue(argv);
  if (cli !== undefined) {
    if (!cli?.trim() || cli.startsWith("--")) throw new Error("--target requires an explicit Postgres URL.");
    parsePostgresTarget(cli.trim());
    return { url: cli.trim(), source: "--target" };
  }
  if (env.TARGET_POSTGRES_URL === undefined) return null;
  const explicit = env.TARGET_POSTGRES_URL.trim();
  if (!explicit) throw new Error("TARGET_POSTGRES_URL is set but empty; name a Postgres URL or unset it.");
  parsePostgresTarget(explicit);
  return { url: explicit, source: "TARGET_POSTGRES_URL" };
}

export function resolveTarget(argv: string[], env: Record<string, string | undefined> = process.env): string {
  const resolved = resolveExplicitTarget(argv, env);
  if (!resolved) throw new Error(MISSING_TARGET_MESSAGE);
  return resolved.url;
}

export function normalizeHostname(hostname: string): string {
  const normalized = hostname.trim().toLowerCase();
  return normalized.startsWith("[") && normalized.endsWith("]") ? normalized.slice(1, -1) : normalized;
}

export function isLoopbackHostname(hostname: string): boolean {
  return ["localhost", "127.0.0.1", "::1"].includes(normalizeHostname(hostname));
}

export function guardTarget(target: string, allowRemote: boolean, env: Record<string, string | undefined> = process.env): void {
  const hostname = new URL(target).hostname;
  if (isLoopbackHostname(hostname)) return;
  if (!allowRemote) throw new Error(`Refusing non-local target ${hostname}; pass --allow-remote and POSTGRES_IMPORT_CONFIRM=${hostname}`);
  if (env.POSTGRES_IMPORT_CONFIRM !== hostname) {
    throw new Error(`POSTGRES_IMPORT_CONFIRM must equal ${hostname} to write to a remote target`);
  }
}
