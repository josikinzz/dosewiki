import { assertDataWritesNotFrozen } from "../../lib/runtime/dataWriteFreeze.ts";

const CONFIRMATIONS = Object.freeze([
  ["--confirm-write", "operation"],
  ["--confirm-plan", "plan"],
  ["--confirm-target", "target"],
  ["--confirm-bucket", "bucket"],
]);

function flagValues(argv, name) {
  return argv.flatMap((arg, index) => {
    if (arg === name) return index + 1 < argv.length ? [argv[index + 1]] : [];
    return arg.startsWith(`${name}=`) ? [arg.slice(name.length + 1)] : [];
  });
}

export function authorizeStorageWrite(argv, expected, { env = process.env } = {}) {
  assertDataWritesNotFrozen(expected.operation, env);
  if (!argv.includes("--write")) throw new Error(`${expected.operation} requires --write.`);
  for (const [flag, field] of CONFIRMATIONS) {
    const value = expected[field];
    if (typeof value !== "string" || !value.trim()) {
      throw new Error(`${expected.operation} has no ${field} identity to confirm.`);
    }
    const given = flagValues(argv, flag);
    if (given.length === 0 || given.some((entry) => entry !== value)) {
      throw new Error(`Refusing ${expected.operation}: ${flag} must exactly equal ${value}.`);
    }
  }
}
