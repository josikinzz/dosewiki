#!/usr/bin/env node
/**
 * Browser journeys through the `/dev` shell against deterministic fixtures.
 *
 *   npm run dev:journeys-server           # terminal 1, serves 127.0.0.1:3100
 *   npm run test:journeys                 # terminal 2
 *   npm run test:journeys -- --only conflict-and-reconcile --variant narrow-dark-touch
 *
 * The dev server is the local screenshot viewer, which renders `/dev`
 * documents without an account (`lib/auth/devScreenshotViewer.ts`). Every API
 * request is answered inside this browser by `fixtures.mjs`, so a journey
 * reads no private data, reaches no database, and posts nothing to the
 * server. Journeys wait on specific ready-state locators, never on network
 * idle or a fixed sleep.
 *
 * Each journey runs once per variant: a desktop viewport in the light theme
 * with a mouse, and a narrow viewport in the dark theme with real touch
 * emulation (`hasTouch`, `isMobile`, coarse pointer). Both drive the page by
 * keyboard where an editor would.
 */
import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { chromium } from "playwright-core";

import { assertLoopbackBase, installFixtureRoutes, waitForDevShellReady } from "./browserFixtures.mjs";
import { JOURNEY_ROLES, TOOL_STATES, createJourneyFixture } from "./fixtures.mjs";

const { values } = parseArgs({
  options: {
    base: { type: "string", default: "http://127.0.0.1:3100" },
    only: { type: "string", multiple: true },
    variant: { type: "string", multiple: true },
    headed: { type: "boolean", default: false },
    "artifacts-dir": { type: "string", default: "tmp/journeys" },
    help: { type: "boolean", short: "h", default: false },
  },
});

const VARIANTS = {
  "desktop-light": {
    touch: false,
    context: { viewport: { width: 1440, height: 900 }, colorScheme: "light" },
  },
  "narrow-dark-touch": {
    touch: true,
    context: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, colorScheme: "dark" },
  },
};

const WRITING_ROW = "/dev/writing/launch-post";
/** `colorSchemeStorageKey` in `src/theme/theme-token-interface.json`. */
const COLOR_SCHEME_STORAGE_KEY = "dosewiki-theme";
/** WCAG 2.2 target size minimum; a tapped control smaller than this fails the touch variant. */
const MIN_TOUCH_TARGET = 24;
const STEP_TIMEOUT = 15_000;

/** Polls `check` until it stops throwing: waits on a condition, never on a clock. */
async function eventually(check, { timeout = STEP_TIMEOUT, interval = 100 } = {}) {
  const deadline = Date.now() + timeout;
  for (;;) {
    try {
      return await check();
    } catch (error) {
      if (Date.now() > deadline) throw error;
      await new Promise((settle) => setTimeout(settle, interval));
    }
  }
}

