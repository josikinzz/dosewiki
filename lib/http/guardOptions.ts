export function plainGuardOptions<Options extends object>(options: Options): Options {
  const snapshot: Record<string, unknown> = Object.create(null);
  for (const [key, descriptor] of Object.entries(Object.getOwnPropertyDescriptors(options))) {
    if (!Object.prototype.hasOwnProperty.call(descriptor, "value")) {
      throw new TypeError(`Route guard option "${key}" must be a plain data property.`);
    }
    snapshot[key] = descriptor.value;
  }
  return snapshot as Options;
}

export function requireStringGuardOption(name: string, value: unknown, { optional = false } = {}): void {
  if (optional && value === undefined) return;
  if (typeof value !== "string") {
    throw new TypeError(`Route guard option "${name}" must be a string.`);
  }
}
