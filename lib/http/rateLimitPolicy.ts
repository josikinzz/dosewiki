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

/**
 * Every policy keys by client IP, falls back to the in-memory store when
 * Upstash is unavailable, and answers with the JSON 429 from `nextRateLimit`;
 * only the window and the budget vary.
 */
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
  /**
   * Signups a credential-free relay (Effect Index) forwards to the list owner.
   * The relay holds no database limiter, so it spends this local per-reader
   * budget, matching the receiver's `subscribePerIp` refill of five per ten
   * minutes, before it forwards anything.
   */
  publicSubscribeRelay: { windowMs: 10 * ONE_MINUTE_MS, max: 5 },
  publicProxyRead: { windowMs: ONE_MINUTE_MS, max: 30 },
  /**
   * Publication signals whose HMAC signature already verified. The editor sends
   * one signed request per outbox row, six rows in flight at a time, all from
   * the editor's egress address, so this bucket is sized for that burst and
   * kept apart from the unverified public limit.
   */
  publicationSignalVerified: { windowMs: ONE_MINUTE_MS, max: 600 },
  diagnosticRead: { windowMs: ONE_MINUTE_MS, max: 30 },
  /**
   * Editor-surface reads that TanStack Query polls (15 s per list, 5 s per
   * open document) plus refetch-on-focus: one editor with several tools open
   * legitimately issues around sixty requests a minute, and editors behind a
   * shared address multiply that.
   */
  editorPolledRead: { windowMs: ONE_MINUTE_MS, max: 300 },
  publicSearchRead: { windowMs: ONE_MINUTE_MS, max: 30 },
  publicContentApiRead: { windowMs: ONE_MINUTE_MS, max: 120 },
  authCredentialAttempt: { windowMs: 10 * ONE_MINUTE_MS, max: 10 },
} satisfies Record<RateLimitPolicyName, Omit<RateLimitPolicy, "name">>;

export function getRateLimitPolicy(name: RateLimitPolicyName): RateLimitPolicy {
  return { name, ...rateLimitPolicies[name] };
}
