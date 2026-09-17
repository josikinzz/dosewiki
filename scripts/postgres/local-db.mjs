#!/usr/bin/env node
/**
 * Project-local Postgres cluster for migration rehearsal.
 *
 *   node scripts/postgres/local-db.mjs init     # initdb into .postgres/ and create the dosewiki database
 *   node scripts/postgres/local-db.mjs start    # pg_ctl start on POSTGRES_LOCAL_PORT (default 5432)
 *   node scripts/postgres/local-db.mjs stop
 *   node scripts/postgres/local-db.mjs status
 *   node scripts/postgres/local-db.mjs url      # print the connection URL
 *
 * The data directory is ignored by Git. This is not a production target;
 * PlanetScale credentials are supplied through POSTGRES_DIRECT_URL and
 * POSTGRES_POOLED_URL, never through this script.
 */

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const DATA_DIR = path.join(ROOT, ".postgres");
const LOG_FILE = path.join(DATA_DIR, "postgres.log");
const PORT = process.env.POSTGRES_LOCAL_PORT ?? "5432";
const DATABASE = "dosewiki";
const URL = `postgres://localhost:${PORT}/${DATABASE}`;

function run(command, args, { allowFailure = false } = {}) {
  const result = spawnSync(command, args, { stdio: "inherit" });
  if (result.error) {
    console.error(`${command} failed to start: ${result.error.message}`);
    process.exit(1);
  }
  if (result.status !== 0 && !allowFailure) process.exit(result.status ?? 1);
  return result.status ?? 0;
}

function isRunning() {
  return spawnSync("pg_ctl", ["status", "-D", DATA_DIR], { stdio: "ignore" }).status === 0;
}

const command = process.argv[2];
switch (command) {
  case "init": {
    if (fs.existsSync(path.join(DATA_DIR, "PG_VERSION"))) {
      console.log(`Cluster already initialised at ${DATA_DIR}`);
    } else {
      run("initdb", ["-D", DATA_DIR, "--encoding=UTF8", "--locale=C", "--auth=trust"]);
    }
    if (!isRunning()) run("pg_ctl", ["start", "-D", DATA_DIR, "-l", LOG_FILE, "-o", `-p ${PORT}`, "-w"]);
    const exists = spawnSync("psql", ["-h", "localhost", "-p", PORT, "-d", "postgres", "-tAc", `SELECT 1 FROM pg_database WHERE datname='${DATABASE}'`], { encoding: "utf8" });
    if (exists.stdout.trim() !== "1") run("createdb", ["-h", "localhost", "-p", PORT, DATABASE]);
    console.log(URL);
    break;
  }
  case "start":
    if (isRunning()) console.log("Already running");
    else run("pg_ctl", ["start", "-D", DATA_DIR, "-l", LOG_FILE, "-o", `-p ${PORT}`, "-w"]);
    console.log(URL);
    break;
  case "stop":
    run("pg_ctl", ["stop", "-D", DATA_DIR, "-m", "fast"], { allowFailure: true });
    break;
  case "status": {
    const status = run("pg_ctl", ["status", "-D", DATA_DIR], { allowFailure: true });
    process.exitCode = status;
    break;
  }
  case "url":
    console.log(URL);
    break;
  default:
    console.error("Usage: local-db.mjs <init|start|stop|status|url>");
    process.exit(2);
}
