export type RateLimitPolicyName =
  | "editorHeavyWrite"
  | "editorSmallWrite"
  | "authenticatedProfileWrite"
  | "publicTripReportSubmit"
  | "publicArticleFeedbackSubmit"
  | "publicSiteFeedbackSubmit"
  | "publicProxyRead"
  | "diagnosticRead"
  | "editorPolledRead"
  | "publicSearchRead"
  | "publicContentApiRead"
  | "authCredentialAttempt";

type RateLimitKeyStrategy = "ip";
type RateLimitFallbackMode = "inMemory";
type RateLimitResponseShape = "jsonError";

export type RateLimitPolicy = {
  name: RateLimitPolicyName;
  windowMs: number;
  max: number;
  keyStrategy: RateLimitKeyStrategy;
  fallbackMode: RateLimitFallbackMode;
  responseShape: RateLimitResponseShape;
};

const ONE_MINUTE_MS = 60_000;

const rateLimitPolicies = {
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
  publicArticleFeedbackSubmit: {
    name: "publicArticleFeedbackSubmit",
    windowMs: ONE_MINUTE_MS,
    max: 3,
    keyStrategy: "ip",
    fallbackMode: "inMemory",
    responseShape: "jsonError",
  },
  publicSiteFeedbackSubmit: {
    name: "publicSiteFeedbackSubmit",
    windowMs: ONE_MINUTE_MS,
    max: 3,
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
  /**
   * Editor-surface reads that TanStack Query polls (15 s per list, 5 s per
   * open document) plus refetch-on-focus: one editor with several tools open
   * legitimately issues around sixty requests a minute, and editors behind a
   * shared address multiply that.
   */
  editorPolledRead: {
    name: "editorPolledRead",
    windowMs: ONE_MINUTE_MS,
    max: 300,
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
  publicContentApiRead: {
    name: "publicContentApiRead",
    windowMs: ONE_MINUTE_MS,
    max: 120,
    keyStrategy: "ip",
    fallbackMode: "inMemory",
    responseShape: "jsonError",
  },
  authCredentialAttempt: {
    name: "authCredentialAttempt",
    windowMs: 10 * ONE_MINUTE_MS,
    max: 10,
    keyStrategy: "ip",
    fallbackMode: "inMemory",
    responseShape: "jsonError",
  },
} satisfies Record<RateLimitPolicyName, RateLimitPolicy>;

export function getRateLimitPolicy(name: RateLimitPolicyName): RateLimitPolicy {
  return rateLimitPolicies[name];
}
