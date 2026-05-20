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

  for (const arg of args) {
    if (arg === "--help" || arg === "-h") {
      options.help = true;
      continue;
    }

    if (booleanFlags.includes(arg.slice(2))) {
      options[arg.slice(2).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())] = true;
      continue;
    }

    if (!arg.startsWith("--") || !arg.includes("=")) {
      continue;
    }

    const [rawFlag, rawValue = ""] = arg.slice(2).split("=");
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