/** One browser context: a variant, a fixture, and the helpers a journey drives the page with. */
async function openSession(browser, variantName, { role = "admin", state = "loaded", fixture: shared = null } = {}) {
  const variant = VARIANTS[variantName];
  const context = await browser.newContext(variant.context);
  // The site paints dark unless told otherwise; "system" hands the theme to
  // the emulated OS preference, so the variant's colorScheme decides it.
  await context.addInitScript((key) => {
    if (window.localStorage.getItem(key) === null) window.localStorage.setItem(key, "system");
  }, COLOR_SCHEME_STORAGE_KEY);
  const fixture = shared ?? createJourneyFixture({ role, state });
  const base = assertLoopbackBase(values.base);
  const routes = await installFixtureRoutes(context, { base, fixture });
  const page = await context.newPage();
  const pageErrors = [];
  const unloadPrompts = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("dialog", (dialog) => {
    // The shell's unsaved-work guard: the journey records it and lets the reload go ahead.
    if (dialog.type() === "beforeunload") {
      unloadPrompts.push(page.url());
      void dialog.accept();
    } else {
      void dialog.dismiss();
    }
  });

  const session = {
    browser,
    variantName,
    touch: variant.touch,
    dark: variant.context.colorScheme === "dark",
    context,
    page,
    fixture,
    routes,
    pageErrors,
    unloadPrompts,

    async open(path) {
      const response = await page.goto(new URL(path, base).toString(), { waitUntil: "domcontentloaded", timeout: 180_000 });
      const landed = new URL(page.url());
      if (landed.pathname === "/sign-in" || landed.pathname === "/unauthorized") {
        throw new Error(`Redirected to ${landed.pathname}: start the server with npm run dev:journeys-server.`);
      }
      assert.ok(response && response.status() < 400, `Loading ${path} answered ${response?.status()}.`);
      await session.settle();
    },

    /**
     * The shell is ready and the client session is the fixture's: the server
     * renders the viewer's own admin session first, and a tool that reads the
     * role resets when the fixture's session replaces it.
     */
    async settle() {
      await waitForDevShellReady(page);
      await page.getByText(fixture.session.user.name, { exact: true }).first().waitFor({ state: "attached", timeout: STEP_TIMEOUT });
      await waitForDevShellReady(page);
    },

    /** A click with the mouse, or a real tap on the touch variant, after checking the target is big enough to tap. */
    async activate(locator) {
      await locator.waitFor({ state: "visible", timeout: STEP_TIMEOUT });
      if (variant.touch) {
        const box = await locator.boundingBox();
        assert.ok(box, "A tapped control has no box.");
        const name = (await locator.getAttribute("aria-label")) ?? (await locator.innerText()).trim();
        assert.ok(
          box.width >= MIN_TOUCH_TARGET && box.height >= MIN_TOUCH_TARGET,
          `"${name}" is ${Math.round(box.width)}x${Math.round(box.height)}px, under the ${MIN_TOUCH_TARGET}px touch target.`,
        );
        await locator.tap();
      } else {
        await locator.click();
      }
    },

    /** Focus by keyboard-reachable means, then press a key, as a keyboard user would. */
    async press(locator, key) {
      await locator.waitFor({ state: "visible", timeout: STEP_TIMEOUT });
      await locator.focus();
      await page.keyboard.press(key);
    },

    /** Types at the end of a field with the keyboard. */
    async typeAtEnd(locator, text) {
      await locator.waitFor({ state: "visible", timeout: STEP_TIMEOUT });
      await locator.focus();
      // End means end of line in a textarea and scrolls instead on macOS, so
      // the caret is placed directly; the text itself is typed key by key.
      await locator.evaluate((node) => node.setSelectionRange(node.value.length, node.value.length));
      await page.keyboard.type(text);
    },

    async expectValue(locator, expected) {
      await eventually(async () => assert.equal(await locator.inputValue(), expected));
    },

    /** The accessible name of whatever holds focus, or its text. */
    async focused() {
      return page.evaluate(() => {
        const node = document.activeElement;
        if (!node || node === document.body) return null;
        return {
          label: node.getAttribute("aria-label") ?? node.textContent?.trim().slice(0, 80) ?? "",
          inDialog: Boolean(node.closest('[role="dialog"], [role="alertdialog"]')),
          tag: node.tagName.toLowerCase(),
        };
      });
    },

    /** The last answered request to one route, once it has been answered. */
    async lastRequest(method, pathname, { count = 1 } = {}) {
      return eventually(() => {
        const hits = fixture.requestsTo(method, pathname);
        assert.ok(hits.length >= count, `Expected ${count} ${method} ${pathname}, saw ${hits.length}.`);
        return hits[hits.length - 1];
      });
    },

    visible(locator) {
      return locator.filter({ visible: true }).first();
    },

    async close() {
      await context.close();
    },
  };
  return session;
}

/** The environment the variant promises: theme, pointer and viewport. */
async function assertVariantEnvironment({ page, touch, dark }) {
  const environment = await page.evaluate(() => ({
    dark: matchMedia("(prefers-color-scheme: dark)").matches,
    coarse: matchMedia("(pointer: coarse)").matches,
    hoverNone: matchMedia("(hover: none)").matches,
    touchPoints: navigator.maxTouchPoints,
    width: window.innerWidth,
    theme: document.documentElement.getAttribute("data-theme"),
  }));
  assert.equal(environment.dark, dark, "prefers-color-scheme follows the variant");
  assert.equal(environment.coarse, touch, "pointer: coarse follows the variant");
  assert.equal(environment.hoverNone, touch, "hover: none follows the variant");
  assert.equal(environment.touchPoints > 0, touch, "touch points follow the variant");
  if (environment.theme) assert.equal(environment.theme, dark ? "dark" : "light", "the document theme follows the OS theme");
  return environment;
}

