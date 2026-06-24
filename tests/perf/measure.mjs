#!/usr/bin/env node
/**
 * tests/perf/measure.mjs — reproducible cold-load page metric for the perf loop.
 *
 * Drives the system Google Chrome via the Chrome DevTools Protocol (CDP) over a
 * raw WebSocket. No third-party dependencies (Playwright is not installed and the
 * perf-loop constraints forbid adding deps), so the harness only needs a local
 * Chrome and a running `next start` server.
 *
 * What it measures, per run, with the HTTP cache disabled (cold load):
 *   - ttfb            responseStart (Navigation Timing)
 *   - fcp             first-contentful-paint
 *   - lcp             largest-contentful-paint (buffered)
 *   - dcl             domContentLoadedEventEnd
 *   - load            loadEventEnd
 *   - ttiProxy        max(load, last long-task end) — main-thread "settle" time;
 *                     the JS download+parse+execute+hydration cost proxy
 *   - longTasks       count / total blocking-ish duration of >50ms long tasks
 *   - transferKB      sum of encoded bytes over the wire
 *   - requests        number of network requests
 *
 * Runs N times (default 7), drops the slowest run as a warm-up/outlier guard, and
 * reports the MEDIAN of the rest. ttiProxy is the primary tracked metric; the rest
 * are corroborating. Output is a single JSON object on stdout.
 *
 * Usage:
 *   node tests/perf/measure.mjs --url=http://localhost:3000/ --runs=7
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
    const paints = performance.getEntriesByType("paint");
    const fcp = (paints.find((p) => p.name === "first-contentful-paint") || {}).startTime || 0;
    const lt = (window.__perf && window.__perf.longtasks) || [];
    const lastLong = lt.reduce((m, t) => Math.max(m, t.start + t.dur), 0);
    const totalLong = lt.reduce((s, t) => s + t.dur, 0);
    return JSON.stringify({
      ttfb: nav.responseStart || 0,
      dcl: nav.domContentLoadedEventEnd || 0,
      load: nav.loadEventEnd || 0,
      fcp,
      lcp: (window.__perf && window.__perf.lcp) || 0,
      lastLong,
      longTaskCount: lt.length,
      totalLongMs: totalLong,
    });
  })()
`;

async function runOnce(cdp, browserSessionTargetId) {
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
  await cdp.send("Network.setCacheDisabled", { cacheDisabled: true }, sessionId);
  await cdp.send("Page.addScriptToEvaluateOnNewDocument", { source: INIT_SCRIPT }, sessionId);

  // Track network transfer.
  let transferBytes = 0;
  let requests = 0;
  cdp.on(
    "Network.responseReceived",
    () => {
      requests += 1;
    },
    sessionId,
  );
  cdp.on(
    "Network.loadingFinished",
    (p) => {
      transferBytes += p.encodedDataLength || 0;
    },
    sessionId,
  );

  // Navigate + await load.
  const loadFired = new Promise((resolve) => {
    cdp.on("Page.loadEventFired", () => resolve(), sessionId);
  });
  const navResult = await cdp.send("Page.navigate", { url: URL }, sessionId);
  if (navResult.errorText) {
    throw new Error(`navigation failed: ${navResult.errorText}`);
  }
  await Promise.race([loadFired, sleep(NAV_TIMEOUT_MS)]);

  // Wait for the main thread to go quiet (settle) — JS/hydration cost proxy.
  let lastSeenLong = 0;
  let quietSince = Date.now();
  const deadline = Date.now() + NAV_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const { result } = await cdp.send(
      "Runtime.evaluate",
      {
        expression:
          "JSON.stringify((window.__perf&&window.__perf.longtasks||[]).reduce((m,t)=>Math.max(m,t.start+t.dur),0))",
        returnByValue: true,
      },
      sessionId,
    );
    const cur = JSON.parse(result.value || "0");
    if (cur > lastSeenLong) {
      lastSeenLong = cur;
      quietSince = Date.now();
    }
    if (Date.now() - quietSince >= SETTLE_MS) break;
    await sleep(100);
  }

  const { result } = await cdp.send(
    "Runtime.evaluate",
    { expression: COLLECT_SCRIPT, returnByValue: true },
    sessionId,
  );
  const m = JSON.parse(result.value);
  const ttiProxy = Math.max(m.load, m.lastLong);

  await cdp.send("Target.closeTarget", { targetId });

  return {
    ttfb: round(m.ttfb),
    fcp: round(m.fcp),
    lcp: round(m.lcp),
    dcl: round(m.dcl),
    load: round(m.load),
    ttiProxy: round(ttiProxy),
    longTasks: m.longTaskCount,
    totalLongMs: round(m.totalLongMs),
    transferKB: round(transferBytes / 1024),
    requests,
  };
}

const round = (n) => Math.round(n * 10) / 10;

function median(nums) {
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

async function main() {
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
        `  run ${i + 1}/${RUNS}: ttiProxy=${r.ttiProxy}ms load=${r.load}ms fcp=${r.fcp}ms transfer=${r.transferKB}KB\n`,
      );
    }

    // Drop the single slowest ttiProxy run as a warm-up/outlier guard.
    const sorted = [...runs].sort((a, b) => a.ttiProxy - b.ttiProxy);
    const kept = sorted.slice(0, Math.max(1, runs.length - 1));

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
    const out = { url: URL, runs: RUNS, keptRuns: kept.length };
    for (const k of keys) out[k] = round(median(kept.map((r) => r[k])));
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
