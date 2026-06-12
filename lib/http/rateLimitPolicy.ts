export type RateLimitPolicyName =
  | "editorHeavyWrite"
  | "editorSmallWrite"
  | "authenticatedProfileWrite"
  | "publicTripReportSubmit"
  | "publicProxyRead"
  | "diagnosticRead"
  | "publicSearchRead";

export type RateLimitKeyStrategy = "ip";
export type RateLimitFallbackMode = "inMemory";
export type RateLimitResponseShape = "jsonError";

export type RateLimitPolicy = {
  name: RateLimitPolicyName;
  windowMs: number;
  max: number;
  keyStrategy: RateLimitKeyStrategy;
  fallbackMode: RateLimitFallbackMode;
  responseShape: RateLimitResponseShape;
};

const ONE_MINUTE_MS = 60_000;

export const rateLimitPolicies = {
  editorHeavyWrite: {
    name: "editorHeavyWrite",
    windowMs: ONE_MINUTE_MS,
    max: 5,
    keyStrategy: "ip",
    fallbackMode: "inMemory",
    responseShape: "jsonError",
  },
  editorSmallWrite: {
    name: "editorSmallWrite",
    windowMs: ONE_MINUTE_MS,
    max: 20,
    keyStrategy: "ip",
    fallbackMode: "inMemory",
    responseShape: "jsonError",
  },
  authenticatedProfileWrite: {
    name: "authenticatedProfileWrite",
    windowMs: ONE_MINUTE_MS,
    max: 5,
    keyStrategy: "ip",
    fallbackMode: "inMemory",
    responseShape: "jsonError",
  },
  publicTripReportSubmit: {
    name: "publicTripReportSubmit",
    windowMs: ONE_MINUTE_MS,
    max: 4,
    keyStrategy: "ip",
    fallbackMode: "inMemory",
    responseShape: "jsonError",
  },
  publicProxyRead: {
    name: "publicProxyRead",
    windowMs: ONE_MINUTE_MS,
    max: 30,
    keyStrategy: "ip",
    fallbackMode: "inMemory",
    responseShape: "jsonError",
  },
  diagnosticRead: {
    name: "diagnosticRead",
    windowMs: ONE_MINUTE_MS,
    max: 30,
    keyStrategy: "ip",
    fallbackMode: "inMemory",
    responseShape: "jsonError",
  },
  publicSearchRead: {
    name: "publicSearchRead",
    windowMs: ONE_MINUTE_MS,
    max: 30,
    keyStrategy: "ip",
    fallbackMode: "inMemory",
    responseShape: "jsonError",
  },
} satisfies Record<RateLimitPolicyName, RateLimitPolicy>;

export function getRateLimitPolicy(name: RateLimitPolicyName): RateLimitPolicy {
  return rateLimitPolicies[name];
}
