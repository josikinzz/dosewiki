/**
 * Where replication media actually lives, and whether each host is in danger.
 *
 * The only host this project controls is the configured R2 media namespace
 * (`REPLICATION_MEDIA_BASE_URL`). Every other host is a literal URL string in
 * a production row: this repository has no admin credential for it, no way to
 * enumerate it, and no way to recover a file once it is gone. Such rows are
 * referenced by data alone and must be treated as at risk and reported.
 *
 * This module is the one place that trust decision is written down, so a
 * future migration cannot disagree with an audit about which rows are at risk.
 */

/**
 * Risk tiers, most urgent first. A lower tier is fetched before a higher one,
 * because the ordering question here is "what is most likely to disappear
 * before we get to it", not "what is biggest".
 */
export const RISK = Object.freeze({
  UNKNOWN: "unknown",
  PRODUCTION: "production",
});

export function hostOf(url) {
  if (typeof url !== "string" || !url.includes("://")) return null;
  try {
    return new URL(url).host;
  } catch {
    return null;
  }
}

function isConfiguredR2Url(value) {
  try {
    const base = new URL(process.env.REPLICATION_MEDIA_BASE_URL ?? "");
    const candidate = new URL(value);
    const prefix = `${base.pathname.replace(/\/+$/, "")}/media/sha256/`;
    return base.protocol === "https:" && !base.username && !base.password && !base.search && !base.hash
      && candidate.origin === base.origin && candidate.pathname.startsWith(prefix)
      && !candidate.username && !candidate.password && !candidate.search && !candidate.hash;
  } catch {
    return false;
  }
}

/**
 * Classify a media URL by how recoverable it is if the host goes away.
 *
 * Any host other than the configured media namespace is `unknown` rather than
 * safe. A host nobody has accounted for is exactly the situation that once left
 * most of the corpus on deployments this project could not enumerate.
 */
export function classifyHostRisk(url) {
  const host = hostOf(url);
  if (!host) return { host: null, risk: RISK.UNKNOWN, atRisk: true };
  if (isProductionUrl(url)) return { host, risk: RISK.PRODUCTION, atRisk: false };
  return { host, risk: RISK.UNKNOWN, atRisk: true };
}

/** Only the explicitly configured native R2 media namespace is trusted. */
export function isProductionUrl(url) {
  return isConfiguredR2Url(url);
}
