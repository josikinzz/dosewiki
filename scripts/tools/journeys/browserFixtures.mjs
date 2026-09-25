/**
 * Playwright wiring for `fixtures.mjs`, shared by the journey runner and the
 * screenshot script.
 *
 * The browser only ever talks to a loopback dev server. Requests the fixture
 * owns are answered here and never reach that server; documents and assets
 * go through; every other origin is aborted, so a run cannot fetch remote
 * media or reach a hosted API. A write the fixture does not own is refused in
 * the browser, so nothing is posted to the server either.
 */

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

/** Refuses anything but a loopback origin before a browser is launched. */
export function assertLoopbackBase(value) {
  const base = new URL(value);
  if (!LOOPBACK_HOSTS.has(base.hostname)) {
    throw new Error(`Journeys and screenshots only run against a loopback origin; received ${base.origin}.`);
  }
  return base;
}

function parseBody(request) {
  const raw = request.postData();
  if (!raw) return undefined;
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

/**
 * Routes every request of `context` through `fixture`. With no fixture, the
 * browser is still read-only and loopback-only: `/api/*` reads go to the
 * server (and answer 401 there) and every non-GET is aborted.
 */
export async function installFixtureRoutes(context, { base, fixture = null, log = () => {} }) {
  const blocked = [];
  await context.route("**/*", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const method = request.method().toUpperCase();
    if (url.protocol === "data:" || url.protocol === "blob:") return route.continue();
    if (url.origin !== base.origin) {
      blocked.push({ method, url: url.toString() });
      return route.abort("blockedbyclient");
    }
    if (fixture) {
      const answer = fixture.respond({ method, pathname: url.pathname, search: url.search, body: parseBody(request) });
      if (answer) {
        if (answer.status === 204) return route.fulfill({ status: 204, body: "" });
        return route.fulfill({ status: answer.status, json: answer.json });
      }
    }
    if (method !== "GET" && method !== "HEAD") {
      blocked.push({ method, url: url.toString() });
      log(`blocked ${method} ${url}`);
      return route.abort("blockedbyclient");
    }
    return route.continue();
  });
  return { blocked };
}

/**
 * Waits until the `/dev` shell and its tool have settled: the shell chrome is
 * up, fonts are ready, and nothing announces loading or is marked busy. This
 * replaces waiting for network idle plus a fixed sleep; a journey then waits
 * on its own specific locator.
 */
export async function waitForDevShellReady(page, { timeout = 120_000 } = {}) {
  await page.getByRole("button", { name: "Leave editor" }).first().waitFor({ state: "attached", timeout });
  await page.waitForFunction(
    () => {
      if (document.readyState !== "complete") return false;
      if (document.querySelector('[aria-busy="true"]')) return false;
      const busy = [...document.querySelectorAll('[role="status"], [aria-live]')]
        .some((node) => /\bLoading\b|Loading…|Loading\.\.\./.test(node.textContent ?? ""));
      return !busy;
    },
    undefined,
    { timeout, polling: 100 },
  );
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
}
