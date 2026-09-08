const FALLBACK_RETURN_PATH = "/dev";

/** Only local application destinations; decoding cannot turn a path into an authority. */
export function safeAuthReturnPath(value: unknown, fallback = FALLBACK_RETURN_PATH): string {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//")) return fallback;
  let decoded = value.split(/[?#]/, 1)[0];
  for (let pass = 0; pass < 4; pass += 1) {
    if (decoded.startsWith("//")) return fallback;
    for (let index = 0; index < decoded.length; index += 1) {
      const code = decoded.charCodeAt(index);
      // Paths reject ASCII controls, spaces and backslashes before URL parsing.
      if (code <= 32 || code === 92 || code === 127) return fallback;
    }
    let next: string;
    try { next = decodeURIComponent(decoded); } catch { return fallback; }
    if (next === decoded) break;
    decoded = next;
    if (pass === 3) return fallback;
  }
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code < 32 || code === 127) return fallback;
  }
  const parsed = new URL(value, "https://return.invalid");
  if (parsed.origin !== "https://return.invalid") return fallback;
  if ([decoded, parsed.pathname].some((pathname) => /^\/(?:sign-in|unauthorized|api\/auth)(?:\/|$)/.test(pathname))) return fallback;
  return `${parsed.pathname}${parsed.search}${parsed.hash}`;
}

export function safeAuthRedirect(url: string, baseUrl: string): string {
  const base = new URL(baseUrl);
  try {
    const target = new URL(url, base);
    if (target.origin !== base.origin) return new URL(FALLBACK_RETURN_PATH, base).href;
    return new URL(safeAuthReturnPath(url.startsWith("/") ? url : `${target.pathname}${target.search}${target.hash}`), base).href;
  } catch {
    return new URL(FALLBACK_RETURN_PATH, base).href;
  }
}
