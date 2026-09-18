const ZOD_GLOBAL_CONFIG_KEY = "__zod_globalConfig";

/**
 * Disable Zod's optional browser-side schema JIT before any application
 * chunks execute. The JIT begins with a `Function("")` capability probe;
 * strict CSP reports that caught probe as a violation even though Zod falls
 * back to its interpreter. Pre-populating the documented global config keeps
 * validation on the interpreter path without weakening script-src.
 */
export function buildZodJitlessBootstrapScript(): string {
  return `globalThis.${ZOD_GLOBAL_CONFIG_KEY}=Object.assign(globalThis.${ZOD_GLOBAL_CONFIG_KEY}??{},{jitless:true});`;
}