async function openWritingRow(session) {
  await session.open(WRITING_ROW);
  const title = session.page.getByLabel("Title", { exact: true });
  await session.expectValue(title, "Launch post");
  // The selected record is the one the address names.
  const selected = session.page.getByRole("group", { name: "Entries" }).getByRole("button", { name: /Launch post/ });
  await eventually(async () => assert.equal(await selected.getAttribute("aria-pressed"), "true", "the row the address names is selected"));
  return { title, body: session.page.getByLabel("Body", { exact: true }), revision: session.fixture.writing.get("launch-post").baseRevision };
}

const JOURNEYS = {
  /** Ticket 03: Leave stops for unsaved work, Keep editing keeps it, and Save goes through before leaving. */
  async "edit-and-leave"(session) {
    const { page } = session;
    const { title, revision } = await openWritingRow(session);
    await assertVariantEnvironment(session);

    await session.typeAtEnd(title, " revised");
    await session.expectValue(title, "Launch post revised");

    const leave = session.visible(page.getByRole("button", { name: "Leave editor" }));
    await session.activate(leave);
    const dialog = page.getByRole("dialog", { name: "Save or discard your changes?" });
    await dialog.waitFor({ timeout: STEP_TIMEOUT });
    await dialog.getByText("Writing: Launch post revised").waitFor();
    await eventually(async () => assert.equal((await session.focused())?.inDialog, true, "focus moves into the dialog"));

    // Escape is Keep editing: nothing is lost and focus returns to Leave.
    await page.keyboard.press("Escape");
    await dialog.waitFor({ state: "hidden" });
    assert.equal(new URL(page.url()).pathname, WRITING_ROW);
    await session.expectValue(title, "Launch post revised");
    await eventually(async () => assert.equal((await session.focused())?.label, "Leave editor", "focus returns to Leave"));
    assert.equal(session.fixture.requestsTo("POST", "/api/dev/writing-article").length, 0);

    await session.activate(leave);
    await dialog.waitFor();
    await session.activate(dialog.getByRole("button", { name: "Save as unpublished" }));
    const saved = await session.lastRequest("POST", "/api/dev/writing-article");
    assert.equal(saved.status, 200);
    assert.equal(saved.body.title, "Launch post revised");
    assert.equal(saved.body.status, "draft", "the dialog never publishes");
    assert.equal(saved.body.expectedRevision, revision);
    await page.waitForURL((url) => !url.pathname.startsWith("/dev"), { timeout: 60_000, waitUntil: "commit" });
    assert.equal(session.fixture.writing.get("launch-post").title, "Launch post revised");
  },

  /** Ticket 54: a reload keeps typed work in a recovery copy, and Restore brings it back without saving. */
  async "reload-and-recover"(session) {
    const { page } = session;
    const { body } = await openWritingRow(session);
    await assertVariantEnvironment(session);

    await session.typeAtEnd(body, " Kept.");
    await session.expectValue(body, "Post. Kept.");
    await page.getByText(/Unsaved changes kept in this browser at/).waitFor({ timeout: STEP_TIMEOUT });

    await page.reload({ waitUntil: "domcontentloaded" });
    assert.ok(session.unloadPrompts.length >= 1, "the reload asked before dropping unsaved work");
    await session.settle();
    const offer = page.getByRole("region", { name: "Recovered changes" });
    await offer.waitFor({ timeout: STEP_TIMEOUT });
    await offer.getByText(/from this browser, saved at/).waitFor();
    // Nothing is replaced until the editor chooses.
    await session.expectValue(body, "Post.");

    await session.press(offer.getByRole("button", { name: "Restore" }), "Enter");
    await session.expectValue(body, "Post. Kept.");
    await offer.waitFor({ state: "hidden" });
    assert.equal(session.fixture.requestsTo("POST", "/api/dev/writing-article").length, 0, "restoring never saves");
    // The restored draft is still unsaved, so it is kept again for the next reload.
    await page.getByText(/Unsaved changes kept in this browser at/).waitFor({ timeout: STEP_TIMEOUT });
  },

  /** An editor submits a proposal from Writing, finds it in the Queue, and reopens it from its link. */
  async "submit-and-reopen"(session) {
    const { page } = session;
    const { title, revision } = await openWritingRow(session);
    await assertVariantEnvironment(session);
    const submit = session.visible(page.getByRole("button", { name: "Submit for review" }));
    await submit.waitFor({ timeout: STEP_TIMEOUT });

    await session.typeAtEnd(title, " revised");
    await session.activate(submit);
    const sent = await session.lastRequest("POST", "/api/dev/proposals");
    assert.equal(sent.status, 200);
    assert.equal(sent.body.payload.writing.title, "Launch post revised");
    assert.equal(sent.body.baselines[0].document.baseRevision, revision);
    const proposalId = sent.response.proposalId;
    await page.getByText(`#${proposalId.slice(-6)}`).waitFor({ timeout: STEP_TIMEOUT });
    // The proposal holds the edit now; the editor is back on the saved version.
    await session.expectValue(title, "Launch post");
    assert.equal(session.fixture.requestsTo("POST", "/api/dev/writing-article").length, 0, "an editor's submit never saves directly");

    await session.activate(page.getByRole("link", { name: "View in queue" }));
    await page.waitForURL((url) => url.pathname === "/dev/queue", { timeout: 60_000 });
    await session.settle();
    const row = page.getByRole("button", { name: /Update blog post “Launch post revised”/ });
    await session.press(row, "Enter");
    await eventually(async () => assert.equal(await row.getAttribute("aria-pressed"), "true", "the chosen submission is selected"));
    await page.getByRole("heading", { name: "Submission details" }).waitFor();
    const opened = await session.lastRequest("GET", `/api/dev/proposals/${proposalId}`);
    assert.equal(opened.status, 200);

    // The reviewer opens the task link in a fresh browser: the same record is
    // selected, with the actions that review needs.
    session.fixture.setRole("admin");
    const reviewer = await openSession(session.browser, session.variantName, { fixture: session.fixture });
    try {
      await reviewer.open(`/dev/queue/${proposalId}`);
      const reopened = reviewer.page.getByRole("button", { name: /Update blog post “Launch post revised”/ });
      await eventually(async () => assert.equal(await reopened.getAttribute("aria-pressed"), "true", "the linked submission is selected after a fresh load"));
      await reviewer.page.getByRole("heading", { name: "Review", exact: true }).waitFor();
      await reviewer.visible(reviewer.page.getByRole("button", { name: /Approve/ })).waitFor({ timeout: STEP_TIMEOUT });
      const reread = await session.lastRequest("GET", `/api/dev/proposals/${proposalId}`, { count: 2 });
      assert.equal(reread.status, 200);
      assert.deepEqual(reviewer.pageErrors, []);
    } finally {
      await reviewer.close();
    }
  },

  /** Ticket 55: a stale save is refused, loading the latest version merges it, and the chosen draft saves against the newer revision. */
  async "conflict-and-reconcile"(session) {
    const { page } = session;
    const { title, revision } = await openWritingRow(session);
    await assertVariantEnvironment(session);

    await session.typeAtEnd(title, " mine");
    const theirs = session.fixture.simulateConcurrentEdit("launch-post", { title: "Launch post theirs" });

    await session.activate(session.visible(page.getByRole("button", { name: "Review changes" })));
    const review = page.getByLabel("Review document changes");
    await eventually(async () => assert.equal((await session.focused())?.label, "Review document changes", "focus moves to the review"));
    await session.activate(review.getByRole("button", { name: "Confirm save as unpublished" }));
    const refused = await session.lastRequest("POST", "/api/dev/writing-article");
    assert.equal(refused.status, 409);
    assert.equal(refused.body.expectedRevision, revision);
    await page.getByText("Someone saved this article after you loaded it.").first().waitFor();
    await session.expectValue(title, "Launch post mine");

    await session.activate(session.visible(page.getByRole("button", { name: "Load the latest saved version" })));
    const merge = page.getByRole("region", { name: "Review changes saved meanwhile" });
    await merge.waitFor({ timeout: STEP_TIMEOUT });
    const both = merge.getByRole("group", { name: "Title, changed by both" });
    await both.getByText("Launch post theirs").waitFor();
    const done = merge.getByRole("button", { name: "Done reviewing" });
    assert.equal(await done.isDisabled(), true, "the review holds until a version is chosen");
    await session.expectValue(title, "Launch post theirs");

    await session.press(both.getByRole("button", { name: "Use yours Title" }), "Enter");
    await session.expectValue(title, "Launch post mine");
    await session.activate(done);
    await merge.waitFor({ state: "hidden" });

    await session.activate(session.visible(page.getByRole("button", { name: "Review changes" })));
    await session.activate(review.getByRole("button", { name: "Confirm save as unpublished" }));
    const saved = await session.lastRequest("POST", "/api/dev/writing-article", { count: 2 });
    assert.equal(saved.status, 200);
    assert.equal(saved.body.expectedRevision, theirs);
    assert.equal(saved.body.title, "Launch post mine");
    await page.getByText(/Saved as a draft/).first().waitFor();
    assert.equal(session.fixture.writing.get("launch-post").title, "Launch post mine");
  },
};

