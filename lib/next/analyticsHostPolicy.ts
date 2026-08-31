import { normalizeHost } from "./publicHostPolicy";

const APPROVED_ANALYTICS_HOSTS: Record<string, true> = {
  "dose.wiki": true,
  "www.dose.wiki": true,
};

// PostHog is the only analytics pipeline. It initialises on the approved public hosts alone,
// so the editorial `/dev` surface, the admin host and Vercel previews stay free of analytics.
// The project key is deployment-scoped rather than committed, which also keeps the
// credential-free Effect Index deployment PostHog-free.
export const POSTHOG_API_HOST = "/ingest";
export const POSTHOG_UI_HOST = "https://us.posthog.com";

/**
 * Build-time project key. Referenced as a static `process.env` member so Next inlines it into
 * the client bundle; an unset key disables PostHog everywhere rather than failing the build.
 */
export const POSTHOG_PROJECT_KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY ?? "";

export function isApprovedAnalyticsHost(host: string | null | undefined): boolean {
  return APPROVED_ANALYTICS_HOSTS[normalizeHost(host)] === true;
}

export function isPostHogEnabled(host: string | null | undefined): boolean {
  return POSTHOG_PROJECT_KEY.length > 0 && isApprovedAnalyticsHost(host);
}
