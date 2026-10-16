const ZOD_GLOBAL_CONFIG_KEY = "__zod_globalConfig";

export function buildZodJitlessBootstrapScript(): string {
  return `globalThis.${ZOD_GLOBAL_CONFIG_KEY}=Object.assign(globalThis.${ZOD_GLOBAL_CONFIG_KEY}??{},{jitless:true});`;
}
