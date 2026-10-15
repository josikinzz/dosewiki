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

export function classifyHostRisk(url) {
  const host = hostOf(url);
  if (!host) return { host: null, risk: RISK.UNKNOWN, atRisk: true };
  if (isProductionUrl(url)) return { host, risk: RISK.PRODUCTION, atRisk: false };
  return { host, risk: RISK.UNKNOWN, atRisk: true };
}

export function isProductionUrl(url) {
  return isConfiguredR2Url(url);
}
