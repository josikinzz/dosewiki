#!/usr/bin/env node
/**
 * scripts/perf/measure.mjs: reproducible cold-load page metrics for the perf loop.
 *
 * Drives system Google Chrome over a raw Chrome DevTools Protocol WebSocket.
 * No third-party automation dependency is required.
 *
 * What it measures, per run, with the HTTP cache disabled (cold load):
 *   - ttfb            finalResponseHeadersStart (Navigation Timing)
 *   - fcp             first-contentful-paint
 *   - lcp             largest-contentful-paint (buffered)
 *   - dcl             domContentLoadedEventEnd
 *   - load            loadEventEnd
 *   - ttiProxy        max(load, last long-task end), a main-thread settle proxy;
 *                     the JS download+parse+execute+hydration cost proxy
 *   - longTasks       count / total blocking-ish duration of >50ms long tasks
 *   - transferKB      sum of encoded bytes over the wire
 *   - requests        number of network requests
 *   - failedResources request URL and reason, retaining canceled prefetches separately
 *                     from unavailable assets instead of treating every abort as a bug
 *
 * Runs N times (default 7), retains every sample, and reports their median.
 * Synthetic measurements are not field percentiles. Cache state is observed,
 * never manufactured with public cache invalidation.
 * Client navigation: pass --from=<same-origin URL> and --link=<anchor selector>.
 * It measures incremental work after the source settles, retaining application
 * prefetch behavior. Native navigation FCP/LCP/TTFB are unavailable for this mode;
 * clientNavigation.commitMs is a diagnostic route-commit proxy, not a field metric.
 *
 * Usage:
 *   node scripts/perf/measure.mjs --url=http://localhost:3000/ --runs=7 --revision=BUILD_ID --family=home
 */

import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const CHROME =
  process.env.CHROME_BIN ||
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

function arg(name, fallback) {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
}

const URL = arg("url", "http://localhost:3000/");
const RUNS = Number(arg("runs", "7"));
const SETTLE_MS = 600; // main-thread quiet window before declaring "settled"
const REVISION = arg("revision", null);
const FAMILY = arg("family", null);
const SURFACE = arg("surface", "public");
const FLAVOR = arg("flavor", "dosewiki");
const LOCALE = arg("locale", "en");
const WIDTH = Number(arg("width", "1440"));
const HEIGHT = Number(arg("height", "1000"));
const CPU_RATE = Number(arg("cpu-rate", "1"));
const INTERACTION = arg("interaction", null);
const FROM = arg("from", null);
const LINK = arg("link", null);
const LOCAL_HOST = arg("local-host", null);
const BROWSER_CACHE = arg("browser-cache", "disabled");
const NAV_TIMEOUT_MS = 30000;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// --- Minimal CDP client over a single WebSocket (flat session mode) ----------
class CDP {
  constructor(ws) {
    this.ws = ws;
    this.id = 0;
    this.pending = new Map();
    this.handlers = new Map();
    ws.addEventListener("message", (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id != null && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) reject(new Error(JSON.stringify(msg.error)));
        else resolve(msg.result);
      } else if (msg.method) {
        const key = msg.sessionId ? `${msg.sessionId}:${msg.method}` : msg.method;
        const list = this.handlers.get(key);
        if (list) for (const h of list) h(msg.params);
      }
    });
  }
  send(method, params = {}, sessionId) {
    const id = ++this.id;
    const payload = { id, method, params };
    if (sessionId) payload.sessionId = sessionId;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify(payload));
    });
  }
  on(method, handler, sessionId) {
    const key = sessionId ? `${sessionId}:${method}` : method;
    if (!this.handlers.has(key)) this.handlers.set(key, []);
    this.handlers.get(key).push(handler);
  }
  off(method, sessionId) {
    const key = sessionId ? `${sessionId}:${method}` : method;
    this.handlers.delete(key);
  }
}

function openWs(url) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    ws.addEventListener("open", () => resolve(ws), { once: true });
    ws.addEventListener("error", (e) => reject(e), { once: true });
  });
}