/** Each tool state renders meaningful content, and a refused write keeps the draft. */
const STATE_EXPECTATIONS = {
  loaded: { writing: /Field notes/, queue: /Update article “Field notes”/ },
  empty: { writing: /Nothing written here yet\./, queue: /No submissions to review\./ },
  failed: { writing: /The fixture server could not load this/, queue: /Submissions could not be refreshed/ },
  "session-expired": { writing: /Authentication required\./, queue: /Authentication required\./ },
  frozen: { writing: /Field notes/, queue: /Update article “Field notes”/, save: 503, message: /Data writes are frozen/ },
  conflicted: { writing: /Field notes/, queue: /Update article “Field notes”/, save: 409, message: /Someone saved this article after you loaded it\./ },
};

async function runStateMatrix(browser, variantName) {
  const results = [];
  for (const state of TOOL_STATES) {
    results.push(await runCase(`state:${state}`, variantName, async () => {
      const session = await openSession(browser, variantName, { state });
      try {
        const expected = STATE_EXPECTATIONS[state];
        await session.open("/dev/writing");
        await session.page.getByText(expected.writing).first().waitFor({ timeout: STEP_TIMEOUT });
        if (expected.save) {
          const { title } = await openWritingRow(session);
          await session.typeAtEnd(title, " kept");
          await session.activate(session.visible(session.page.getByRole("button", { name: "Review changes" })));
          await session.activate(session.page.getByLabel("Review document changes").getByRole("button", { name: "Confirm save as unpublished" }));
          const refused = await session.lastRequest("POST", "/api/dev/writing-article");
          assert.equal(refused.status, expected.save);
          await session.page.getByText(expected.message).first().waitFor({ timeout: STEP_TIMEOUT });
          await session.expectValue(title, "Launch post kept");
        }
        await session.open("/dev/queue");
        await session.page.getByText(expected.queue).first().waitFor({ timeout: STEP_TIMEOUT });
        return session;
      } catch (error) {
        await capture(session, `state-${state}`, variantName);
        await session.close();
        throw error;
      }
    }, { closeAfter: true }));
  }
  return results;
}

