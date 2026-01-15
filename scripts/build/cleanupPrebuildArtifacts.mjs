import { rm } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "../..");
const SHARE_OUTPUT_DIR = resolve(ROOT, "public/share");

const main = async () => {
  await rm(SHARE_OUTPUT_DIR, { recursive: true, force: true });
  console.log(`[cleanup] Removed ${SHARE_OUTPUT_DIR}`);
};

main().catch((error) => {
  console.error("[cleanup] Failed to remove prebuild artifacts:", error.message);
  process.exit(1);
});