// Init script: capture long tasks + LCP from the very first document.
const INIT_SCRIPT = `
  window.__perf = { longtasks: [], lcp: 0 };
  try {
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) {
        window.__perf.longtasks.push({ start: e.startTime, dur: e.duration });
      }
    }).observe({ type: "longtask", buffered: true });
  } catch {}
  try {
    new PerformanceObserver((list) => {
      const es = list.getEntries();
      if (es.length) window.__perf.lcp = es[es.length - 1].startTime;
    }).observe({ type: "largest-contentful-paint", buffered: true });
  } catch {}
`;

const COLLECT_SCRIPT = `
  (() => {
    const nav = performance.getEntriesByType("navigation")[0] || {};
    const client = window.__perf && window.__perf.clientNavigation;
    const offset = client ? client.started : 0;
    const paints = performance.getEntriesByType("paint");
    const fcp = (paints.find((p) => p.name === "first-contentful-paint") || {}).startTime || 0;
    const lt = (window.__perf && window.__perf.longtasks) || [];
    const lastLong = Math.max(0, lt.reduce((m, t) => Math.max(m, t.start + t.dur), 0) - offset);
    const totalLong = lt.reduce((s, t) => s + t.dur, 0);
    return JSON.stringify({
      finalHeadersMs: client ? null : nav.finalResponseHeadersStart || null,
      dcl: client ? null : nav.domContentLoadedEventEnd || 0,
      load: client ? null : nav.loadEventEnd || 0,
      fcp: client ? null : fcp,
      lcp: client ? null : (window.__perf && window.__perf.lcp) || 0,
      clientNavigation: client || null,
      domElements: document.querySelectorAll("*").length,
      mainTextCharacters: (document.querySelector("main")?.textContent || "").length,
      lastLong,
      longTaskCount: lt.length,
      totalLongMs: totalLong,
    });
  })()
`;

async function waitForMainThreadQuiet(cdp, sessionId) {
  let lastSeenLong = 0;
  let quietSince = Date.now();
  const deadline = Date.now() + NAV_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const { result } = await cdp.send("Runtime.evaluate", {
      expression: "JSON.stringify((window.__perf&&window.__perf.longtasks||[]).reduce((m,t)=>Math.max(m,t.start+t.dur),0))",
      returnByValue: true,
    }, sessionId);
    const cur = JSON.parse(result.value || "0");
    if (cur > lastSeenLong) {
      lastSeenLong = cur;
      quietSince = Date.now();
    }
    if (Date.now() - quietSince >= SETTLE_MS) break;
    await sleep(100);
  }
}