/** What each role finds on Writing: an admin saves, an editor submits, the rest are told why they cannot. */
const ROLE_EXPECTATIONS = {
  admin: { button: "Review changes" },
  editor_translator: { button: "Submit for review" },
  editor: { button: "Submit for review" },
  translator: { text: /Editor role required/ },
  contributor: { text: /Editor role required/ },
};

async function runRoleMatrix(browser, variantName) {
  const results = [];
  for (const role of JOURNEY_ROLES) {
    results.push(await runCase(`role:${role}`, variantName, async () => {
      const session = await openSession(browser, variantName, { role });
      try {
        await session.open(WRITING_ROW);
        const expected = ROLE_EXPECTATIONS[role];
        if (expected.button) {
          await session.visible(session.page.getByRole("button", { name: expected.button })).waitFor({ timeout: STEP_TIMEOUT });
        } else {
          await session.page.getByText(expected.text).first().waitFor({ timeout: STEP_TIMEOUT });
          assert.equal(await session.page.getByLabel("Title", { exact: true }).count(), 0, `${role} gets no Writing editor`);
        }
        return session;
      } catch (error) {
        await capture(session, `role-${role}`, variantName);
        await session.close();
        throw error;
      }
    }, { closeAfter: true }));
  }
  return results;
}

async function capture(session, name, variantName) {
  const dir = resolve(values["artifacts-dir"]);
  mkdirSync(dir, { recursive: true });
  const path = resolve(dir, `${name}-${variantName}.png`);
  await session.page.screenshot({ path, fullPage: true }).catch(() => undefined);
  return path;
}

