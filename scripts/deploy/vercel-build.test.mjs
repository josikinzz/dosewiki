/**
 * The build wrapper's decision table is the whole security argument for putting
 * a Convex deploy in a build command that TWO Vercel projects share — the full
 * app and the deliberately read-only Effect Index publication deployment. It
 * cannot be exercised from a workstation, so it is asserted here instead.
 */

import assert from "node:assert/strict";
import test from "node:test";
import { planBuild } from "./vercel-build.mjs";

const PROD_KEY = "prod:glad-minnow-656|not-a-real-secret";
const PREVIEW_KEY = "preview:team:dosewiki|not-a-real-secret";

test("Effect Index (no deploy key) still builds, and never deploys Convex", () => {
  const plan = planBuild({ VERCEL: "1", VERCEL_ENV: "production" });
  assert.equal(plan.mode, "verify");
  assert.equal(plan.deployKey, null);
});

test("the full app's production build deploys Convex before building", () => {
  const plan = planBuild({ VERCEL: "1", VERCEL_ENV: "production", CONVEX_DEPLOY_KEY: PROD_KEY });
  assert.equal(plan.mode, "deploy");
  assert.equal(plan.deployKey, PROD_KEY);
  assert.equal(plan.strictPreDeployCheck, true);
});

test("silent-deletion guard can be waived only by an explicit environment opt-out", () => {
  const plan = planBuild({
    VERCEL: "1",
    VERCEL_ENV: "production",
    CONVEX_DEPLOY_KEY: PROD_KEY,
    CONVEX_DEPLOY_ALLOW_FUNCTION_DELETION: "1",
  });
  assert.equal(plan.mode, "deploy");
  assert.equal(plan.strictPreDeployCheck, false);
});

test("a production deploy key on a preview build never publishes", () => {
  const plan = planBuild({ VERCEL: "1", VERCEL_ENV: "preview", CONVEX_DEPLOY_KEY: PROD_KEY });
  assert.equal(plan.mode, "verify");
  assert.equal(plan.deployKey, null);
  assert.equal(plan.warnAgainstProductionUsing, PROD_KEY);
});

test("a preview deploy key on a preview build deploys to its own preview deployment", () => {
  const plan = planBuild({ VERCEL: "1", VERCEL_ENV: "preview", CONVEX_DEPLOY_KEY: PREVIEW_KEY });
  assert.equal(plan.mode, "deploy");
  assert.equal(plan.strictPreDeployCheck, false);
});

test("a preview deploy key on a production build refuses rather than mis-targeting", () => {
  const plan = planBuild({ VERCEL: "1", VERCEL_ENV: "production", CONVEX_DEPLOY_KEY: PREVIEW_KEY });
  assert.equal(plan.mode, "refuse");
});

test("a workstation never deploys from the build command, even holding a key", () => {
  const plan = planBuild({ CONVEX_DEPLOY_KEY: PROD_KEY });
  assert.equal(plan.mode, "verify");
  assert.equal(plan.deployKey, null);
});