async function runOnce(cdp) {
  // Fresh page target per run for isolation.
  const { targetId } = await cdp.send("Target.createTarget", {
    url: "about:blank",
  });
  const { sessionId } = await cdp.send("Target.attachToTarget", {
    targetId,
    flatten: true,
  });

  await cdp.send("Page.enable", {}, sessionId);
  await cdp.send("Network.enable", {}, sessionId);
  await cdp.send("Runtime.enable", {}, sessionId);
  await cdp.send("Network.setCacheDisabled", { cacheDisabled: BROWSER_CACHE === "disabled" }, sessionId);
  await cdp.send("Emulation.setDeviceMetricsOverride", {
    width: WIDTH, height: HEIGHT, deviceScaleFactor: 1, mobile: false,
  }, sessionId);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: CPU_RATE }, sessionId);
  await cdp.send("Page.addScriptToEvaluateOnNewDocument", { source: INIT_SCRIPT }, sessionId);

  // Track network transfer.
  let transferBytes = 0;
  let requests = 0;
  const resources = new Map();
  let documentResponse = null;
  let navigationResponse = null;
  let measuring = !FROM;
  const failedResources = [];
  const measuredRequests = new Map();
  cdp.on("Network.requestWillBeSent", (event) => {
    if (!measuring) return;
    measuredRequests.set(event.requestId, event.request.url);
    requests += 1;
  }, sessionId);
  cdp.on("Network.loadingFailed", (event) => {
    if (measuredRequests.has(event.requestId)) failedResources.push({
      url: measuredRequests.get(event.requestId), error: event.errorText,
      canceled: Boolean(event.canceled), blockedReason: event.blockedReason ?? null,
    });
  }, sessionId);
  cdp.on(
    "Network.responseReceived",
    (event) => {
      if (!measuredRequests.has(event.requestId)) return;
      const response = event.response;
      const mime = response.mimeType || "";
      const kind = event.type === "Document" ? "html"
        : mime.includes("text/x-component") ? "flight"
        : event.type === "Script" ? "javascript"
        : event.type === "Stylesheet" ? "css"
        : event.type === "Font" ? "font"
        : ["Image", "Media"].includes(event.type) ? "media" : "other";
      resources.set(event.requestId, {
        kind, encoded: null, decoded: 0,
        cached: Boolean(response.fromDiskCache || response.fromPrefetchCache || response.fromServiceWorker),
      });
      const targetFlight = FROM && kind === "flight"
        && new globalThis.URL(response.url).pathname === new globalThis.URL(URL).pathname;
      if (event.type === "Document" || targetFlight) {
        const headers = Object.fromEntries(Object.entries(response.headers).map(([k, v]) => [k.toLowerCase(), v]));
        const observedResponse = {
          url: response.url,
          status: response.status,
          cache: headers["x-nextjs-cache"] ?? headers["x-vercel-cache"] ?? null,
          deployment: headers["x-vercel-id"] ?? null,
          finalHeadersMs: response.timing?.receiveHeadersEnd ?? null,
        };
        if (event.type === "Document") documentResponse = observedResponse;
        else navigationResponse ??= observedResponse;
      }
    },
    sessionId,
  );
  cdp.on(
    "Network.loadingFinished",
    (p) => {
      if (!measuredRequests.has(p.requestId)) return;
      transferBytes += p.encodedDataLength || 0;
      const resource = resources.get(p.requestId);
      if (resource) resource.encoded = p.encodedDataLength;
    },
    sessionId,
  );
  cdp.on("Network.dataReceived", (event) => {
    const resource = resources.get(event.requestId);
    if (resource) resource.decoded += event.dataLength;
  }, sessionId);

  // Navigate + await load.
  const loadFired = new Promise((resolve) => {
    cdp.on("Page.loadEventFired", () => resolve(), sessionId);
  });
  const navResult = await cdp.send("Page.navigate", { url: FROM || URL }, sessionId);
  if (navResult.errorText) {
    throw new Error(`navigation failed: ${navResult.errorText}`);
  }
  let loadTimer;
  try {
    await Promise.race([
      loadFired,
      new Promise((_, reject) => {
        loadTimer = setTimeout(() => reject(new Error("Navigation load timed out")), NAV_TIMEOUT_MS);
      }),
    ]);
  } finally {
    clearTimeout(loadTimer);
  }

  // Wait for the main thread to go quiet (settle) — JS/hydration cost proxy.
  await waitForMainThreadQuiet(cdp, sessionId);
  if (FROM) {
    measuring = true;
    const expression = `(async () => {
      const element = document.querySelector(${JSON.stringify(LINK)});
      const target = new URL(${JSON.stringify(URL)});
      if (!(element instanceof HTMLAnchorElement) || element.href !== target.href
        || (element.target && element.target !== "_self") || element.hasAttribute("download")) {
        throw new Error("Client navigation requires a same-tab anchor to the exact target URL");
      }
      const started = performance.now();
      const timeOrigin = performance.timeOrigin;
      window.__perf.longtasks = [];
      const state = window.__perf.clientNavigation = {
        from: location.href, to: target.href, started, pendingVisible: false, commitMs: null
      };
      const observer = new MutationObserver(() => {
        if (document.documentElement.dataset.navPending === "true") state.pendingVisible = true;
      });
      observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-nav-pending"] });
      element.click();
      try {
        while (performance.now() - started < ${NAV_TIMEOUT_MS}) {
          await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
          if (location.href === target.href && document.documentElement.dataset.navPending !== "true") {
            if (performance.timeOrigin !== timeOrigin) throw new Error("Client navigation replaced the document");
            state.commitMs = performance.now() - started;
            return state;
          }
        }
        throw new Error("Client navigation did not commit");
      } finally {
        observer.disconnect();
      }
    })()`;
    const navigation = await cdp.send("Runtime.evaluate", {
      expression, returnByValue: true, awaitPromise: true,
    }, sessionId);
    if (navigation.exceptionDetails) throw new Error("Client navigation failed: " + JSON.stringify(navigation.exceptionDetails));
    await waitForMainThreadQuiet(cdp, sessionId);
  }

  const { result } = await cdp.send(
    "Runtime.evaluate",
    { expression: COLLECT_SCRIPT, returnByValue: true },
    sessionId,
  );
  const m = JSON.parse(result.value);
  const startupTransferBytes = transferBytes;
  const startupRequests = requests;
  const startupDocument = documentResponse;
  const startupNavigationResponse = navigationResponse;
  const startupFailedResources = failedResources.slice();
  const bytes = {};
  for (const resource of resources.values()) {
    const bucket = bytes[resource.kind] ??= { encoded: 0, decoded: 0, incomplete: 0, cachedResponses: 0 };
    if (resource.cached) bucket.cachedResponses += 1;
    if (resource.encoded === null) bucket.incomplete += 1;
    else bucket.encoded += resource.encoded;
    bucket.decoded += resource.decoded;
  }
  let interaction = null;
  if (INTERACTION) {
    const expression = `(async () => {
      const element = document.querySelector(${JSON.stringify(INTERACTION)});
      if (!element) throw new Error("Interaction selector did not match");
      const started = performance.now();
      element.click();
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      return { selector: ${JSON.stringify(INTERACTION)}, nextPaintMs: performance.now() - started, url: location.href };
    })()`;
    const observed = await cdp.send("Runtime.evaluate", {
      expression, returnByValue: true, awaitPromise: true,
    }, sessionId);
    if (observed.exceptionDetails) throw new Error("Interaction failed: " + JSON.stringify(observed.exceptionDetails));
    interaction = observed.result.value;
  }
  const ttiProxy = Math.max(m.load ?? m.clientNavigation?.commitMs ?? 0, m.lastLong);

  await cdp.send("Target.closeTarget", { targetId });

  return {
    ttfb: m.finalHeadersMs ?? null,
    fcp: m.fcp === null ? null : round(m.fcp),
    lcp: m.lcp === null ? null : round(m.lcp),
    dcl: m.dcl === null ? null : round(m.dcl),
    load: m.load === null ? null : round(m.load),
    ttiProxy: round(ttiProxy),
    longTasks: m.longTaskCount,
    totalLongMs: round(m.totalLongMs),
    transferKB: round(startupTransferBytes / 1024),
    requests: startupRequests,
    document: startupDocument,
    bytes,
    navigationResponse: startupNavigationResponse,
    clientNavigation: m.clientNavigation,
    failedRequests: startupFailedResources.length,
    failedResources: startupFailedResources,
    domElements: m.domElements,
    mainTextCharacters: m.mainTextCharacters,
    interaction,
  };
}

