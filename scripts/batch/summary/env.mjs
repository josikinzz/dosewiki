import { readFileSync } from "fs";
import { resolve } from "path";

export function loadEnvLocal(projectRoot, env = process.env) {
  try {
    const envPath = resolve(projectRoot, ".env.local");
    const content = readFileSync(envPath, "utf8");
    for (const line of content.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const separatorIndex = trimmed.indexOf("=");
      if (separatorIndex === -1) continue;
      const key = trimmed.slice(0, separatorIndex);
      const value = trimmed.slice(separatorIndex + 1);
      if (!env[key]) {
        env[key] = value;
      }
    }
  } catch {
    // .env.local is optional
  }
}
