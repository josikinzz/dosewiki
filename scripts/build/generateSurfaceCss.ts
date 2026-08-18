#!/usr/bin/env bun
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { argv, cwd, exit, stderr, stdout } from "node:process";
import { SURFACE_STYLESHEET_PATH, buildSurfaceStylesheetCss } from "../../src/theme/surfaceStylesheet";

const target = resolve(cwd(), SURFACE_STYLESHEET_PATH);
const next = buildSurfaceStylesheetCss();
const checkOnly = argv.includes("--check");
let current: string | null = null;
try { current = readFileSync(target, "utf8"); } catch { current = null; }
if (current === next) { stdout.write(`${SURFACE_STYLESHEET_PATH} is up to date.\n`); exit(0); }
if (checkOnly) { stderr.write(`${SURFACE_STYLESHEET_PATH} is stale. Run: npm run generate:surface-css\n`); exit(1); }
writeFileSync(target, next, "utf8");
stdout.write(`Wrote ${SURFACE_STYLESHEET_PATH}.\n`);