const round = (n) => Math.round(n * 10) / 10;

function median(nums) {
  const s = nums.filter((n) => typeof n === "number" && Number.isFinite(n)).sort((a, b) => a - b);
  if (!s.length) return null;
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

async function main() {
  if (!REVISION || !FAMILY) throw new Error("--revision and --family are required for attributable samples");
  if (!["enabled", "disabled"].includes(BROWSER_CACHE)) throw new Error("--browser-cache must be enabled or disabled");
  const target = new globalThis.URL(URL);
  if (Boolean(FROM) !== Boolean(LINK)) throw new Error("--from and --link must be supplied together");
  if (FROM && new globalThis.URL(FROM).origin !== target.origin) {
    throw new Error("Client navigation source and target must share an origin");
  }
  if (LOCAL_HOST && (!["http:", "https:"].includes(target.protocol) || !target.port
    || target.hostname !== LOCAL_HOST || !/^[a-z0-9.-]+$/.test(LOCAL_HOST))) {
    throw new Error("--local-host must match an explicit HTTP(S) host and port mapped to loopback");
  }
  if ((INTERACTION || FROM) && !LOCAL_HOST && !["localhost", "127.0.0.1", "[::1]"].includes(target.hostname)) {
    throw new Error("Interactive measurements require a local production-shaped artifact");
  }
  if (![RUNS, WIDTH, HEIGHT].every((n) => Number.isSafeInteger(n) && n > 0)
    || !Number.isFinite(CPU_RATE) || CPU_RATE < 1) throw new Error("Invalid run count or device profile");
  if (!existsSync(CHROME)) {
    console.error(`Chrome not found at: ${CHROME} (set CHROME_BIN)`);
    process.exit(2);
  }
  const userDataDir = mkdtempSync(join(tmpdir(), "perf-chrome-"));
  const chrome = spawn(
    CHROME,
    [
      "--headless=new",
      "--disable-gpu",
      "--no-first-run",
      "--no-default-browser-check",
      "--disable-backgrounding-occluded-windows",
      "--disable-renderer-backgrounding",
      "--disable-background-timer-throttling",
      ...(LOCAL_HOST ? [`--host-resolver-rules=MAP ${LOCAL_HOST} 127.0.0.1`, "--no-proxy-server"] : []),
      `--user-data-dir=${userDataDir}`,
      "--remote-debugging-port=0",
      "about:blank",
    ],
    { stdio: ["ignore", "ignore", "ignore"] },
  );

  let cdp;
  try {
    // Discover the chosen debugging port.
    const portFile = join(userDataDir, "DevToolsActivePort");
    let port;
    for (let i = 0; i < 100; i++) {
      if (existsSync(portFile)) {
        port = readFileSync(portFile, "utf8").split("\n")[0].trim();
        if (port) break;
      }
      await sleep(100);
    }
    if (!port) throw new Error("Chrome did not expose a debugging port");

    const ver = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json();
    const ws = await openWs(ver.webSocketDebuggerUrl);
    cdp = new CDP(ws);
    await cdp.send("Target.setDiscoverTargets", { discover: true });

    const runs = [];
    for (let i = 0; i < RUNS; i++) {
      const r = await runOnce(cdp);
      runs.push(r);
      process.stderr.write(
        `  run ${i + 1}/${RUNS}: ttiProxy=${r.ttiProxy}ms transfer=${r.transferKB}KB requests=${r.requests} failed=${r.failedRequests}\n`,
      );
    }

    const kept = runs;

    const keys = [
      "ttfb",
      "fcp",
      "lcp",
      "dcl",
      "load",
      "ttiProxy",
      "longTasks",
      "totalLongMs",
      "transferKB",
      "requests",
    ];
    const out = {
      url: URL, revision: REVISION, family: FAMILY, surface: SURFACE,
      flavor: FLAVOR, locale: LOCALE, runs: RUNS, keptRuns: kept.length,
      navigation: FROM ? "client" : "direct", from: FROM, link: LINK,
      profile: { width: WIDTH, height: HEIGHT, cpuRate: CPU_RATE, browserCache: BROWSER_CACHE,
        network: "unthrottled", loopbackHost: LOCAL_HOST, routerPrefetch: "application-default" },
      fieldPercentiles: null,
      browser: ver.Browser,
      measuredAt: new Date().toISOString(),
    };
    for (const k of keys) {
      const value = median(kept.map((r) => r[k]));
      out[k] = value === null ? null : round(value);
    }
    out.raw = runs;

    console.log(JSON.stringify(out, null, 2));
  } finally {
    try {
      chrome.kill("SIGKILL");
    } catch {}
    try {
      rmSync(userDataDir, { recursive: true, force: true });
    } catch {}
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
