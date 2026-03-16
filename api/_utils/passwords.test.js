import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const ORIGINAL_ENV = { ...process.env };

describe("password utilities", () => {
  beforeEach(() => {
    vi.resetModules();
    process.env = { ...ORIGINAL_ENV };
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it("accepts matching configured credentials", async () => {
    process.env.JOSIE = "secret-password";

    const { verifyCredentials } = await import("./passwords.js");

    expect(verifyCredentials("JOSIE", "secret-password")).toBe(true);
    expect(verifyCredentials(" JOSIE ", " secret-password ")).toBe(true);
  });

  it("rejects unknown usernames", async () => {
    process.env.JOSIE = "secret-password";

    const { verifyCredentials } = await import("./passwords.js");

    expect(verifyCredentials("UNKNOWN_USER", "secret-password")).toBe(false);
  });

  it("finds password keys by value", async () => {
    process.env.JOSIE = "secret-password";

    const { findPasswordKey } = await import("./passwords.js");

    expect(findPasswordKey("secret-password")).toBe("JOSIE");
    expect(findPasswordKey("wrong-password")).toBeNull();
  });
});
