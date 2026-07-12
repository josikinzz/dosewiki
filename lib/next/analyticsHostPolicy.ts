import { normalizeHost } from "./publicConstructionPolicy";

export const ANALYTICS_SCRIPT_ID = "dosewiki-public-analytics";
export const ANALYTICS_SCRIPT_SRC = "https://analytics.dose.wiki/script.js";

const ANALYTICS_WEBSITE_ID = "8fdefec9-8396-4b36-b822-398e3b9c6816";
const APPROVED_ANALYTICS_HOSTS = new Set(["dose.wiki", "www.dose.wiki"]);
const APPROVED_ANALYTICS_DOMAINS = [...APPROVED_ANALYTICS_HOSTS].join(",");

export function isApprovedAnalyticsHost(host: string | null | undefined): boolean {
  return APPROVED_ANALYTICS_HOSTS.has(normalizeHost(host));
}

export function attachApprovedAnalytics({
  document,
  host,
  nonce,
}: {
  document: Document;
  host: string | null | undefined;
  nonce?: string;
}): HTMLScriptElement | null {
  if (!isApprovedAnalyticsHost(host)) {
    return null;
  }

  const existing = document.getElementById(ANALYTICS_SCRIPT_ID);
  if (existing?.tagName === "SCRIPT") {
    return existing as HTMLScriptElement;
  }

  const script = document.createElement("script");
  script.id = ANALYTICS_SCRIPT_ID;
  script.src = ANALYTICS_SCRIPT_SRC;
  script.async = true;
  if (nonce) {
    script.nonce = nonce;
  }
  script.dataset.websiteId = ANALYTICS_WEBSITE_ID;
  script.dataset.domains = APPROVED_ANALYTICS_DOMAINS;
  document.head.appendChild(script);

  return script;
}
