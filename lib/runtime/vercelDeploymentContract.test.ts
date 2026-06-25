import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("Vercel deployment package contract", () => {
  it("keeps compiled Next server pages loadable by Vercel's CommonJS launcher", () => {
    const packageJson = JSON.parse(readFileSync(join(process.cwd(), "package.json"), "utf8")) as {
      type?: string;
    };

    expect(packageJson.type).not.toBe("module");
  });
});
