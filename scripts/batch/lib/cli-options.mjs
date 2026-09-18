function clampNumber(value, bounds) {
  if (!bounds) {
    return value;
  }

  return Math.min(Math.max(value, bounds.min), bounds.max);
}

export function parseBatchCliArgs(args, config) {
  const {
    defaults,
    booleanFlags = [],
    stringFlags = [],
    csvFlags = [],
    numberFlags = [],
    aliases = {},
  } = config;

  const options = { ...defaults };
  const knownFlags = new Set([
    "help",
    "write",
    "confirm-write",
    "expected-deployment",
    "allow-remote",
    ...booleanFlags,
    ...stringFlags,
    ...csvFlags,
    ...numberFlags.map((entry) => entry.name),
    ...Object.keys(aliases),
  ]);

  for (const arg of args) {
    if (arg === "--help" || arg === "-h") {
      options.help = true;
      continue;
    }

    if (arg.startsWith("--")) {
      const rawFlag = arg.slice(2).split("=")[0];
      const flag = aliases[rawFlag] ?? rawFlag;
      if (!knownFlags.has(rawFlag) && !knownFlags.has(flag)) {
        throw new Error(`Unknown batch option: --${rawFlag}`);
      }
    }

    if (booleanFlags.includes(arg.slice(2))) {
      options[arg.slice(2).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())] = true;
      continue;
    }

    if (!arg.startsWith("--") || !arg.includes("=")) {
      continue;
    }

    const separator = arg.indexOf("=");
    const rawFlag = arg.slice(2, separator);
    const rawValue = arg.slice(separator + 1);
    const flag = aliases[rawFlag] ?? rawFlag;

    if (stringFlags.includes(flag)) {
      options[flag] = rawValue;
      continue;
    }

    if (csvFlags.includes(flag)) {
      options[flag] = rawValue
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean);
      continue;
    }

    const numberConfig = numberFlags.find((entry) => entry.name === flag);
    if (!numberConfig) {
      continue;
    }

    const parsedValue = Number.parseInt(rawValue, 10);
    if (Number.isNaN(parsedValue)) {
      options[flag] = numberConfig.fallbackOnNaN;
      continue;
    }

    options[flag] = clampNumber(parsedValue, numberConfig.bounds);
  }

  return options;
}
