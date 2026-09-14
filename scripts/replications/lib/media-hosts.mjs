/**
 * Where replication media actually lives, and how much danger each host is in.
 *
 * Measured against production (`glad-minnow-656`) on 2026-08-10, across the 125
 * video rows:
 *
 *   videos      60 glad-minnow-656 · 59 warmhearted-mosquito-204 · 6 adept-goldfish-624
 *   thumbnails  60 glad-minnow-656 · 65 enchanted-echidna-791
 *
 * 99% of the corpus by bytes (44.19 GB of 44.62 GB) sits on the two orphan
 * deployments. Production holds 431 MB. The two largest single files each exceed
 * everything production holds.
 *
 * This module is the one place those hostnames are written down, so a future
 * migration cannot disagree with an audit about which rows are at risk.
 */

/** The deployment this project owns and deploys to. Media here is safe. */
export const PRODUCTION_HOST = "glad-minnow-656.convex.cloud";

/**
 * The development deployment. Media here is NOT safe: a dev deployment can be
 * reset at any time, and 65 replication thumbnails are currently served from it.
 */
const DEV_HOST = "enchanted-echidna-791.convex.cloud";

/**
 * Deployments that appear only as literal URL strings in production rows. This
 * repository has no admin credential for either, no way to enumerate them, and
 * no way to recover a file once it is gone. They are referenced by data alone.
 */
const ORPHAN_HOSTS = Object.freeze([
  "warmhearted-mosquito-204.convex.cloud",
  "adept-goldfish-624.convex.cloud",
]);

/**
 * Risk tiers, ordered most urgent first. The number is the archive tier: a lower
 * tier is fetched before a higher one, because the ordering question here is
 * "what is most likely to disappear before we get to it", not "what is biggest".
 */
export const RISK = Object.freeze({
  ORPHAN: "orphan",
  DEV: "dev",
  PRODUCTION: "production",
  UNKNOWN: "unknown",
});

export function hostOf(url) {
  if (typeof url !== "string" || !url.includes("://")) return null;
  try {
    return new URL(url).host;
  } catch {
    return null;
  }
}

/**
 * Classify a media URL by how recoverable it is if the host goes away.
 *
 * An unrecognised host is `unknown` rather than safe — a host nobody has
 * accounted for is exactly the situation that produced the orphan deployments in
 * the first place, so it must be treated as at risk and reported.
 */
export function classifyHostRisk(url) {
  const host = hostOf(url);
  if (!host) return { host: null, risk: RISK.UNKNOWN, atRisk: true };
  if (host === PRODUCTION_HOST) return { host, risk: RISK.PRODUCTION, atRisk: false };
  if (host === DEV_HOST) return { host, risk: RISK.DEV, atRisk: true };
  if (ORPHAN_HOSTS.includes(host)) return { host, risk: RISK.ORPHAN, atRisk: true };
  return { host, risk: RISK.UNKNOWN, atRisk: true };
}

/** True when a resolved URL is already served by the deployment we control. */
export function isProductionUrl(url) {
  return hostOf(url) === PRODUCTION_HOST;
}
