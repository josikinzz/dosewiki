export const RETIRED_REPLACE_MODE_MESSAGE =
  "--replace is retired because whole-corpus replacement exceeds Postgres execution limits. Use bounded per-article/CAS workflows instead.";

export function assertSubstanceIndexReplaceModeRetired(argv = process.argv.slice(2)) {
  if (argv.includes("--replace")) {
    throw new Error(RETIRED_REPLACE_MODE_MESSAGE);
  }
}
