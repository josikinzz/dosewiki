export type RateLimitPolicyName =
  | "editorHeavyWrite"
  | "editorSmallWrite"
  | "authenticatedProfileWrite"
  | "publicTripReportSubmit"
  | "publicArticleFeedbackSubmit"
  | "publicSiteFeedbackSubmit"
  | "publicSubscribeRelay"
  | "publicProxyRead"
  | "publicationSignalVerified"
  | "diagnosticRead"
  | "editorPolledRead"
  | "publicSearchRead"
  | "publicContentApiRead"
  | "authCredentialAttempt";

export type RateLimitPolicy = {
  name: RateLimitPolicyName;
  windowMs: number;
  max: number;
};

const ONE_MINUTE_MS = 60_000;

const rateLimitPolicies = {
  editorHeavyWrite: { windowMs: ONE_MINUTE_MS, max: 5 },
  editorSmallWrite: { windowMs: ONE_MINUTE_MS, max: 20 },
  authenticatedProfileWrite: { windowMs: ONE_MINUTE_MS, max: 5 },
  publicTripReportSubmit: { windowMs: ONE_MINUTE_MS, max: 4 },
  publicArticleFeedbackSubmit: { windowMs: ONE_MINUTE_MS, max: 3 },
  publicSiteFeedbackSubmit: { windowMs: ONE_MINUTE_MS, max: 3 },
  publicSubscribeRelay: { windowMs: 10 * ONE_MINUTE_MS, max: 5 },
  publicProxyRead: { windowMs: ONE_MINUTE_MS, max: 30 },
  publicationSignalVerified: { windowMs: ONE_MINUTE_MS, max: 600 },
  diagnosticRead: { windowMs: ONE_MINUTE_MS, max: 30 },
  editorPolledRead: { windowMs: ONE_MINUTE_MS, max: 300 },
  publicSearchRead: { windowMs: ONE_MINUTE_MS, max: 30 },
  publicContentApiRead: { windowMs: ONE_MINUTE_MS, max: 120 },
  authCredentialAttempt: { windowMs: 10 * ONE_MINUTE_MS, max: 10 },
} satisfies Record<RateLimitPolicyName, Omit<RateLimitPolicy, "name">>;

export function getRateLimitPolicy(name: RateLimitPolicyName): RateLimitPolicy {
  return { name, ...rateLimitPolicies[name] };
}
