function splitBaseUrls(value) {
  return String(value ?? "")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
}

export function parseWarmArgs(argv, env = {}) {
  const options = {
    baseUrls: splitBaseUrls(env.WARM_BASE_URL || env.PUBLIC_SITE_URL || ""),
    all: false,
    concurrency: 4,
    timeoutMs: 20000,
    maxFailurePercent: 10,
    slowest: 10,
    help: false,
  };
  const args = Array.from(argv);
  let explicitBaseUrls = false;
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (!arg.startsWith("--")) continue;
    const eq = arg.indexOf("=");
    const name = eq === -1 ? arg.slice(2) : arg.slice(2, eq);
    const takeValue = () => {
      if (eq !== -1) return arg.slice(eq + 1);
      index += 1;
      return args[index];
    };
    switch (name) {
      case "base-url":
        if (!explicitBaseUrls) {
          options.baseUrls = [];
          explicitBaseUrls = true;
        }
        options.baseUrls.push(...splitBaseUrls(takeValue()));
        break;
      case "all":
        options.all = true;
        break;
      case "concurrency":
        options.concurrency = Number(takeValue());
        break;
      case "timeout":
        options.timeoutMs = Number(takeValue());
        break;
      case "max-failure-percent":
        options.maxFailurePercent = Number(takeValue());
        break;
      case "slowest":
        options.slowest = Number(takeValue());
        break;
      case "help":
        options.help = true;
        break;
      default:
        throw new Error(`Unknown flag --${name}`);
    }
  }
  for (const key of [
    "concurrency",
    "timeoutMs",
    "maxFailurePercent",
    "slowest",
  ]) {
    if (!Number.isFinite(options[key]) || options[key] < 0) {
      throw new Error(`--${key} must be a non-negative number`);
    }
  }
  if (options.concurrency < 1) options.concurrency = 1;
  const origins = [];
  for (const baseUrl of options.baseUrls) {
    let origin;
    try {
      origin = new URL(baseUrl).origin;
    } catch {
      throw new Error(`--base-url must be an absolute URL, got ${JSON.stringify(baseUrl)}`);
    }
    if (origin === "null") throw new Error(`--base-url must be an absolute URL, got ${JSON.stringify(baseUrl)}`);
    if (!origins.includes(origin)) origins.push(origin);
  }
  options.baseUrls = origins;
  return options;
}