async function runCase(name, variantName, body, { closeAfter = false } = {}) {
  const started = Date.now();
  try {
    const session = await body();
    const unhandledWrites = session.fixture.unhandled.filter((entry) => entry.method !== "GET" && entry.method !== "HEAD");
    assert.deepEqual(unhandledWrites, [], "every write the journey made is one the fixture answers");
    assert.deepEqual(session.pageErrors, [], "no uncaught page error");
    if (closeAfter) await session.close();
    console.log(`ok   ${name} [${variantName}] ${Date.now() - started}ms`);
    return { name, variantName, ok: true };
  } catch (error) {
    console.log(`FAIL ${name} [${variantName}] ${Date.now() - started}ms`);
    console.log(`     ${String(error?.message ?? error).split("\n").join("\n     ")}`);
    return { name, variantName, ok: false, error };
  }
}

async function main() {
  if (values.help) {
    console.log(`Usage: npm run test:journeys -- [--base URL] [--only NAME]... [--variant NAME]... [--headed]

Journeys: ${Object.keys(JOURNEYS).join(", ")}, state-matrix, role-matrix
Variants: ${Object.keys(VARIANTS).join(", ")}
Start the server first with npm run dev:journeys-server.`);
    return 0;
  }
  assertLoopbackBase(values.base);
  const selected = values.only?.length ? values.only : [...Object.keys(JOURNEYS), "state-matrix", "role-matrix"];
  const variants = values.variant?.length ? values.variant : Object.keys(VARIANTS);
  for (const name of selected) {
    if (!(name in JOURNEYS) && name !== "state-matrix" && name !== "role-matrix") throw new Error(`Unknown journey: ${name}.`);
  }
  for (const name of variants) if (!(name in VARIANTS)) throw new Error(`Unknown variant: ${name}.`);

  const browser = await chromium.launch({ headless: !values.headed });
  const results = [];
  try {
    for (const variantName of variants) {
      for (const name of selected) {
        if (name === "state-matrix") {
          results.push(...await runStateMatrix(browser, variantName));
          continue;
        }
        if (name === "role-matrix") {
          results.push(...await runRoleMatrix(browser, variantName));
          continue;
        }
        const role = name === "submit-and-reopen" ? "editor" : "admin";
        results.push(await runCase(name, variantName, async () => {
          const session = await openSession(browser, variantName, { role });
          try {
            await JOURNEYS[name](session);
            return session;
          } catch (error) {
            const shot = await capture(session, name, variantName);
            error.message += `\n(screenshot: ${shot})`;
            await session.close();
            throw error;
          }
        }, { closeAfter: true }));
      }
    }
  } finally {
    await browser.close();
  }
  const failed = results.filter((result) => !result.ok);
  console.log(`\n${results.length - failed.length} passed, ${failed.length} failed`);
  return failed.length ? 1 : 0;
}

process.exitCode = await main();
