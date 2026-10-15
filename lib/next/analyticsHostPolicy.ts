import { normalizeHost } from "./publicHostPolicy";

const APPROVED_ANALYTICS_HOSTS: Record<string, true> = {
  "dose.wiki": true,
  "www.dose.wiki": true,
};

export const POSTHOG_API_HOST = "/ingest";
export const POSTHOG_UI_HOST = "https://us.posthog.com";

export const POSTHOG_PROJECT_KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY ?? "";

export function isApprovedAnalyticsHost(host: string | null | undefined): boolean {
  return APPROVED_ANALYTICS_HOSTS[normalizeHost(host)] === true;
}

export function isPostHogEnabled(host: string | null | undefined): boolean {
  return POSTHOG_PROJECT_KEY.length > 0 && isApprovedAnalyticsHost(host);
}
