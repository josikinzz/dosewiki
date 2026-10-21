type GuardOptionStringKeys<Options> = {
  required?: readonly (keyof Options & string)[];
  optional?: readonly (keyof Options & string)[];
};

function requireString(name: string, value: unknown): void {
  if (typeof value !== "string") {
    throw new TypeError(`Route guard option "${name}" must be a string.`);
  }
}

export function plainGuardOptions<Options extends object>(
  options: Options,
  strings: GuardOptionStringKeys<Options> = {},
): Options {
  const snapshot: Record<string, unknown> = Object.create(null);
  for (const [key, descriptor] of Object.entries(Object.getOwnPropertyDescriptors(options))) {
    if (!Object.prototype.hasOwnProperty.call(descriptor, "value")) {
      throw new TypeError(`Route guard option "${key}" must be a plain data property.`);
    }
    snapshot[key] = descriptor.value;
  }
  for (const key of strings.required ?? []) requireString(key, snapshot[key]);
  for (const key of strings.optional ?? []) {
    if (snapshot[key] !== undefined) requireString(key, snapshot[key]);
  }
  return snapshot as Options;
}
