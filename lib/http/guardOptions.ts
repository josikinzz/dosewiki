type GuardOptionCheck = (value: unknown) => boolean;

export function isGuardString(value: unknown): value is string {
  return typeof value === "string";
}

export function optionalGuardOption(check: GuardOptionCheck): GuardOptionCheck {
  return (value) => value === undefined || check(value);
}

export function plainGuardOptions<Options extends object>(
  options: Options,
  checks: { [Key in keyof Options & string]?: GuardOptionCheck } = {},
): Options {
  const snapshot: Record<string, unknown> = Object.create(null);
  for (const [key, descriptor] of Object.entries(Object.getOwnPropertyDescriptors(options))) {
    if (!Object.prototype.hasOwnProperty.call(descriptor, "value")) {
      throw new TypeError(`Route guard option "${key}" must be a plain data property.`);
    }
    snapshot[key] = descriptor.value;
  }
  for (const [key, check] of Object.entries(checks) as [string, GuardOptionCheck][]) {
    if (!check(snapshot[key])) {
      throw new TypeError(`Route guard option "${key}" is invalid.`);
    }
  }
  return snapshot as Options;
}
