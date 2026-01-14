/**
 * Prebuild orchestrator - runs prebuild scripts in parallel groups.
 *
 * Group A (parallel): generateEmbedLogo.mjs, buildCompressedArticles.mjs
 * Group B (parallel, after A): buildSocialSharePages.mjs, buildArticleSources.mjs, generateSitemap.mjs
 *
 * This provides faster builds compared to sequential execution while respecting
 * dependencies (Group B scripts may depend on compressed articles from Group A).
 */

import { spawn } from "child_process";
import { fileURLToPath } from "url";
import path from "path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Run a script and return a promise that resolves when complete.
 */
function runScript(scriptPath) {
  return new Promise((resolve, reject) => {
    const scriptName = path.basename(scriptPath);
    console.log(`[prebuild] Starting: ${scriptName}`);
    const startTime = Date.now();

    const child = spawn("node", [scriptPath], {
      stdio: "inherit",
      cwd: path.resolve(__dirname, "../.."),
    });

    child.on("close", (code) => {
      const duration = Date.now() - startTime;
      if (code === 0) {
        console.log(`[prebuild] Completed: ${scriptName} (${duration}ms)`);
        resolve();
      } else {
        reject(new Error(`${scriptName} exited with code ${code}`));
      }
    });

    child.on("error", (err) => {
      reject(new Error(`Failed to start ${scriptName}: ${err.message}`));
    });
  });
}

/**
 * Run a group of scripts in parallel.
 */
async function runGroup(scripts, groupName) {
  console.log(`[prebuild] Running ${groupName}...`);
  const startTime = Date.now();

  await Promise.all(scripts.map((script) => runScript(path.join(__dirname, script))));

  const duration = Date.now() - startTime;
  console.log(`[prebuild] ${groupName} completed (${duration}ms)`);
}

async function main() {
  const args = process.argv.slice(2);
  const skipSitemap = args.includes("--no-sitemap");

  const totalStart = Date.now();
  console.log("[prebuild] Starting prebuild...");

  try {
    // Group A: Independent scripts that can run in parallel
    // generateEmbedLogo and buildCompressedArticles have no interdependencies
    await runGroup(
      ["generateEmbedLogo.mjs", "buildCompressedArticles.mjs"],
      "Group A"
    );

    // Group B: Scripts that may depend on compressed articles
    // These run after Group A completes
    const groupBScripts = ["buildSocialSharePages.mjs", "buildArticleSources.mjs"];
    if (!skipSitemap) {
      groupBScripts.push("generateSitemap.mjs");
    }
    await runGroup(groupBScripts, "Group B");

    const totalDuration = Date.now() - totalStart;
    console.log(`[prebuild] All prebuild tasks completed (${totalDuration}ms)`);
  } catch (error) {
    console.error("[prebuild] Error:", error.message);
    process.exit(1);
  }
}

main();
